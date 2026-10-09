import time

import pytest
from fastapi import HTTPException
from jose import jwt
from sqlalchemy import func, select

from app.auth import get_current_user, verify_service_token
from app.config import settings
from app.models import User


def _token(claims=None, secret=None, algorithm="HS256", with_exp=True, exp_in=60):
    payload = {"sub": "reader@example.com"} if claims is None else dict(claims)
    if with_exp:
        payload["exp"] = int(time.time()) + exp_in
    return jwt.encode(payload, secret or settings.service_jwt_secret, algorithm=algorithm)


async def _refused(authorization: str) -> int:
    with pytest.raises(HTTPException) as caught:
        await verify_service_token(authorization=authorization)
    return caught.value.status_code


async def test_a_valid_token_gives_the_signed_in_email():
    assert await verify_service_token(authorization=f"Bearer {_token()}") == "reader@example.com"


async def test_an_expired_token_is_refused():
    assert await _refused(f"Bearer {_token(exp_in=-5)}") == 401


async def test_a_token_with_no_expiry_is_refused():
    assert await _refused(f"Bearer {_token(with_exp=False)}") == 401


async def test_a_token_signed_with_another_secret_is_refused():
    assert await _refused(f"Bearer {_token(secret='not-the-real-secret')}") == 401


async def test_a_token_using_another_algorithm_is_refused():
    assert await _refused(f"Bearer {_token(algorithm='HS512')}") == 401


async def test_an_unsigned_token_is_refused():
    header = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0"  # {"alg":"none","typ":"JWT"}
    import base64
    import json

    body = base64.urlsafe_b64encode(
        json.dumps({"sub": "admin@example.com", "exp": int(time.time()) + 60}).encode()
    ).rstrip(b"=").decode()

    assert await _refused(f"Bearer {header}.{body}.") == 401


@pytest.mark.parametrize("claims", [{}, {"sub": ""}, {"sub": None}, {"email": "reader@example.com"}])
async def test_a_token_with_no_usable_subject_is_refused(claims):
    assert await _refused(f"Bearer {_token(claims)}") == 401


@pytest.mark.parametrize("authorization", ["", "Bearer", "Bearer ", "Bearer not.a.jwt", "Token abc", "abc"])
async def test_a_missing_or_malformed_header_is_refused(authorization):
    assert await _refused(authorization) == 401


async def test_a_token_is_not_accepted_without_the_bearer_word():
    assert await _refused(_token()) == 401


async def test_the_first_request_from_someone_creates_their_user_and_later_ones_reuse_it(db_session):
    email = "first-time@example.com"

    first = await get_current_user(email=email, session=db_session)
    second = await get_current_user(email=email, session=db_session)

    assert first.id == second.id
    count = await db_session.scalar(select(func.count()).select_from(User).where(User.email == email))
    assert count == 1
