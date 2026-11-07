import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

import app.main as main_module
from app import two_factor
from app.auth import get_current_user
from app.main import app
from app.models import Document, RecoveryCode, TrustedDevice, TwoFactor, User

NOW = datetime(2026, 11, 5, 12, 0, 0, tzinfo=timezone.utc)


@pytest_asyncio.fixture
async def client(test_user):
    async def current():
        return test_user

    app.dependency_overrides[get_current_user] = current
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


def act_as(user: User) -> None:
    async def current():
        return user

    app.dependency_overrides[get_current_user] = current


async def make_user(db_session) -> User:
    user = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


def code_at(secret: str, offset: int = 0) -> str:
    """The code for the current 30 second step, or the one before or after."""
    return two_factor.code_for_step(secret, two_factor.step_at(datetime.now(timezone.utc)) + offset)


async def turned_on(client) -> tuple[str, list[str]]:
    """Sets two step verification up and proves it with the current code. Returns the secret and the recovery codes."""
    secret = (await client.post("/me/2fa/setup")).json()["secret"]
    enabled = await client.post("/me/2fa/enable", json={"code": code_at(secret)})
    assert enabled.status_code == 200, enabled.text
    return secret, enabled.json()["recovery_codes"]


# --- the codes themselves ---


def test_the_codes_are_the_ones_the_standard_gives():
    # The test values from RFC 6238, for the secret 12345678901234567890, as the last six digits.
    secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    assert two_factor.code_for_step(secret, 59 // 30) == "287082"
    assert two_factor.code_for_step(secret, 1111111109 // 30) == "081804"
    assert two_factor.code_for_step(secret, 2000000000 // 30) == "279037"


def test_a_code_from_the_step_before_or_after_is_accepted_and_one_further_off_is_not():
    secret = two_factor.new_secret()
    step = two_factor.step_at(NOW)

    assert two_factor.matching_step(secret, two_factor.code_for_step(secret, step), NOW, 0) == step
    assert two_factor.matching_step(secret, two_factor.code_for_step(secret, step - 1), NOW, 0) == step - 1
    assert two_factor.matching_step(secret, two_factor.code_for_step(secret, step + 1), NOW, 0) == step + 1
    assert two_factor.matching_step(secret, two_factor.code_for_step(secret, step + 2), NOW, 0) is None
    assert two_factor.matching_step(secret, two_factor.code_for_step(secret, step - 2), NOW, 0) is None


def test_a_step_already_used_or_earlier_is_never_accepted_again():
    secret = two_factor.new_secret()
    step = two_factor.step_at(NOW)

    assert two_factor.matching_step(secret, two_factor.code_for_step(secret, step), NOW, step) is None
    assert two_factor.matching_step(secret, two_factor.code_for_step(secret, step - 1), NOW, step) is None


def test_a_secret_is_twenty_random_bytes_in_base32_and_the_app_address_names_brief_and_the_person():
    one, two = two_factor.new_secret(), two_factor.new_secret()
    uri = two_factor.otpauth_uri(one, "maya+x@example.com")

    assert one != two and len(one) == 32
    assert uri.startswith("otpauth://totp/Brief%3Amaya%2Bx%40example.com?secret=")
    assert "issuer=Brief" in uri and "digits=6" in uri and "period=30" in uri


def test_a_recovery_code_uses_letters_and_digits_that_are_hard_to_misread():
    codes = {two_factor.new_recovery_code() for _ in range(200)}

    assert len(codes) == 200
    for code in codes:
        assert len(code) == 11 and code[5] == "-"
        assert not set(code.replace("-", "")) & set("01OIL")


# --- setting up ---


async def test_it_is_off_until_it_is_set_up_and_proved(client):
    assert (await client.get("/me/2fa")).json() == {"enabled": False, "recovery_codes_left": 0}

    await client.post("/me/2fa/setup")

    assert (await client.get("/me/2fa")).json()["enabled"] is False


async def test_setup_gives_a_secret_and_an_address_and_keeps_the_secret_only_encrypted(client, db_session, test_user):
    made = (await client.post("/me/2fa/setup")).json()

    assert made["otpauth_uri"].startswith("otpauth://totp/Brief")
    assert made["secret"] in made["otpauth_uri"]
    row = (await db_session.execute(select(TwoFactor).where(TwoFactor.user_id == test_user.id))).scalar_one()
    assert made["secret"] not in row.secret_encrypted and row.enabled is False


async def test_setting_up_again_before_proving_replaces_the_secret(client, db_session, test_user):
    first = (await client.post("/me/2fa/setup")).json()["secret"]
    second = (await client.post("/me/2fa/setup")).json()["secret"]

    assert first != second
    assert (await client.post("/me/2fa/enable", json={"code": code_at(first)})).status_code == 400
    assert (await client.post("/me/2fa/enable", json={"code": code_at(second)})).status_code == 200


async def test_a_right_code_turns_it_on_and_gives_ten_recovery_codes_kept_only_as_hashes(client, db_session, test_user):
    _, codes = await turned_on(client)

    assert len(codes) == 10 and len(set(codes)) == 10
    assert (await client.get("/me/2fa")).json() == {"enabled": True, "recovery_codes_left": 10}
    rows = (await db_session.execute(select(RecoveryCode).where(RecoveryCode.user_id == test_user.id))).scalars().all()
    stored = " ".join(row.code_hash for row in rows)
    assert not any(code in stored or code.replace("-", "") in stored for code in codes)


@pytest.mark.parametrize("code", ["000000", "12345", "abcdef", "1234567", " ", "x" * 32])
async def test_a_wrong_code_does_not_turn_it_on(client, code):
    await client.post("/me/2fa/setup")

    assert (await client.post("/me/2fa/enable", json={"code": code})).status_code == 400
    assert (await client.get("/me/2fa")).json()["enabled"] is False


async def test_a_code_of_the_wrong_size_is_refused_before_anything_is_checked(client):
    assert (await client.post("/me/2fa/enable", json={"code": ""})).status_code == 422
    assert (await client.post("/me/2fa/enable", json={"code": "x" * 33})).status_code == 422


async def test_there_is_nothing_to_enable_without_a_setup_and_it_cannot_be_set_up_twice(client):
    assert (await client.post("/me/2fa/enable", json={"code": "123456"})).status_code == 409

    await turned_on(client)

    assert (await client.post("/me/2fa/setup")).status_code == 409
    assert (await client.post("/me/2fa/enable", json={"code": "123456"})).status_code == 409


async def test_five_wrong_codes_while_setting_up_lock_it_even_against_the_right_code(client):
    secret = (await client.post("/me/2fa/setup")).json()["secret"]
    for _ in range(two_factor.MAX_WRONG_CODES):
        assert (await client.post("/me/2fa/enable", json={"code": "000000"})).status_code == 400

    locked = await client.post("/me/2fa/enable", json={"code": code_at(secret)})

    assert locked.status_code == 429
    assert locked.headers["Retry-After"] == "900"


# --- giving a code at sign in ---


async def test_a_right_code_signs_in_and_the_same_code_cannot_be_used_again(client):
    secret, _ = await turned_on(client)
    after = code_at(secret, 1)

    assert (await client.post("/me/2fa/verify", json={"code": after})).status_code == 200
    assert (await client.post("/me/2fa/verify", json={"code": after})).status_code == 400
    # The code that turned it on is a used one too.
    assert (await client.post("/me/2fa/verify", json={"code": code_at(secret)})).status_code == 400


async def test_a_code_cannot_be_given_when_it_is_not_on(client):
    assert (await client.post("/me/2fa/verify", json={"code": "123456"})).status_code == 409


async def test_a_wrong_code_is_refused(client):
    await turned_on(client)

    response = await client.post("/me/2fa/verify", json={"code": "000000"})

    assert response.status_code == 400
    assert response.json()["detail"] == "that code is not right"


async def test_five_wrong_codes_lock_sign_in_for_fifteen_minutes(client):
    secret, _ = await turned_on(client)
    for _ in range(two_factor.MAX_WRONG_CODES):
        await client.post("/me/2fa/verify", json={"code": "000000"})

    locked = await client.post("/me/2fa/verify", json={"code": code_at(secret, 1)})

    assert locked.status_code == 429
    assert "15 minutes" in locked.json()["detail"]
    assert locked.headers["Retry-After"] == "900"


async def test_the_lock_lifts_after_fifteen_minutes_and_a_right_code_clears_the_count(db_session, test_user):
    await two_factor.begin_setup(db_session, test_user)
    row = (await db_session.execute(select(TwoFactor).where(TwoFactor.user_id == test_user.id))).scalar_one()
    secret = two_factor._cipher().decrypt(row.secret_encrypted.encode()).decode()
    step = two_factor.step_at(NOW)
    tried, codes = await two_factor.confirm_setup(db_session, test_user, two_factor.code_for_step(secret, step), NOW)
    assert tried is two_factor.Tried.RIGHT and len(codes) == 10
    for _ in range(two_factor.MAX_WRONG_CODES):
        await two_factor.verify(db_session, test_user, "000000", False, NOW)

    outcome, _, _ = await two_factor.verify(db_session, test_user, two_factor.code_for_step(secret, step + 1), False, NOW + timedelta(minutes=14))
    assert outcome is two_factor.Verified.LOCKED
    later = NOW + timedelta(minutes=16)
    outcome, _, how = await two_factor.verify(db_session, test_user, two_factor.code_for_step(secret, two_factor.step_at(later)), False, later)
    assert (outcome, how) == (two_factor.Verified.OK, "app")

    await db_session.refresh(row)
    assert row.failed_attempts == 0 and row.locked_until is None


async def test_four_wrong_codes_then_a_right_one_do_not_lock(db_session, test_user):
    await two_factor.begin_setup(db_session, test_user)
    row = (await db_session.execute(select(TwoFactor).where(TwoFactor.user_id == test_user.id))).scalar_one()
    secret = two_factor._cipher().decrypt(row.secret_encrypted.encode()).decode()
    step = two_factor.step_at(NOW)
    await two_factor.confirm_setup(db_session, test_user, two_factor.code_for_step(secret, step - 1), NOW)
    for _ in range(two_factor.MAX_WRONG_CODES - 1):
        await two_factor.verify(db_session, test_user, "000000", False, NOW)

    outcome, _, _ = await two_factor.verify(db_session, test_user, two_factor.code_for_step(secret, step), False, NOW)

    assert outcome is two_factor.Verified.OK


# --- recovery codes ---


async def test_a_recovery_code_signs_in_once_whatever_the_case_or_dashes_and_says_it_was_one(client):
    _, codes = await turned_on(client)

    first = await client.post("/me/2fa/verify", json={"code": codes[0].lower().replace("-", " ")})

    assert first.status_code == 200 and first.json()["used_recovery_code"] is True
    assert (await client.post("/me/2fa/verify", json={"code": codes[0]})).status_code == 400
    assert (await client.get("/me/2fa")).json()["recovery_codes_left"] == 9


async def test_a_recovery_code_that_was_never_given_is_refused(client):
    await turned_on(client)

    assert (await client.post("/me/2fa/verify", json={"code": "AAAAA-AAAAA"})).status_code == 400


async def test_a_recovery_code_cannot_set_up(client):
    await client.post("/me/2fa/setup")

    assert (await client.post("/me/2fa/enable", json={"code": "AAAAA-AAAAA"})).status_code == 400


# --- remembering a browser ---


async def test_a_browser_that_was_remembered_is_not_asked_again_and_another_is(client):
    secret, _ = await turned_on(client)
    assert (await client.post("/me/2fa/check", json={})).json() == {"required": True, "trusted": False}

    verified = (await client.post("/me/2fa/verify", json={"code": code_at(secret, 1), "remember": True})).json()

    token = verified["device_token"]
    assert token and len(token) >= 40
    assert (await client.post("/me/2fa/check", json={"device_token": token})).json() == {"required": True, "trusted": True}
    assert (await client.post("/me/2fa/check", json={"device_token": "not-a-device"})).json() == {"required": True, "trusted": False}


async def test_a_browser_is_only_remembered_when_asked_and_its_secret_is_kept_only_as_a_hash(client, db_session, test_user):
    secret, codes = await turned_on(client)

    plain = (await client.post("/me/2fa/verify", json={"code": code_at(secret, 1)})).json()
    assert plain["device_token"] is None
    assert (await db_session.execute(select(TrustedDevice))).scalars().all() == []

    other = (await client.post("/me/2fa/verify", json={"code": codes[0], "remember": True})).json()
    stored = (await db_session.execute(select(TrustedDevice).where(TrustedDevice.user_id == test_user.id))).scalars().all()
    assert len(stored) == 1 and other["device_token"] not in stored[0].token_hash


async def test_nothing_is_required_when_it_is_off_even_with_a_device_secret(client):
    assert (await client.post("/me/2fa/check", json={"device_token": "x" * 40})).json() == {"required": False, "trusted": False}


async def test_a_remembered_browser_stops_being_trusted_after_thirty_days(db_session, test_user):
    await two_factor.begin_setup(db_session, test_user)
    row = (await db_session.execute(select(TwoFactor).where(TwoFactor.user_id == test_user.id))).scalar_one()
    secret = two_factor._cipher().decrypt(row.secret_encrypted.encode()).decode()
    step = two_factor.step_at(NOW)
    await two_factor.confirm_setup(db_session, test_user, two_factor.code_for_step(secret, step - 1), NOW)
    _, token, _ = await two_factor.verify(db_session, test_user, two_factor.code_for_step(secret, step), True, NOW)

    assert await two_factor.check(db_session, test_user, token, NOW + timedelta(days=29)) == (True, True)
    assert await two_factor.check(db_session, test_user, token, NOW + timedelta(days=31)) == (True, False)


async def test_a_remembered_browser_of_one_person_means_nothing_for_another(client, db_session, test_user):
    secret, _ = await turned_on(client)
    token = (await client.post("/me/2fa/verify", json={"code": code_at(secret, 1), "remember": True})).json()["device_token"]
    stranger = await make_user(db_session)
    act_as(stranger)
    await client.post("/me/2fa/setup")
    row = (await db_session.execute(select(TwoFactor).where(TwoFactor.user_id == stranger.id))).scalar_one()
    their_secret = two_factor._cipher().decrypt(row.secret_encrypted.encode()).decode()
    await client.post("/me/2fa/enable", json={"code": code_at(their_secret)})

    assert (await client.post("/me/2fa/check", json={"device_token": token})).json() == {"required": True, "trusted": False}


async def test_only_ten_browsers_are_kept_and_the_oldest_make_room(db_session, test_user):
    await two_factor.begin_setup(db_session, test_user)
    row = (await db_session.execute(select(TwoFactor).where(TwoFactor.user_id == test_user.id))).scalar_one()
    secret = two_factor._cipher().decrypt(row.secret_encrypted.encode()).decode()
    step = two_factor.step_at(NOW)
    await two_factor.confirm_setup(db_session, test_user, two_factor.code_for_step(secret, step - 1), NOW)
    tokens = []
    for index in range(two_factor.MAX_DEVICES + 2):
        row.last_used_step = 0
        await db_session.commit()
        _, token, _ = await two_factor.verify(db_session, test_user, two_factor.code_for_step(secret, step), True, NOW + timedelta(seconds=index))
        tokens.append(token)

    kept = (await db_session.execute(select(TrustedDevice).where(TrustedDevice.user_id == test_user.id))).scalars().all()
    assert len(kept) == two_factor.MAX_DEVICES
    assert await two_factor.check(db_session, test_user, tokens[0], NOW + timedelta(minutes=1)) == (True, False)
    assert await two_factor.check(db_session, test_user, tokens[-1], NOW + timedelta(minutes=1)) == (True, True)


# --- turning it off ---


async def test_turning_it_off_needs_a_right_code_and_forgets_everything(client, db_session, test_user):
    secret, codes = await turned_on(client)
    await client.post("/me/2fa/verify", json={"code": code_at(secret, 1), "remember": True})
    assert len((await db_session.execute(select(TrustedDevice).where(TrustedDevice.user_id == test_user.id))).scalars().all()) == 1

    assert (await client.post("/me/2fa/disable", json={"code": "000000"})).status_code == 400
    assert (await client.get("/me/2fa")).json()["enabled"] is True

    done = await client.post("/me/2fa/disable", json={"code": codes[0]})

    assert done.json() == {"enabled": False, "recovery_codes_left": 0}
    for table in (TwoFactor, RecoveryCode, TrustedDevice):
        left = (await db_session.execute(select(table).where(table.user_id == test_user.id))).scalars().all()
        assert left == []
    assert (await client.post("/me/2fa/check", json={})).json() == {"required": False, "trusted": False}


async def test_it_cannot_be_turned_off_when_it_is_not_on(client):
    assert (await client.post("/me/2fa/disable", json={"code": "123456"})).status_code == 409


async def test_a_recovery_code_can_turn_it_off(client):
    _, codes = await turned_on(client)

    assert (await client.post("/me/2fa/disable", json={"code": codes[3]})).status_code == 200


async def test_wrong_codes_lock_turning_it_off_too(client):
    secret, _ = await turned_on(client)
    for _ in range(two_factor.MAX_WRONG_CODES):
        await client.post("/me/2fa/disable", json={"code": "000000"})

    locked = await client.post("/me/2fa/disable", json={"code": code_at(secret, 1)})

    assert locked.status_code == 429
    assert (await client.get("/me/2fa")).json()["enabled"] is True


# --- new recovery codes ---


async def test_new_recovery_codes_need_a_right_code_and_replace_every_old_one(client, db_session, test_user):
    secret, old = await turned_on(client)

    assert (await client.post("/me/2fa/recovery-codes", json={"code": "000000"})).status_code == 400
    assert (await client.get("/me/2fa")).json()["recovery_codes_left"] == 10
    made = await client.post("/me/2fa/recovery-codes", json={"code": code_at(secret, 1)})

    assert made.status_code == 200
    fresh = made.json()["recovery_codes"]
    assert len(fresh) == two_factor.RECOVERY_CODES and len(set(fresh)) == len(fresh) and not set(fresh) & set(old)
    assert (await client.get("/me/2fa")).json()["recovery_codes_left"] == 10
    # An old code is of no use now, and a new one works once.
    assert (await client.post("/me/2fa/verify", json={"code": old[0]})).status_code == 400
    assert (await client.post("/me/2fa/verify", json={"code": fresh[0]})).status_code == 200


async def test_a_recovery_code_can_be_used_to_make_new_ones_and_is_replaced_with_the_rest(client):
    _, old = await turned_on(client)

    made = await client.post("/me/2fa/recovery-codes", json={"code": old[2]})

    assert made.status_code == 200
    assert (await client.get("/me/2fa")).json()["recovery_codes_left"] == 10


async def test_new_recovery_codes_cannot_be_made_when_it_is_not_on(client):
    assert (await client.post("/me/2fa/recovery-codes", json={"code": "123456"})).status_code == 409


async def test_wrong_codes_lock_making_new_recovery_codes_too(client):
    secret, _ = await turned_on(client)
    for _ in range(two_factor.MAX_WRONG_CODES):
        await client.post("/me/2fa/recovery-codes", json={"code": "000000"})

    locked = await client.post("/me/2fa/recovery-codes", json={"code": code_at(secret, 1)})

    assert locked.status_code == 429
    assert locked.headers["retry-after"] == "900"


# --- people stay apart ---


async def test_one_persons_setup_and_codes_never_touch_anothers(client, db_session, test_user):
    secret, _ = await turned_on(client)
    stranger = await make_user(db_session)
    act_as(stranger)

    assert (await client.get("/me/2fa")).json() == {"enabled": False, "recovery_codes_left": 0}
    assert (await client.post("/me/2fa/verify", json={"code": code_at(secret, 1)})).status_code == 409
    assert (await client.post("/me/2fa/disable", json={"code": code_at(secret, 1)})).status_code == 409


async def test_deleting_the_account_removes_the_secret_the_codes_and_the_remembered_browsers(client, db_session, monkeypatch, test_user):
    secret, _ = await turned_on(client)
    await client.post("/me/2fa/verify", json={"code": code_at(secret, 1), "remember": True})
    monkeypatch.setattr(main_module, "delete_file", lambda key: None)
    user_id = test_user.id

    assert (await client.delete("/me")).status_code == 204

    db_session.expire_all()
    for table in (TwoFactor, RecoveryCode, TrustedDevice):
        assert [r for r in (await db_session.execute(select(table))).scalars().all() if r.user_id == user_id] == []
    assert (await db_session.execute(select(Document).where(Document.user_id == user_id))).scalars().all() == []
