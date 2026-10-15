from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

API_ROOT = Path(__file__).resolve().parent.parent


def expected_revision() -> str:
    """The newest database migration this code was written for."""
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "migrations"))
    return ScriptDirectory.from_config(config).get_current_head()


async def check_ready(session: AsyncSession) -> dict[str, str]:
    """Whether this server can do real work: the database answers and has the tables this code expects.

    The values are fixed words, never the underlying error, so the answer is safe to show anyone.
    """
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        return {"database": "unreachable", "migrations": "unknown"}
    try:
        result = await session.execute(text("SELECT version_num FROM alembic_version"))
        current = result.scalar_one_or_none()
    except Exception:
        return {"database": "ok", "migrations": "unknown"}
    if current is None:
        return {"database": "ok", "migrations": "unknown"}
    return {"database": "ok", "migrations": "current" if current == expected_revision() else "different"}
