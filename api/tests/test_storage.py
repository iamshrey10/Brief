import pytest
from botocore.exceptions import ClientError

from app import storage
from app.storage import UploadMissingError, file_matches_type, inspect_upload

PDF = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n"
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF"
PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
HEIC = b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00"


@pytest.mark.parametrize(
    ("content_type", "head"),
    [
        ("application/pdf", PDF),
        ("image/jpeg", JPEG),
        ("image/png", PNG),
        ("image/heic", HEIC),
        ("image/heic", b"\x00\x00\x00\x18ftypmif1\x00\x00\x00\x00"),
    ],
)
def test_a_file_that_starts_like_its_claimed_type_is_accepted(content_type, head):
    assert file_matches_type(content_type, head) is True


@pytest.mark.parametrize(
    ("content_type", "head"),
    [
        ("application/pdf", JPEG),
        ("application/pdf", b"MZ\x90\x00 an executable"),
        ("application/pdf", b"<html><script>alert(1)</script>"),
        ("image/jpeg", PDF),
        ("image/png", JPEG),
        ("image/heic", PNG),
        ("image/jpeg", b"\xff\xd8\x00\x00 almost a jpeg marker"),
        ("image/png", b"\x89PNG\x00\x00\x00\x00 almost a png marker"),
        ("image/heic", b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00"),  # a video, not an image
        ("application/pdf", b""),
        ("application/x-msdownload", PDF),  # a type that was never allowed
    ],
)
def test_a_file_that_does_not_start_like_its_claimed_type_is_refused(content_type, head):
    assert file_matches_type(content_type, head) is False


def test_the_pdf_marker_must_be_at_the_very_start():
    assert file_matches_type("application/pdf", b"junk" + PDF) is False


class _FakeS3:
    def __init__(self, size=5, body=PDF, error=None):
        self.size, self.body, self.error = size, body, error
        self.ranges: list[str] = []

    def head_object(self, Bucket, Key):
        if self.error:
            raise self.error
        return {"ContentLength": self.size}

    def get_object(self, Bucket, Key, Range):
        self.ranges.append(Range)
        return {"Body": type("Body", (), {"read": lambda _self: self.body[:32]})()}


def _client_error(code):
    return ClientError({"Error": {"Code": code}}, "HeadObject")


def test_inspect_upload_reports_the_real_size_and_the_first_bytes(monkeypatch):
    fake = _FakeS3(size=123456, body=PDF + b"x" * 100)
    monkeypatch.setattr(storage, "get_client", lambda: fake)

    info = inspect_upload("user/key.pdf")

    assert info.size == 123456
    assert info.head.startswith(b"%PDF-")
    assert len(info.head) <= 32
    assert fake.ranges == ["bytes=0-31"]  # only the start of the file is read, never all of it


@pytest.mark.parametrize("code", ["404", "NoSuchKey", "NotFound"])
def test_a_file_that_was_never_uploaded_is_reported_as_missing(monkeypatch, code):
    monkeypatch.setattr(storage, "get_client", lambda: _FakeS3(error=_client_error(code)))

    with pytest.raises(UploadMissingError):
        inspect_upload("user/never.pdf")


def test_another_storage_error_is_not_mistaken_for_a_missing_file(monkeypatch):
    monkeypatch.setattr(storage, "get_client", lambda: _FakeS3(error=_client_error("InternalError")))

    with pytest.raises(ClientError):
        inspect_upload("user/key.pdf")
