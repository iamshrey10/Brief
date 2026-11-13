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
    assert joined.json() == {"owner_email": test_user.email, "owner_name": None, "status": "requested"}
    act_as(friend)
    assert (await client.get(f"/shared/{invitation['id']}/dashboard")).status_code == 404
    assert (await client.get("/shared")).json() == [{"id": invitation["id"], "owner_email": test_user.email, "owner_name": None, "status": "requested", "access_ends_at": None}]


async def test_a_wrong_code_is_refused_and_three_of_them_end_the_invitation_even_for_the_right_code(client, db_session, test_user):
    friend = await make_user(db_session)
    invitation = await invite(client, test_user)
    wrong = "000000" if invitation["code"] != "000000" else "000001"

    assert sharing.MAX_WRONG_CODES == 3
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
    listed = (await client.get("/shared")).json()
    assert [{k: v for k, v in entry.items() if k != "access_ends_at"} for entry in listed] == [{"id": invitation["id"], "owner_email": test_user.email, "owner_name": None, "status": "active"}]
    assert listed[0]["access_ends_at"] is not None


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


async def test_after_access_is_taken_away_the_viewer_can_learn_whose_dashboard_it_was_and_gets_no_data(client, db_session, test_user):
    test_user.first_name, test_user.last_name = "Maya", "Rao"
    await db_session.commit()
    friend, stranger = await make_user(db_session), await make_user(db_session, "stranger")
    invitation = await share_with(client, db_session, test_user, friend)

    act_as(friend)
    assert (await client.get(f"/shared/{invitation['id']}/removed")).status_code == 404  # still shared, nothing removed
    act_as(test_user)
    assert (await client.delete(f"/shares/{invitation['id']}")).status_code == 204

    act_as(friend)
    response = await client.get(f"/shared/{invitation['id']}/removed")
    assert response.status_code == 200
    assert response.json() == {"owner_email": test_user.email, "owner_name": "Maya Rao", "reason": "removed", "ended_at": None}
    assert (await client.get(f"/shared/{invitation['id']}/dashboard")).status_code == 404

    act_as(stranger)  # someone it was never shared with learns nothing
    assert (await client.get(f"/shared/{invitation['id']}/removed")).status_code == 404
    assert (await client.get("/shared/not-an-id/removed")).status_code == 404


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
    assert (await client.post(f"/documents/{document.id}/move", json={"folder": "Other"})).status_code == 404
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


async def test_the_viewer_sees_what_was_found_in_each_document_but_not_the_quotes(client, db_session, test_user):
    from app.key_term_fields import fields_for
    from app.models import Clause, Extraction

    friend = await make_user(db_session)
    document = await _ready_document(db_session, test_user)
    clause = Clause(document_id=document.id, clause_index=0, page_number=1, char_start=0, char_end=9, text="Rent is $1,800 a month.")
    db_session.add(clause)
    await db_session.flush()
    fields = fields_for("lease")
    for index, field in enumerate(fields):
        found = index == 0
        db_session.add(
            Extraction(
                document_id=document.id,
                clause_id=clause.id if found else None,
                field_name=field.name,
                value="$1,800 a month" if found else None,
                quote="Rent is $1,800 a month." if found else None,
            )
        )
    await db_session.commit()
    invitation = await share_with(client, db_session, test_user, friend)

    act_as(friend)
    response = await client.get(f"/shared/{invitation['id']}/dashboard")

    assert response.json()["documents"][0]["key_terms"] == [{"label": fields[0].label, "value": "$1,800 a month"}]
    assert "Rent is $1,800 a month." not in response.text
    assert str(clause.id) not in response.text


async def test_a_document_whose_terms_are_not_read_yet_has_none_to_show(client, db_session, test_user):
    friend = await make_user(db_session)
    await _ready_document(db_session, test_user)
    invitation = await share_with(client, db_session, test_user, friend)

    act_as(friend)
    shown = (await client.get(f"/shared/{invitation['id']}/dashboard")).json()

    assert shown["documents"][0]["key_terms"] == []


# --- names ---


async def set_name(client, user, first, last):
    act_as(user)
    return await client.patch("/me", json={"first_name": first, "last_name": last})


async def test_a_person_gives_their_name_once_and_it_comes_back_from_me(client, db_session, test_user):
    saved = await set_name(client, test_user, "  Sam ", "O'Neil-Smith Jr.")

    assert saved.status_code == 200
    assert (saved.json()["first_name"], saved.json()["last_name"]) == ("Sam", "O'Neil-Smith Jr.")
    await db_session.refresh(test_user)
    assert (await client.get("/me")).json()["first_name"] == "Sam"


@pytest.mark.parametrize(
    "first,last",
    [("", "Smith"), ("Sam", ""), ("   ", "Smith"), ("x" * 51, "Smith"), ("Sam1", "Smith"), ("<b>Sam</b>", "Smith"), ("Sam\u0000", "Smith")],
)
async def test_a_name_with_nothing_in_it_or_odd_characters_is_refused(client, test_user, first, last):
    assert (await set_name(client, test_user, first, last)).status_code == 422
    assert (await client.get("/me")).json()["first_name"] is None


async def test_names_may_use_letters_from_any_language_and_extra_spaces_are_squeezed(client, test_user):
    saved = await set_name(client, test_user, "José   María", "Müller")

    assert saved.json()["first_name"] == "José María"


async def test_the_owner_and_the_viewer_each_see_the_others_name_beside_the_email(client, db_session, test_user):
    friend = await make_user(db_session)
    await set_name(client, test_user, "Maya", "Rao")
    await set_name(client, friend, "Sam", "Lee")
    invitation = await invite(client, test_user)
    joined = await join(client, friend, invitation)
    assert joined.json()["owner_name"] == "Maya Rao"

    act_as(test_user)
    waiting = (await client.get("/shares")).json()[0]
    assert (waiting["viewer_name"], waiting["viewer_email"]) == ("Sam Lee", friend.email)
    await client.post(f"/shares/{invitation['id']}/approve")

    act_as(friend)
    assert (await client.get("/shared")).json()[0]["owner_name"] == "Maya Rao"
    assert (await client.get(f"/shared/{invitation['id']}/dashboard")).json()["owner_name"] == "Maya Rao"


async def test_a_person_with_no_name_yet_has_none_to_show(client, db_session, test_user):
    friend = await make_user(db_session)
    invitation = await share_with(client, db_session, test_user, friend)

    act_as(friend)
    assert (await client.get(f"/shared/{invitation['id']}/dashboard")).json()["owner_name"] is None
    act_as(test_user)
    assert (await client.get("/shares")).json()[0]["viewer_name"] is None


# --- how long they may look ---
async def end_access_at(db_session, share_id: str, when: datetime | None) -> None:
    """Moves an approved share's end, to stand in for time having passed."""
    share = await db_session.get(DashboardShare, uuid.UUID(share_id))
    share.access_ends_at = when
    await db_session.commit()


async def _stored(db_session, share_id: str) -> DashboardShare:
    """The share as the database holds it now, not as this session saw it earlier."""
    return await db_session.get(DashboardShare, uuid.UUID(share_id), populate_existing=True)


async def test_an_invitation_with_no_choice_lasts_a_week_once_approved(client, db_session, test_user):
    friend = await make_user(db_session)
    invitation = await share_with(client, db_session, test_user, friend)

    share = await _stored(db_session, invitation["id"])
    assert share.access_hours == 7 * 24
    assert abs((share.access_ends_at - (share.approved_at + timedelta(days=7))).total_seconds()) < 1


@pytest.mark.parametrize("hours", [1, 6, 24, 168, 360, 720, 2160])
async def test_each_of_the_listed_lengths_is_accepted_and_counted_from_approval(client, db_session, test_user, hours):
    friend = await make_user(db_session)
    act_as(test_user)
    response = await client.post("/shares", json={"label": "Mum", "hours": hours})
    assert response.status_code == 201
    invitation = response.json()
    assert invitation["access_hours"] == hours

    created = await _stored(db_session, invitation["id"])
    assert created.access_ends_at is None  # the clock has not started: nobody has been approved
    assert (await join(client, friend, invitation)).status_code == 200
    act_as(test_user)
    assert (await client.post(f"/shares/{invitation['id']}/approve")).status_code == 200

    approved = await _stored(db_session, invitation["id"])
    assert abs((approved.access_ends_at - (approved.approved_at + timedelta(hours=hours))).total_seconds()) < 1


@pytest.mark.parametrize("hours", [0, 2, 5, 25, 10_000, -1])
async def test_a_length_that_is_not_on_the_list_is_refused(client, test_user, hours):
    act_as(test_user)

    response = await client.post("/shares", json={"hours": hours})

    assert response.status_code == 422
    assert "choices" in response.json()["detail"]


async def test_a_chosen_end_date_is_kept_as_chosen(client, db_session, test_user):
    friend = await make_user(db_session)
    until = datetime.now(timezone.utc) + timedelta(days=12, hours=3)
    act_as(test_user)
    invitation = (await client.post("/shares", json={"until": until.isoformat()})).json()
    assert (await join(client, friend, invitation)).status_code == 200
    act_as(test_user)
    assert (await client.post(f"/shares/{invitation['id']}/approve")).status_code == 200

    approved = await _stored(db_session, invitation["id"])
    assert approved.access_hours is None
    assert abs((approved.access_ends_at - until).total_seconds()) < 1


async def test_an_end_date_in_the_past_or_beyond_90_days_is_refused(client, test_user):
    act_as(test_user)
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    far = datetime.now(timezone.utc) + timedelta(days=120)

    assert (await client.post("/shares", json={"until": past.isoformat()})).status_code == 422
    too_far = await client.post("/shares", json={"until": far.isoformat()})
    assert too_far.status_code == 422
    assert "90 days" in too_far.json()["detail"]


async def test_the_last_day_of_the_90_day_range_is_accepted_even_though_it_ends_at_midnight(client, test_user):
    act_as(test_user)
    end_of_day = (datetime.now(timezone.utc) + timedelta(days=90)).replace(hour=23, minute=59, second=59)

    assert (await client.post("/shares", json={"until": end_of_day.isoformat()})).status_code == 201


async def test_both_a_length_and_an_end_date_is_refused(client, test_user):
    act_as(test_user)
    until = datetime.now(timezone.utc) + timedelta(days=5)

    response = await client.post("/shares", json={"hours": 24, "until": until.isoformat()})

    assert response.status_code == 422


async def test_an_end_date_that_passes_before_approval_cannot_be_approved(client, db_session, test_user):
    friend = await make_user(db_session)
    until = datetime.now(timezone.utc) + timedelta(days=2)
    act_as(test_user)
    invitation = (await client.post("/shares", json={"until": until.isoformat()})).json()
    assert (await join(client, friend, invitation)).status_code == 200
    share = await db_session.get(DashboardShare, uuid.UUID(invitation["id"]))
    share.access_until = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db_session.commit()

    act_as(test_user)
    response = await client.post(f"/shares/{invitation['id']}/approve")

    assert response.status_code == 409
    assert "make a new invitation" in response.json()["detail"]


async def test_access_stops_by_itself_when_its_time_runs_out(client, db_session, test_user):
    friend = await make_user(db_session)
    invitation = await share_with(client, db_session, test_user, friend)
    act_as(friend)
    assert (await client.get(f"/shared/{invitation['id']}/dashboard")).status_code == 200

    await end_access_at(db_session, invitation["id"], datetime.now(timezone.utc) - timedelta(seconds=1))

    act_as(friend)
    assert (await client.get(f"/shared/{invitation['id']}/dashboard")).status_code == 404
    assert (await client.get("/shared")).json() == []
    act_as(test_user)
    assert (await client.get("/shares")).json() == []


async def test_a_viewer_whose_time_ran_out_is_told_it_ended_and_not_that_it_was_taken_away(client, db_session, test_user):
    test_user.first_name, test_user.last_name = "Maya", "Rao"
    await db_session.commit()
    friend = await make_user(db_session)
    invitation = await share_with(client, db_session, test_user, friend)
    ended = datetime.now(timezone.utc) - timedelta(days=1)
    await end_access_at(db_session, invitation["id"], ended)

    act_as(friend)
    response = await client.get(f"/shared/{invitation['id']}/removed")

    assert response.status_code == 200
    body = response.json()
    assert body["reason"] == "expired"
    assert body["owner_name"] == "Maya Rao"
    assert abs(datetime.fromisoformat(body["ended_at"].replace("Z", "+00:00")) - ended).total_seconds() < 1
    assert (await client.get(f"/shared/{invitation['id']}/dashboard")).status_code == 404


async def test_a_viewer_sees_when_their_access_ends(client, db_session, test_user):
    friend = await make_user(db_session)
    act_as(test_user)
    invitation = (await client.post("/shares", json={"hours": 24})).json()
    assert (await join(client, friend, invitation)).status_code == 200
    act_as(test_user)
    assert (await client.post(f"/shares/{invitation['id']}/approve")).status_code == 200

    act_as(friend)
    ends = datetime.fromisoformat((await client.get("/shared")).json()[0]["access_ends_at"].replace("Z", "+00:00"))
    dashboard_ends = datetime.fromisoformat((await client.get(f"/shared/{invitation['id']}/dashboard")).json()["access_ends_at"].replace("Z", "+00:00"))

    assert abs((ends - (datetime.now(timezone.utc) + timedelta(hours=24))).total_seconds()) < 30
    assert ends == dashboard_ends


async def test_the_owner_sees_what_they_chose_and_when_access_stops(client, db_session, test_user):
    friend = await make_user(db_session)
    act_as(test_user)
    invitation = (await client.post("/shares", json={"label": "Mum", "hours": 720})).json()
    pending = (await client.get("/shares")).json()[0]
    assert pending["access_hours"] == 720 and pending["access_ends_at"] is None
    assert (await join(client, friend, invitation)).status_code == 200
    act_as(test_user)
    assert (await client.post(f"/shares/{invitation['id']}/approve")).status_code == 200

    active = (await client.get("/shares")).json()[0]
    assert active["status"] == "active" and active["access_ends_at"] is not None


async def test_the_owner_can_give_more_time_or_less(client, db_session, test_user):
    friend = await make_user(db_session)
    invitation = await share_with(client, db_session, test_user, friend)

    act_as(test_user)
    assert (await client.patch(f"/shares/{invitation['id']}", json={"hours": 2160})).status_code == 200
    longer = await _stored(db_session, invitation["id"])
    assert abs((longer.access_ends_at - (datetime.now(timezone.utc) + timedelta(days=90))).total_seconds()) < 30

    assert (await client.patch(f"/shares/{invitation['id']}", json={"hours": 1})).status_code == 200
    shorter = await _stored(db_session, invitation["id"])
    assert abs((shorter.access_ends_at - (datetime.now(timezone.utc) + timedelta(hours=1))).total_seconds()) < 30


async def test_giving_more_time_needs_exactly_one_choice_and_a_valid_one(client, db_session, test_user):
    friend = await make_user(db_session)
    invitation = await share_with(client, db_session, test_user, friend)
    act_as(test_user)
    until = datetime.now(timezone.utc) + timedelta(days=5)

    assert (await client.patch(f"/shares/{invitation['id']}", json={})).status_code == 422
    assert (await client.patch(f"/shares/{invitation['id']}", json={"hours": 24, "until": until.isoformat()})).status_code == 422
    assert (await client.patch(f"/shares/{invitation['id']}", json={"hours": 5})).status_code == 422
    assert (await client.patch(f"/shares/{invitation['id']}", json={"until": until.isoformat()})).status_code == 200


async def test_a_share_that_has_ended_is_not_brought_back_by_extending_it(client, db_session, test_user):
    friend = await make_user(db_session)
    invitation = await share_with(client, db_session, test_user, friend)
    await end_access_at(db_session, invitation["id"], datetime.now(timezone.utc) - timedelta(seconds=1))

    act_as(test_user)
    assert (await client.patch(f"/shares/{invitation['id']}", json={"hours": 24})).status_code == 404

    act_as(friend)
    assert (await client.get(f"/shared/{invitation['id']}/dashboard")).status_code == 404


async def test_only_a_person_who_can_view_can_be_given_more_time(client, db_session, test_user):
    friend = await make_user(db_session)
    act_as(test_user)
    invitation = (await client.post("/shares", json={})).json()  # nobody has used it yet
    assert (await client.patch(f"/shares/{invitation['id']}", json={"hours": 24})).status_code == 409
    assert (await join(client, friend, invitation)).status_code == 200
    act_as(test_user)
    assert (await client.patch(f"/shares/{invitation['id']}", json={"hours": 24})).status_code == 409  # asked, not approved


async def test_nobody_else_can_change_someones_share(client, db_session, test_user):
    friend, stranger = await make_user(db_session), await make_user(db_session, "stranger")
    invitation = await share_with(client, db_session, test_user, friend)

    act_as(stranger)
    assert (await client.patch(f"/shares/{invitation['id']}", json={"hours": 2160})).status_code == 404
    act_as(friend)  # the person looking cannot lengthen their own access
    assert (await client.patch(f"/shares/{invitation['id']}", json={"hours": 2160})).status_code == 404


async def test_a_share_that_was_approved_before_time_limits_and_has_no_end_is_not_cut_off(client, db_session, test_user):
    friend = await make_user(db_session)
    invitation = await share_with(client, db_session, test_user, friend)
    await end_access_at(db_session, invitation["id"], None)

    act_as(friend)
    assert (await client.get(f"/shared/{invitation['id']}/dashboard")).status_code == 200
