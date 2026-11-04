import uuid
from dataclasses import dataclass

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import settings
from app.folders import FOLDERS

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/heic",
}
PRESIGNED_URL_EXPIRY_SECONDS = 300

_client = None


def get_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint_url,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
    return _client


def build_storage_key(user_id: str, filename: str, folder: str = "Other") -> str:
    """Where a file is kept: this person's part of storage, then the folder, then a name no other file can share."""
    if folder not in FOLDERS:
        raise ValueError(f"unknown folder: {folder!r}")
    safe_name = filename.replace("/", "_").replace("\\", "_")
    return f"{user_id}/{folder}/{uuid.uuid4()}-{safe_name}"


def key_in_folder(storage_key: str, user_id: str, folder: str) -> str:
    """The key the same file has once it is in another folder: the person's part and the file's own name stay, the folder changes.
    A key that is not inside this person's own part is refused, so nothing of anyone else's can ever be moved."""
    if folder not in FOLDERS:
        raise ValueError(f"unknown folder: {folder!r}")
    prefix = f"{user_id}/"
    if not storage_key.startswith(prefix):
        raise ValueError("that file is not in this person's part of storage")
    return f"{prefix}{folder}/{storage_key.rsplit('/', 1)[-1]}"


def copy_file(source_key: str, target_key: str) -> None:
    """Makes a second copy of a file under another key, leaving the first where it is."""
    get_client().copy_object(
        Bucket=settings.r2_bucket_name,
        Key=target_key,
        CopySource={"Bucket": settings.r2_bucket_name, "Key": source_key},
    )


def create_presigned_upload_url(storage_key: str, content_type: str) -> str:
    return get_client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.r2_bucket_name,
            "Key": storage_key,
            "ContentType": content_type,
        },
        ExpiresIn=PRESIGNED_URL_EXPIRY_SECONDS,
    )


def create_presigned_view_url(storage_key: str, content_type: str, filename: str) -> str:
    """A short-lived link that shows the original file in the browser (inline, not as a download)."""
    safe_name = "".join(ch for ch in filename if ch.isalnum() or ch in " ._-") or "document"
    return get_client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.r2_bucket_name,
            "Key": storage_key,
            "ResponseContentType": content_type,
            "ResponseContentDisposition": f'inline; filename="{safe_name}"',
        },
        ExpiresIn=PRESIGNED_URL_EXPIRY_SECONDS,
    )


class UploadMissingError(Exception):
    """The file the browser said it uploaded is not in storage."""


@dataclass
class UploadInfo:
    size: int
    head: bytes  # the first few bytes, enough to tell what kind of file it really is


# How much of the start of a file is read to tell what it is. The whole file is never read here.
HEAD_BYTES = 32

_HEIC_BRANDS = {b"heic", b"heix", b"heim", b"heis", b"hevc", b"hevx", b"hevm", b"hevs", b"mif1", b"msf1"}


def file_matches_type(content_type: str, head: bytes) -> bool:
    """Whether the first bytes of a file are what its claimed type starts with. The type the browser
    sends is only a claim, so this is the check that it is true before the file is ever opened."""
    if content_type == "application/pdf":
        return head.startswith(b"%PDF-")
    if content_type == "image/jpeg":
        return head.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/heic":
        return head[4:8] == b"ftyp" and head[8:12] in _HEIC_BRANDS
    return False


def inspect_upload(storage_key: str) -> UploadInfo:
    """The real size of an uploaded file and its first bytes, as storage holds them, not as the
    browser claimed. Raises UploadMissingError if nothing was uploaded."""
    client = get_client()
    try:
        size = client.head_object(Bucket=settings.r2_bucket_name, Key=storage_key)["ContentLength"]
        body = client.get_object(
            Bucket=settings.r2_bucket_name, Key=storage_key, Range=f"bytes=0-{HEAD_BYTES - 1}"
        )["Body"]
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
            raise UploadMissingError(storage_key) from error
        raise
    return UploadInfo(size=size, head=body.read())


def download_file(storage_key: str) -> bytes:
    response = get_client().get_object(Bucket=settings.r2_bucket_name, Key=storage_key)
    return response["Body"].read()


def delete_file(storage_key: str) -> None:
    """Removes a file from storage. Deleting a key that is already gone succeeds, so a delete that
    is tried again after a failure is safe."""
    get_client().delete_object(Bucket=settings.r2_bucket_name, Key=storage_key)
