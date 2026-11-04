import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

import app.main as main_module
from app import sharing
from app.auth import get_current_user
from app.main import app
from app.models import DashboardShare, Document, User
from tests.test_documents_api import _ready_document


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


def act_as(user: User) -> None:
    async def current():
        return user

    app.dependency_overrides[get_current_user] = current


async def make_user(db_session, label: str = "friend") -> User:
    user = User(email=f"{label}-{uuid.uuid4()}@example.com")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def invite(client, owner: User, label: str | None = "Mum") -> dict:
    act_as(owner)
    response = await client.post("/shares", json={"label": label})
    assert response.status_code == 201, response.text
    return response.json()


async def join(client, viewer: User, invitation: dict, code: str | None = None):
    act_as(viewer)
    return await client.post("/shares/join", json={"token": invitation["token"], "code": code or invitation["code"]})


async def share_with(client, db_session, owner: User, viewer: User) -> dict:
    invitation = await invite(client, owner)
    assert (await join(client, viewer, invitation)).status_code == 200
    act_as(owner)
    assert (await client.post(f"/shares/{invitation['id']}/approve")).status_code == 200
    return invitation


# --- making an invitation ---


async def test_an_invitation_has_a_link_secret_and_a_six_digit_code_and_expires_in_a_week(client, test_user):
    invitation = await invite(client, test_user)

    assert len(invitation["token"]) >= 40
    assert len(invitation["code"]) == 6 and invitation["code"].isdigit()
    expires = datetime.fromisoformat(invitation["expires_at"])
    assert timedelta(days=6, hours=23) < expires - datetime.now(timezone.utc) <= sharing.INVITE_VALID_FOR


async def test_neither_the_link_nor_the_code_is_kept_as_it_was_given(client, db_session, test_user):
    invitation = await invite(client, test_user)

    row = (await db_session.execute(select(DashboardShare))).scalars().all()[-1]
    stored = f"{row.token_hash} {row.code_hash}"
    assert invitation["token"] not in stored and invitation["code"] not in stored
    assert row.token_hash == sharing._digest(invitation["token"])


async def test_two_invitations_never_share_a_link_or_code_secret(client, test_user):
    first, second = await invite(client, test_user), await invite(client, test_user)

    assert first["token"] != second["token"]


async def test_a_name_for_the_invitation_is_trimmed_and_a_blank_one_is_left_out(client, test_user):
    await invite(client, test_user, "  Mum  ")
    await invite(client, test_user, "   ")

    listed = (await client.get("/shares")).json()
    assert [share["label"] for share in listed] == ["Mum", None]


async def test_a_name_that_is_too_long_is_refused(client, test_user):
    act_as(test_user)
    assert (await client.post("/shares", json={"label": "x" * 101})).status_code == 422


async def test_at_most_five_people_can_be_invited_at_once_and_removing_one_makes_room(client, test_user):
    made = [await invite(client, test_user) for _ in range(sharing.MAX_SHARES)]

    sixth = await client.post("/shares", json={})
    assert sixth.status_code == 409
    assert "up to 5 people" in sixth.json()["detail"]

    assert (await client.delete(f"/shares/{made[0]['id']}")).status_code == 204
    assert (await client.post("/shares", json={})).status_code == 201


async def test_an_invitation_that_ran_out_no_longer_counts_towards_the_limit(client, db_session, test_user):
    for _ in range(sharing.MAX_SHARES):
        await invite(client, test_user)
    for row in (await db_session.execute(select(DashboardShare))).scalars().all():
        if row.owner_id == test_user.id:
            row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db_session.commit()

    assert (await client.post("/shares", json={})).status_code == 201


# --- using an invitation ---


async def test_a_right_code_asks_the_owner_for_approval_and_gives_nothing_yet(client, db_session, test_user):
    friend = await make_user(db_session)
    invitation = await invite(client, test_user)

    joined = await join(client, friend, invitation)

    assert joined.status_code == 200
    assert joined.json() == {"owner_email": test_user.email, "status": "requested"}
    act_as(friend)
    assert (await client.get(f"/shared/{invitation['id']}/dashboard")).status_code == 404
    assert (await client.get("/shared")).json() == [{"id": invitation["id"], "owner_email": test_user.email, "status": "requested"}]


async def test_a_wrong_code_is_refused_and_five_of_them_end_the_invitation_even_for_the_right_code(client, db_session, test_user):
    friend = await make_user(db_session)
    invitation = await invite(client, test_user)
    wrong = "000000" if invitation["code"] != "000000" else "000001"

    for _ in range(sharing.MAX_WRONG_CODES):
        assert (await join(client, friend, invitation, wrong)).status_code == 400
    assert (await join(client, friend, invitation)).status_code == 404

    act_as(test_user)
    assert (await client.get("/shares")).json() == []


async def test_a_made_up_link_is_answered_like_one_that_was_used_up(client, db_session):
    friend = await make_user(db_session)
    act_as(friend)

    made_up = await client.post("/shares/join", json={"token": "x" * 43, "code": "123456"})

    assert made_up.status_code == 404
    assert made_up.json()["detail"] == "that invitation is not valid any more"


async def test_an_invitation_cannot_be_used_twice_or_after_it_expired(client, db_session, test_user):
    first, second = await make_user(db_session), await make_user(db_session)
    invitation = await invite(client, test_user)
    assert (await join(client, first, invitation)).status_code == 200

    assert (await join(client, second, invitation)).status_code == 404

    stale = await invite(client, test_user)
    row = (await db_session.execute(select(DashboardShare).where(DashboardShare.id == uuid.UUID(stale["id"])))).scalar_one()
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    await db_session.commit()
    assert (await join(client, second, stale)).status_code == 404


async def test_the_owner_cannot_join_their_own_invitation(client, test_user):
    invitation = await invite(client, test_user)

    refused = await join(client, test_user, invitation)

    assert refused.status_code == 400
    assert "your own" in refused.json()["detail"]


async def test_someone_who_already_has_access_cannot_take_a_second_place(client, db_session, test_user):
    friend = await make_user(db_session)
    await share_with(client, db_session, test_user, friend)
    again = await invite(client, test_user)

    refused = await join(client, friend, again)

    assert refused.status_code == 409


@pytest.mark.parametrize("code", ["12345", "1234567", "abcdef", ""])
async def test_a_code_that_is_not_six_digits_is_refused_before_anything_is_looked_up(client, db_session, code):
    act_as(await make_user(db_session))

    assert (await client.post("/shares/join", json={"token": "x" * 43, "code": code})).status_code == 422


# --- approving, listing and removing ---


async def test_the_owner_sees_who_asked_and_approves_them(client, db_session, test_user):
    friend = await make_user(db_session)
    invitation = await invite(client, test_user)
    await join(client, friend, invitation)

    act_as(test_user)
    waiting = (await client.get("/shares")).json()
    assert [(s["status"], s["viewer_email"]) for s in waiting] == [("requested", friend.email)]
    assert (await client.post(f"/shares/{invitation['id']}/approve")).json() == {"status": "active"}
    approved = (await client.get("/shares")).json()
    assert [(s["status"], s["viewer_email"], s["expires_at"]) for s in approved] == [("active", friend.email, None)]


async def test_an_invitation_nobody_used_cannot_be_approved(client, test_user):
    invitation = await invite(client, test_user)

    assert (await client.post(f"/shares/{invitation['id']}/approve")).status_code == 409


async def test_approving_twice_is_refused_the_second_time(client, db_session, test_user):
    invitation = await share_with(client, db_session, test_user, await make_user(db_session))

    assert (await client.post(f"/shares/{invitation['id']}/approve")).status_code == 409


async def test_a_request_that_ran_out_cannot_be_approved(client, db_session, test_user):
    friend = await make_user(db_session)
    invitation = await invite(client, test_user)
    await join(client, friend, invitation)
    row = (await db_session.execute(select(DashboardShare).where(DashboardShare.id == uuid.UUID(invitation["id"])))).scalar_one()
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    await db_session.commit()

    act_as(test_user)
    assert (await client.post(f"/shares/{invitation['id']}/approve")).status_code == 404


async def test_nobody_else_can_approve_or_remove_someones_share(client, db_session, test_user):
    friend, stranger = await make_user(db_session), await make_user(db_session, "stranger")
    invitation = await invite(client, test_user)
    await join(client, friend, invitation)

    act_as(stranger)
    assert (await client.post(f"/shares/{invitation['id']}/approve")).status_code == 404
    assert (await client.delete(f"/shares/{invitation['id']}")).status_code == 404
    act_as(friend)
    assert (await client.post(f"/shares/{invitation['id']}/approve")).status_code == 404
    assert (await client.delete(f"/shares/{invitation['id']}")).status_code == 404
    act_as(stranger)
    assert (await client.get("/shares")).json() == []


@pytest.mark.parametrize("share_id", ["not-a-uuid", "00000000-0000-0000-0000-000000000000"])
async def test_a_share_that_does_not_exist_is_not_found_whatever_it_is_called(client, test_user, share_id):
    act_as(test_user)

    assert (await client.post(f"/shares/{share_id}/approve")).status_code == 404
    assert (await client.delete(f"/shares/{share_id}")).status_code == 404
    assert (await client.get(f"/shared/{share_id}/dashboard")).status_code == 404


async def test_removing_a_share_twice_is_not_found_the_second_time(client, test_user):
    invitation = await invite(client, test_user)

    assert (await client.delete(f"/shares/{invitation['id']}")).status_code == 204
    assert (await client.delete(f"/shares/{invitation['id']}")).status_code == 404


async def test_the_list_never_carries_a_code_or_a_link(client, db_session, test_user):
    invitation = await invite(client, test_user)

    text = (await client.get("/shares")).text

    assert invitation["token"] not in text and invitation["code"] not in text
    assert "hash" not in text


# --- viewing ---


async def test_an_approved_person_sees_the_dashboard_and_the_owner_sees_when(client, db_session, test_user):
    friend = await make_user(db_session)
    document = await _ready_document(db_session, test_user)
    invitation = await share_with(client, db_session, test_user, friend)

    act_as(friend)
    shown = (await client.get(f"/shared/{invitation['id']}/dashboard")).json()

    assert shown["owner_email"] == test_user.email
    assert [d["id"] for d in shown["documents"]] == [str(document.id)]
    assert shown["insights"] == [] and shown["key_dates"] == []
    act_as(test_user)
    assert (await client.get("/shares")).json()[0]["last_viewed_at"] is not None
    act_as(friend)
    assert (await client.get("/shared")).json() == [{"id": invitation["id"], "owner_email": test_user.email, "status": "active"}]


async def test_what_the_viewer_gets_has_no_file_link_and_no_storage_detail(client, db_session, test_user):
    friend = await make_user(db_session)
    await _ready_document(db_session, test_user)
    invitation = await share_with(client, db_session, test_user, friend)

    act_as(friend)
    text = (await client.get(f"/shared/{invitation['id']}/dashboard")).text

    assert "fake/key.pdf" not in text and "storage" not in text and "token" not in text


async def test_documents_in_the_bin_are_not_shown_to_the_viewer(client, db_session, test_user):
    friend = await make_user(db_session)
    document = await _ready_document(db_session, test_user)
    document.deleted_at = datetime.now(timezone.utc)
    await db_session.commit()
    invitation = await share_with(client, db_session, test_user, friend)

    act_as(friend)
    assert (await client.get(f"/shared/{invitation['id']}/dashboard")).json()["documents"] == []


async def test_a_viewer_sees_only_the_owner_who_shared_and_never_their_own_or_anyones_else(client, db_session, test_user):
    friend, stranger = await make_user(db_session), await make_user(db_session, "stranger")
    await _ready_document(db_session, stranger)
    invitation = await share_with(client, db_session, test_user, friend)

    act_as(friend)
    shown = (await client.get(f"/shared/{invitation['id']}/dashboard")).json()
    assert shown["documents"] == []
    act_as(stranger)
    assert (await client.get(f"/shared/{invitation['id']}/dashboard")).status_code == 404


async def test_taking_access_away_closes_the_dashboard_at_once(client, db_session, test_user):
    friend = await make_user(db_session)
    invitation = await share_with(client, db_session, test_user, friend)
    act_as(test_user)
    assert (await client.delete(f"/shares/{invitation['id']}")).status_code == 204

    act_as(friend)
    assert (await client.get(f"/shared/{invitation['id']}/dashboard")).status_code == 404
    assert (await client.get("/shared")).json() == []
    act_as(test_user)
    assert (await client.get("/shares")).json() == []


async def test_a_viewer_cannot_use_any_other_route_on_the_owners_documents(client, db_session, test_user):
    friend = await make_user(db_session)
    document = await _ready_document(db_session, test_user)
    await share_with(client, db_session, test_user, friend)

    act_as(friend)
    assert (await client.get("/documents")).json() == []
    assert (await client.get(f"/documents/{document.id}")).status_code == 404
    assert (await client.get(f"/documents/{document.id}/file")).status_code == 404
    assert (await client.delete(f"/documents/{document.id}")).status_code == 404
    assert (await client.patch(f"/documents/{document.id}", json={"filename": "x.pdf"})).status_code == 404
    assert (await client.post(f"/documents/{document.id}/ask", json={"question": "hi"})).status_code == 404


async def test_deleting_an_account_removes_the_shares_it_was_part_of(client, db_session, monkeypatch):
    owner, friend = await make_user(db_session, "owner"), await make_user(db_session)
    owner_id = owner.id
    await share_with(client, db_session, owner, friend)
    monkeypatch.setattr(main_module, "delete_file", lambda key: None)

    act_as(friend)
    assert (await client.delete("/me")).status_code == 204

    db_session.expire_all()
    assert (await db_session.execute(select(DashboardShare))).scalars().all() == []
    assert (await db_session.execute(select(Document).where(Document.user_id == owner_id))).scalars().all() == []
