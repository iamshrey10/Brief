"""Two step verification with an authenticator app (time based one time codes, RFC 6238).

The secret is kept encrypted. A code works once. Wrong codes lock the account for a while. A person can keep a browser
trusted for thirty days, and lose their phone without losing their account by using one of ten recovery codes."""

import base64
import enum
import hashlib
import hmac
import secrets
import struct
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from cryptography.fernet import Fernet
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import RecoveryCode, TrustedDevice, TwoFactor, User

ISSUER = "Brief"
STEP_SECONDS = 30
DIGITS = 6
# A code from the step before or after is accepted too, since a phone's clock is rarely exact.
WINDOW = 1
MAX_WRONG_CODES = 5
LOCKED_FOR = timedelta(minutes=15)
DEVICE_TRUSTED_FOR = timedelta(days=30)
MAX_DEVICES = 10
RECOVERY_CODES = 10
# No 0, O, 1, I or L, which are easy to misread when copying a code down by hand.
RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _keyed(value: str) -> str:
    return hmac.new(settings.service_jwt_secret.encode(), b"brief-two-factor-hash:" + value.encode(), hashlib.sha256).hexdigest()


def _cipher() -> Fernet:
    key = hashlib.sha256(b"brief-two-factor-encryption:" + settings.service_jwt_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def otpauth_uri(secret: str, email: str) -> str:
    """What an authenticator app reads from the QR code."""
    label = quote(f"{ISSUER}:{email}", safe="")
    return f"otpauth://totp/{label}?secret={secret}&issuer={ISSUER}&algorithm=SHA1&digits={DIGITS}&period={STEP_SECONDS}"


def code_for_step(secret: str, step: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % 10**DIGITS
    return f"{number:0{DIGITS}d}"


def step_at(now: datetime) -> int:
    return int(now.timestamp()) // STEP_SECONDS


def matching_step(secret: str, code: str, now: datetime, after_step: int) -> int | None:
    """The step this code is for, if it is right and has not been used, else None."""
    current = step_at(now)
    for step in range(current - WINDOW, current + WINDOW + 1):
        if step > after_step and hmac.compare_digest(code_for_step(secret, step), code):
            return step
    return None


def _normal_recovery(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def new_recovery_code() -> str:
    raw = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(10))
    return f"{raw[:5]}-{raw[5:]}"


async def _row(session: AsyncSession, user_id: uuid.UUID) -> TwoFactor | None:
    result = await session.execute(select(TwoFactor).where(TwoFactor.user_id == user_id).with_for_update())
    return result.scalar_one_or_none()


async def codes_left(session: AsyncSession, user_id: uuid.UUID) -> int:
    return await session.scalar(
        select(func.count()).select_from(RecoveryCode).where(RecoveryCode.user_id == user_id, RecoveryCode.used_at.is_(None))
    )


async def is_enabled(session: AsyncSession, user_id: uuid.UUID) -> bool:
    row = await session.scalar(select(TwoFactor.enabled).where(TwoFactor.user_id == user_id))
    return bool(row)


async def begin_setup(session: AsyncSession, user: User) -> str | None:
    """A new secret to put in an authenticator app. Nothing is switched on until a code from it is proved. None if it is already on."""
    row = await _row(session, user.id)
    if row is not None and row.enabled:
        return None
    secret = new_secret()
    encrypted = _cipher().encrypt(secret.encode()).decode()
    if row is None:
        session.add(TwoFactor(user_id=user.id, secret_encrypted=encrypted))
    else:
        row.secret_encrypted = encrypted
        row.last_used_step = 0
    await session.commit()
    return secret


class Tried(enum.Enum):
    RIGHT = "right"
    WRONG = "wrong"
    LOCKED = "locked"


async def _try_code(session: AsyncSession, row: TwoFactor, code: str, now: datetime) -> tuple[Tried, str | None]:
    """Checks a code against the person's secret or, failing that, an unused recovery code. Every wrong try is counted, and after
    five the account takes no codes for fifteen minutes, so a six digit code cannot be guessed. Returns how it was right: "app" or "recovery"."""
    if row.locked_until is not None and row.locked_until > now:
        return Tried.LOCKED, None
    code = code.strip()
    how: str | None = None
    if code.isdigit() and len(code) == DIGITS:
        secret = _cipher().decrypt(row.secret_encrypted.encode()).decode()
        step = matching_step(secret, code, now, row.last_used_step)
        if step is not None:
            row.last_used_step = step
            how = "app"
    elif code:
        used = await session.execute(
            select(RecoveryCode)
            .where(RecoveryCode.user_id == row.user_id, RecoveryCode.code_hash == _keyed(_normal_recovery(code)), RecoveryCode.used_at.is_(None))
            .with_for_update()
        )
        recovery = used.scalar_one_or_none()
        if recovery is not None:
            recovery.used_at = now
            how = "recovery"
    if how is None:
        row.failed_attempts += 1
        if row.failed_attempts >= MAX_WRONG_CODES:
            row.locked_until = now + LOCKED_FOR
            row.failed_attempts = 0
        await session.commit()
        return Tried.WRONG, None
    row.failed_attempts = 0
    row.locked_until = None
    await session.commit()
    return Tried.RIGHT, how


async def confirm_setup(session: AsyncSession, user: User, code: str, now: datetime | None = None) -> tuple[Tried | None, list[str]]:
    """Switches two step verification on once a code from the new secret is right, and returns the recovery codes, shown only now.
    The first part is None when there is no setup waiting."""
    now = now or _now()
    row = await _row(session, user.id)
    if row is None or row.enabled:
        return None, []
    tried, _ = await _try_code(session, row, code, now)
    if tried is not Tried.RIGHT:
        return tried, []
    row.enabled = True
    await session.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
    codes = [new_recovery_code() for _ in range(RECOVERY_CODES)]
    for code_text in codes:
        session.add(RecoveryCode(user_id=user.id, code_hash=_keyed(_normal_recovery(code_text))))
    await session.commit()
    return Tried.RIGHT, codes


async def _trust_device(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> str:
    # The oldest are dropped to make room, so the list never grows without end.
    result = await session.execute(
        select(TrustedDevice).where(TrustedDevice.user_id == user_id).order_by(TrustedDevice.created_at.desc())
    )
    for old in result.scalars().all()[MAX_DEVICES - 1 :]:
        await session.delete(old)
    token = secrets.token_urlsafe(32)
    session.add(TrustedDevice(user_id=user_id, token_hash=_keyed(token), last_seen_at=now, expires_at=now + DEVICE_TRUSTED_FOR))
    await session.commit()
    return token


class Verified(enum.Enum):
    OK = "ok"
    WRONG = "wrong"
    LOCKED = "locked"
    NOT_ON = "not on"


async def verify(
    session: AsyncSession, user: User, code: str, remember: bool, now: datetime | None = None
) -> tuple[Verified, str | None, str | None]:
    """Checks a code at sign in. Returns the outcome, the secret for a remembered browser if one was asked for, and how the code was
    right ("app" or "recovery")."""
    now = now or _now()
    row = await _row(session, user.id)
    if row is None or not row.enabled:
        return Verified.NOT_ON, None, None
    tried, how = await _try_code(session, row, code, now)
    if tried is Tried.LOCKED:
        return Verified.LOCKED, None, None
    if tried is Tried.WRONG:
        return Verified.WRONG, None, None
    device = await _trust_device(session, user.id, now) if remember else None
    return Verified.OK, device, how


async def check(session: AsyncSession, user: User, device_token: str | None, now: datetime | None = None) -> tuple[bool, bool]:
    """Whether this person has to give a code at all, and whether this browser is one they chose to remember."""
    now = now or _now()
    if not await is_enabled(session, user.id):
        return False, False
    if not device_token:
        return True, False
    result = await session.execute(
        select(TrustedDevice).where(
            TrustedDevice.user_id == user.id, TrustedDevice.token_hash == _keyed(device_token), TrustedDevice.expires_at > now
        )
    )
    device = result.scalar_one_or_none()
    if device is None:
        return True, False
    device.last_seen_at = now
    await session.commit()
    return True, True


async def disable(session: AsyncSession, user: User, code: str, now: datetime | None = None) -> Verified:
    """Turns two step verification off, which needs a right code, so someone at an unlocked phone cannot do it."""
    now = now or _now()
    row = await _row(session, user.id)
    if row is None or not row.enabled:
        return Verified.NOT_ON
    tried, _ = await _try_code(session, row, code, now)
    if tried is Tried.LOCKED:
        return Verified.LOCKED
    if tried is Tried.WRONG:
        return Verified.WRONG
    await session.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
    await session.execute(delete(TrustedDevice).where(TrustedDevice.user_id == user.id))
    await session.delete(row)
    await session.commit()
    return Verified.OK
