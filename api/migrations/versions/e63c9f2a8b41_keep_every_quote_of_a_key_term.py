"""keep every quote of a key term

Revision ID: e63c9f2a8b41
Revises: d52b8e1f7a30
Create Date: 2026-10-13 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e63c9f2a8b41'
down_revision: Union[str, None] = 'd52b8e1f7a30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable on purpose: every row saved so far has one quote, in the quote column, and loading
    # falls back to that when this is empty.
    op.add_column('extractions', sa.Column('evidence', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('extractions', 'evidence')
