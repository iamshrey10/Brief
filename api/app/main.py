from fastapi import Depends, FastAPI
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_service_token
from app.db import get_session
from app.models import User

app = FastAPI(title="Brief API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/db")
async def health_db(session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get("/me")
async def me(
    email: str = Depends(verify_service_token),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(email=email)
        session.add(user)
        await session.commit()
        await session.refresh(user)

    return {"id": str(user.id), "email": user.email}
