import os

# Force tests onto a dedicated database, on the same Postgres instance, before any
# app module (which reads DATABASE_URL at import time) gets imported. This must stay
# the very first thing this file does, so tests never touch real dev data.
_base_url = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://brief:brief_dev_password@localhost:5432/brief"
)
if _base_url.rsplit("/", 1)[-1] != "brief_test":
    os.environ["DATABASE_URL"] = _base_url.rsplit("/", 1)[0] + "/brief_test"

import asyncio
import uuid
from collections.abc import AsyncGenerator

import asyncpg
import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.db as db_module
from app.config import settings
from app.models import Base, User

# pytest-asyncio can run different tests on different event loops, but asyncpg
# connections are bound to the loop that created them. A normally-pooled engine
# caches connections across checkouts, which breaks once a test lands on a
# different loop than the one that opened them. NullPool opens a fresh physical
# connection per checkout instead, so there's nothing to go stale.
db_module.engine = create_async_engine(settings.database_url, echo=False, poolclass=NullPool)
db_module.async_session = async_sessionmaker(db_module.engine, expire_on_commit=False)

engine = db_module.engine
async_session = db_module.async_session


async def _ensure_test_database_exists() -> None:
    admin_dsn = (
        settings.database_url.rsplit("/", 1)[0].replace("postgresql+asyncpg://", "postgresql://")
        + "/postgres"
    )
    connection = await asyncpg.connect(admin_dsn)
    try:
        exists = await connection.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", "brief_test"
        )
        if not exists:
            await connection.execute("CREATE DATABASE brief_test")
    finally:
        await connection.close()


async def _setup_schema() -> None:
    await _ensure_test_database_exists()
    async with engine.begin() as connection:
        await connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        # brief_test is throwaway and never holds real data, so drop and recreate every
        # run rather than relying on create_all alone, which only adds missing tables
        # and silently leaves a stale schema behind once a model gains a new column.
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)


@pytest.fixture(scope="session", autouse=True)
def _test_database() -> None:
    # A plain sync fixture running its own throwaway event loop, deliberately outside
    # pytest-asyncio's per-test loop machinery. NullPool means the connections this
    # opens are closed and discarded before this loop closes, so nothing here can
    # later clash with whatever loop an individual test runs on.
    asyncio.run(_setup_schema())


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables() -> AsyncGenerator[None, None]:
    yield
    async with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            await connection.execute(table.delete())


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session


@pytest_asyncio.fixture
async def test_user(db_session) -> User:
    user = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user
