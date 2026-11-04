import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

import app.filing as filing
import app.main as main_module
from app import storage
from app.auth import get_current_user
from app.filing import FilingError, file_document, refile_existing
from app.folders import FOLDER_FOR_KIND, FOLDERS, folder_for
from app.main import app
from app.models import Document, User
from app.storage import UploadInfo, UploadMissingError, build_storage_key, key_in_folder
from tests.test_documents_api import _upload_named


@pytest_asyncio.fixture
async def client(test_user):
    async def current():
        return test_user

    app.dependency_overrides[get_current_user] = current
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


class FakeStorage:
    """A bucket in memory: key to size. Copying, checking and removing behave as the real ones do."""

    def __init__(self, monkeypatch):
        self.files: dict[str, int] = {}
        self.calls: list[tuple[str, str]] = []
        self.fail_copy = False
        self.fail_delete_of: set[str] = set()
        self.short_copy = False
        monkeypatch.setattr(filing, "inspect_upload", self.inspect)
        monkeypatch.setattr(filing, "copy_file", self.copy)
        monkeypatch.setattr(filing, "delete_file", self.delete)

    def inspect(self, key):
        if key not in self.files:
            raise UploadMissingError(key)
        return UploadInfo(size=self.files[key], head=b"%PDF-")

    def copy(self, source, target):
        self.calls.append(("copy", target))
        if self.fail_copy:
            raise RuntimeError("storage is down")
        self.files[target] = self.files[source] - (1 if self.short_copy else 0)

    def delete(self, key):
        self.calls.append(("delete", key))
        if key in self.fail_delete_of:
            raise RuntimeError("cannot delete")
        self.files.pop(key, None)


@pytest.fixture
def bucket(monkeypatch):
    return FakeStorage(monkeypatch)


async def stored_document(db_session, user, key, *, folder="Lease", status="ready", kind="lease") -> Document:
    document = Document(
        user_id=user.id, filename="lease.pdf", doc_type=kind, status=status, storage_key=key, folder=folder, file_size_bytes=100
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)
    return document


# --- the folders and the keys ---


def test_there_are_five_folders_and_each_kind_has_one():
    assert FOLDERS == ("Lease", "Education_Loan", "Job_Offers", "Personal_Documents", "Other")
    assert FOLDER_FOR_KIND == {"lease": "Lease", "loan": "Education_Loan", "offer": "Job_Offers", "other": "Other"}


@pytest.mark.parametrize(
    "kind,chosen,expected",
    [
        ("lease", None, "Lease"),
        ("loan", None, "Education_Loan"),
        ("offer", None, "Job_Offers"),
        ("other", None, "Other"),
        ("lease", "Personal_Documents", "Personal_Documents"),
        ("other", "Job_Offers", "Job_Offers"),
        ("lease", "../../etc", "Lease"),
        ("mystery", None, "Other"),
    ],
)
def test_the_folder_is_the_one_chosen_if_it_is_real_else_the_one_for_the_kind(kind, chosen, expected):
    assert folder_for(kind, chosen) == expected


def test_a_key_is_the_persons_part_then_the_folder_then_a_unique_name():
    one = build_storage_key("u1", "lease.pdf", "Lease")
    two = build_storage_key("u1", "lease.pdf", "Lease")

    assert one.startswith("u1/Lease/") and one.endswith("-lease.pdf")
    assert one != two
    assert build_storage_key("u1", "a.pdf").startswith("u1/Other/")


@pytest.mark.parametrize("folder", ["", "lease", "Lease/../x", "../Lease", "Leases", "Other\x00"])
def test_a_key_is_never_built_for_a_folder_that_is_not_one_of_the_five(folder):
    with pytest.raises(ValueError):
        build_storage_key("u1", "a.pdf", folder)


def test_a_file_name_cannot_add_path_parts_with_slashes_or_backslashes():
    key = build_storage_key("u1", "..\\..\\x/y.pdf", "Lease")

    assert key.count("/") == 2 and "\\" not in key


def test_moving_a_key_changes_only_the_folder_and_keeps_the_files_own_name():
    assert key_in_folder("u1/Lease/abc-lease.pdf", "u1", "Other") == "u1/Other/abc-lease.pdf"
    # A file kept the old way, straight under its owner.
    assert key_in_folder("u1/abc-lease.pdf", "u1", "Lease") == "u1/Lease/abc-lease.pdf"


def test_a_key_that_is_not_the_persons_own_is_never_moved_and_a_false_folder_is_refused():
    with pytest.raises(ValueError, match="not in this person"):
        key_in_folder("u2/Lease/abc-x.pdf", "u1", "Other")
    with pytest.raises(ValueError, match="not in this person"):
        key_in_folder("u10/Lease/abc-x.pdf", "u1", "Other")
    with pytest.raises(ValueError, match="unknown folder"):
        key_in_folder("u1/Lease/abc-x.pdf", "u1", "../u2")


def test_copying_a_file_asks_the_bucket_to_copy_within_the_one_bucket(monkeypatch):
    seen = {}

    class Client:
        def copy_object(self, **kwargs):
            seen.update(kwargs)

    monkeypatch.setattr(storage, "get_client", lambda: Client())

    storage.copy_file("u1/a", "u1/Lease/a")

    assert seen["Key"] == "u1/Lease/a"
    assert seen["CopySource"]["Key"] == "u1/a"
    assert seen["CopySource"]["Bucket"] == seen["Bucket"]


# --- uploading into a folder ---


@pytest.mark.parametrize(
    "kind,folder",
    [("lease", "Lease"), ("loan", "Education_Loan"), ("offer", "Job_Offers"), ("other", "Other")],
)
async def test_an_upload_goes_in_the_folder_for_its_kind_and_the_list_says_so(client, db_session, test_user, kind, folder):
    response = await client.post("/documents", json={**_upload_named("a.pdf"), "doc_type": kind})

    document = await db_session.get(Document, uuid.UUID(response.json()["document_id"]))
    assert document.folder == folder
    assert document.storage_key.startswith(f"{test_user.id}/{folder}/")
    listed = (await client.get("/documents")).json()
    assert [d["folder"] for d in listed] == [folder]


async def test_a_chosen_folder_wins_over_the_kind(client, db_session, test_user):
    response = await client.post("/documents", json={**_upload_named("a.pdf"), "doc_type": "other", "folder": "Personal_Documents"})

    document = await db_session.get(Document, uuid.UUID(response.json()["document_id"]))
    assert document.folder == "Personal_Documents"
    assert document.storage_key.startswith(f"{test_user.id}/Personal_Documents/")


@pytest.mark.parametrize("folder", ["", "lease", "../x", "Lease/../../u2", "Nope"])
async def test_an_upload_into_a_folder_that_is_not_one_of_the_five_is_refused_and_leaves_nothing(client, db_session, test_user, folder):
    response = await client.post("/documents", json={**_upload_named("a.pdf"), "folder": folder})

    assert response.status_code == 400
    assert response.json()["detail"] == "unknown folder"
    assert (await db_session.execute(select(Document).where(Document.user_id == test_user.id))).scalars().all() == []


# --- moving ---


async def test_moving_copies_then_points_the_record_at_the_copy_then_removes_the_first(client, db_session, test_user, bucket):
    old = f"{test_user.id}/Lease/abc-lease.pdf"
    bucket.files[old] = 100
    document = await stored_document(db_session, test_user, old)

    response = await client.post(f"/documents/{document.id}/move", json={"folder": "Personal_Documents"})

    assert response.status_code == 200
    assert response.json()["folder"] == "Personal_Documents"
    new = f"{test_user.id}/Personal_Documents/abc-lease.pdf"
    assert bucket.calls == [("copy", new), ("delete", old)]
    assert bucket.files == {new: 100}
    await db_session.refresh(document)
    assert (document.folder, document.storage_key) == ("Personal_Documents", new)


async def test_a_moved_document_is_viewed_and_deleted_at_its_new_place(client, db_session, test_user, bucket, monkeypatch):
    old = f"{test_user.id}/Lease/abc-lease.pdf"
    bucket.files[old] = 100
    document = await stored_document(db_session, test_user, old)
    await client.post(f"/documents/{document.id}/move", json={"folder": "Other"})
    asked = []
    monkeypatch.setattr(main_module, "create_presigned_view_url", lambda *args: asked.append(args) or "https://x")

    await client.get(f"/documents/{document.id}/file")

    assert asked[0][0] == f"{test_user.id}/Other/abc-lease.pdf"


async def test_moving_into_the_folder_it_is_already_in_changes_nothing_and_touches_no_file(client, db_session, test_user, bucket):
    key = f"{test_user.id}/Lease/abc-lease.pdf"
    bucket.files[key] = 100
    document = await stored_document(db_session, test_user, key)

    response = await client.post(f"/documents/{document.id}/move", json={"folder": "Lease"})

    assert response.status_code == 200
    assert bucket.calls == [] and bucket.files == {key: 100}


async def test_a_file_kept_the_old_way_is_filed_when_moved(client, db_session, test_user, bucket):
    old = f"{test_user.id}/abc-lease.pdf"
    bucket.files[old] = 100
    document = await stored_document(db_session, test_user, old)

    await client.post(f"/documents/{document.id}/move", json={"folder": "Lease"})

    assert bucket.files == {f"{test_user.id}/Lease/abc-lease.pdf": 100}


@pytest.mark.parametrize("folder", ["", "lease", "../x", "Nope"])
async def test_moving_to_a_folder_that_is_not_one_of_the_five_is_refused_and_nothing_is_touched(client, db_session, test_user, bucket, folder):
    key = f"{test_user.id}/Lease/abc-lease.pdf"
    bucket.files[key] = 100
    document = await stored_document(db_session, test_user, key)

    assert (await client.post(f"/documents/{document.id}/move", json={"folder": folder})).status_code == 400
    assert bucket.calls == []


async def test_a_document_still_uploading_cannot_be_moved(client, db_session, test_user, bucket):
    document = await stored_document(db_session, test_user, f"{test_user.id}/Lease/abc.pdf", status="pending")

    response = await client.post(f"/documents/{document.id}/move", json={"folder": "Other"})

    assert response.status_code == 409
    assert bucket.calls == []


async def test_nobody_can_move_another_persons_document_or_one_in_the_bin(client, db_session, test_user, bucket):
    other = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other)
    await db_session.commit()
    theirs = await stored_document(db_session, other, f"{other.id}/Lease/abc.pdf")
    binned = await stored_document(db_session, test_user, f"{test_user.id}/Lease/def.pdf")
    binned.deleted_at = datetime.now(timezone.utc)
    await db_session.commit()

    assert (await client.post(f"/documents/{theirs.id}/move", json={"folder": "Other"})).status_code == 404
    assert (await client.post(f"/documents/{binned.id}/move", json={"folder": "Other"})).status_code == 404
    assert (await client.post("/documents/not-an-id/move", json={"folder": "Other"})).status_code == 404
    assert bucket.calls == []


async def test_a_copy_that_fails_leaves_the_file_and_the_record_exactly_as_they_were(client, db_session, test_user, bucket):
    old = f"{test_user.id}/Lease/abc-lease.pdf"
    bucket.files[old] = 100
    bucket.fail_copy = True
    document = await stored_document(db_session, test_user, old)

    response = await client.post(f"/documents/{document.id}/move", json={"folder": "Other"})

    assert response.status_code == 502
    assert "still where it was" in response.json()["detail"]
    await db_session.refresh(document)
    assert (document.folder, document.storage_key) == ("Lease", old)
    assert bucket.files == {old: 100}


async def test_a_copy_of_the_wrong_size_is_removed_and_the_original_stays(client, db_session, test_user, bucket):
    old = f"{test_user.id}/Lease/abc-lease.pdf"
    bucket.files[old] = 100
    bucket.short_copy = True
    document = await stored_document(db_session, test_user, old)

    response = await client.post(f"/documents/{document.id}/move", json={"folder": "Other"})

    assert response.status_code == 502
    assert bucket.files == {old: 100}
    await db_session.refresh(document)
    assert document.storage_key == old


async def test_a_bad_copy_that_cannot_be_removed_still_leaves_the_original_in_use(client, db_session, test_user, bucket):
    old = f"{test_user.id}/Lease/abc-lease.pdf"
    new = f"{test_user.id}/Other/abc-lease.pdf"
    bucket.files[old] = 100
    bucket.short_copy = True
    bucket.fail_delete_of = {new}
    document = await stored_document(db_session, test_user, old)

    assert (await client.post(f"/documents/{document.id}/move", json={"folder": "Other"})).status_code == 502
    await db_session.refresh(document)
    assert document.storage_key == old


async def test_a_file_missing_from_storage_is_reported_and_not_pretended_moved(client, db_session, test_user, bucket):
    document = await stored_document(db_session, test_user, f"{test_user.id}/Lease/gone.pdf")

    assert (await client.post(f"/documents/{document.id}/move", json={"folder": "Other"})).status_code == 502
    await db_session.refresh(document)
    assert document.folder == "Lease"


async def test_a_first_copy_that_cannot_be_removed_afterwards_does_not_fail_the_move(client, db_session, test_user, bucket):
    old = f"{test_user.id}/Lease/abc-lease.pdf"
    bucket.files[old] = 100
    bucket.fail_delete_of = {old}
    document = await stored_document(db_session, test_user, old)

    response = await client.post(f"/documents/{document.id}/move", json={"folder": "Other"})

    assert response.status_code == 200
    await db_session.refresh(document)
    assert document.storage_key == f"{test_user.id}/Other/abc-lease.pdf"


async def test_a_record_pointing_outside_the_persons_own_part_is_never_moved(db_session, test_user, bucket):
    other_key = "someone-else/Lease/abc.pdf"
    bucket.files[other_key] = 100
    document = await stored_document(db_session, test_user, other_key)

    with pytest.raises(ValueError):
        await file_document(db_session, document, "Other")
    assert bucket.calls == []


async def test_filing_raises_filing_error_when_storage_is_down(db_session, test_user, bucket):
    old = f"{test_user.id}/Lease/abc.pdf"
    bucket.files[old] = 1
    bucket.fail_copy = True
    document = await stored_document(db_session, test_user, old)

    with pytest.raises(FilingError):
        await file_document(db_session, document, "Other")


# --- filing what was kept the old way ---


async def test_files_kept_the_old_way_are_moved_into_their_folders_and_the_rest_left_alone(db_session, test_user, bucket):
    old = f"{test_user.id}/abc-lease.pdf"
    placed = f"{test_user.id}/Education_Loan/def-loan.pdf"
    waiting = f"{test_user.id}/ghi.pdf"
    bucket.files.update({old: 10, placed: 10, waiting: 10})
    await stored_document(db_session, test_user, old)
    await stored_document(db_session, test_user, placed, folder="Education_Loan", kind="loan")
    await stored_document(db_session, test_user, waiting, status="pending")

    moved = await refile_existing(db_session)

    assert moved == 1
    assert set(bucket.files) == {f"{test_user.id}/Lease/abc-lease.pdf", placed, waiting}
    assert await refile_existing(db_session) == 0


async def test_one_file_that_cannot_be_moved_does_not_stop_the_others(db_session, test_user, bucket):
    missing = f"{test_user.id}/missing.pdf"
    fine = f"{test_user.id}/fine.pdf"
    bucket.files[fine] = 10
    await stored_document(db_session, test_user, missing)
    await stored_document(db_session, test_user, fine)

    assert await refile_existing(db_session) == 1
    assert f"{test_user.id}/Lease/fine.pdf" in bucket.files
