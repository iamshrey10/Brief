from fastapi import Depends, Header, HTTPException
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_session
from app.models import User


async def verify_service_token(authorization: str = Header(...)) -> str:
    """Verifies the short-lived token minted by the Next.js backend-for-frontend layer.

    The frontend never lets the browser call this API directly, it mints this token
    server-side after checking the user's real session, so a valid token here means a
    real signed-in user made this request a moment ago.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")

    token = authorization.removeprefix("Bearer ")
    try:
        payload = jwt.decode(token, settings.service_jwt_secret, algorithms=["HS256"])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="invalid token") from exc

    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="invalid token")
    return email


async def get_current_user(
    email: str = Depends(verify_service_token),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Looks up the signed-in user, creating a row the first time they're ever seen."""
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(email=email)
        session.add(user)
        await session.commit()
        await session.refresh(user)

    return user
