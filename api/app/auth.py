from fastapi import Header, HTTPException
from jose import JWTError, jwt

from app.config import settings


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
