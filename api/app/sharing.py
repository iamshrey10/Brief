import enum
import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import DashboardShare, User

# How many people one account can have looking at its dashboard at once. Invitations still waiting count too,
# so the number cannot be got round by making many links.
MAX_SHARES = 5
# How long an invitation that has not been approved yet stays usable.
INVITE_VALID_FOR = timedelta(days=7)
# Wrong codes allowed on one invitation. The sixth try finds it gone, so a six digit code cannot be guessed.
MAX_WRONG_CODES = 5

OPEN_STATES = ("invited", "requested", "active")


def _digest(value: str) -> str:
    """A keyed hash. The link and the code are never stored, and a stolen copy of the table cannot be used to
    work out a code without the server's secret."""
    return hmac.new(settings.service_jwt_secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def is_live(share: DashboardShare, now: datetime) -> bool:
    """Whether the share can still be used: approved and not revoked, or an invitation not yet past its time."""
    if share.status == "active":
        return True
    return share.status in ("invited", "requested") and share.expires_at > now


async def owner_shares(session: AsyncSession, owner_id: uuid.UUID, now: datetime | None = None) -> list[DashboardShare]:
    """The shares an owner can still see, oldest first: invitations, requests waiting for a decision, and approved ones."""
    now = now or _now()
    result = await session.execute(
        select(DashboardShare)
        .where(DashboardShare.owner_id == owner_id, DashboardShare.status.in_(OPEN_STATES))
        .order_by(DashboardShare.created_at)
    )
    return [share for share in result.scalars().all() if is_live(share, now)]


async def create_share(
    session: AsyncSession, owner: User, label: str | None, now: datetime | None = None
) -> tuple[DashboardShare, str, str] | None:
    """A new invitation, with the link's secret and the code, which are returned only here. None when the owner is at the limit."""
    now = now or _now()
    if len(await owner_shares(session, owner.id, now)) >= MAX_SHARES:
        return None
    token, code = new_token(), new_code()
    share = DashboardShare(
        owner_id=owner.id,
        label=label,
        token_hash=_digest(token),
        code_hash=_digest(code),
        status="invited",
        expires_at=now + INVITE_VALID_FOR,
    )
    session.add(share)
    await session.commit()
    await session.refresh(share)
    return share, token, code


class Joined(enum.Enum):
    REQUESTED = "requested"
    INVALID = "invalid"
    WRONG_CODE = "wrong code"
    OWN = "own"
    ALREADY = "already"


async def join_share(
    session: AsyncSession, viewer: User, token: str, code: str, now: datetime | None = None
) -> tuple[Joined, DashboardShare | None]:
    """The other person enters the code from the link. A good code turns the invitation into a request for the owner to approve."""
    now = now or _now()
    result = await session.execute(
        select(DashboardShare).where(DashboardShare.token_hash == _digest(token)).with_for_update()
    )
    share = result.scalar_one_or_none()
    if share is None or share.status != "invited" or not is_live(share, now):
        return Joined.INVALID, None
    if share.owner_id == viewer.id:
        return Joined.OWN, None
    held = await session.execute(
        select(DashboardShare.id).where(
            DashboardShare.owner_id == share.owner_id,
            DashboardShare.viewer_id == viewer.id,
            DashboardShare.status.in_(("requested", "active")),
        )
    )
    if held.first() is not None:
        return Joined.ALREADY, None
    if not hmac.compare_digest(share.code_hash, _digest(code)):
        share.failed_codes += 1
        if share.failed_codes >= MAX_WRONG_CODES:
            share.status = "revoked"
        await session.commit()
        return Joined.WRONG_CODE, None
    share.status = "requested"
    share.viewer_id = viewer.id
    await session.commit()
    return Joined.REQUESTED, share


class Decision(enum.Enum):
    DONE = "done"
    MISSING = "missing"
    NOT_NOW = "not now"


async def _owned(session: AsyncSession, owner: User, share_id: str) -> DashboardShare | None:
    try:
        key = uuid.UUID(share_id)
    except ValueError:
        return None
    result = await session.execute(
        select(DashboardShare).where(DashboardShare.id == key, DashboardShare.owner_id == owner.id)
    )
    return result.scalar_one_or_none()


async def approve_share(session: AsyncSession, owner: User, share_id: str, now: datetime | None = None) -> Decision:
    now = now or _now()
    share = await _owned(session, owner, share_id)
    if share is None or not is_live(share, now):
        return Decision.MISSING
    if share.status != "requested":
        return Decision.NOT_NOW
    share.status = "active"
    share.approved_at = now
    await session.commit()
    return Decision.DONE


async def revoke_share(session: AsyncSession, owner: User, share_id: str) -> bool:
    """Ends a share, whatever stage it is at. True if there was one to end."""
    share = await _owned(session, owner, share_id)
    if share is None or share.status == "revoked":
        return False
    share.status = "revoked"
    await session.commit()
    return True


async def shared_with(session: AsyncSession, viewer_id: uuid.UUID, now: datetime | None = None) -> list[tuple[DashboardShare, User]]:
    """The dashboards this person has been given, or is waiting to be given, with whose each is."""
    now = now or _now()
    result = await session.execute(
        select(DashboardShare, User)
        .join(User, User.id == DashboardShare.owner_id)
        .where(DashboardShare.viewer_id == viewer_id, DashboardShare.status.in_(("requested", "active")))
        .order_by(DashboardShare.created_at)
    )
    return [(share, owner) for share, owner in result.all() if is_live(share, now)]


async def viewable_share(
    session: AsyncSession, viewer: User, share_id: str, now: datetime | None = None
) -> tuple[DashboardShare, User] | None:
    """An approved share this person may look at, with its owner, and the time of the look is kept. Nothing else opens."""
    try:
        key = uuid.UUID(share_id)
    except ValueError:
        return None
    result = await session.execute(
        select(DashboardShare, User)
        .join(User, User.id == DashboardShare.owner_id)
        .where(DashboardShare.id == key, DashboardShare.viewer_id == viewer.id, DashboardShare.status == "active")
    )
    row = result.first()
    if row is None:
        return None
    share, owner = row
    share.last_viewed_at = now or _now()
    await session.commit()
    await session.refresh(share)
    await session.refresh(owner)
    return share, owner
