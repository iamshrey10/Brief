"""give every dashboard share an end: how long it was meant to last, and when access stops

Existing approved shares had no end. They are given 30 days from the day this runs, so none lasts for ever.

Revision ID: b3d5f7a9c124
Revises: a1c9d3e5f702
Create Date: 2026-11-12 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b3d5f7a9c124'
down_revision: Union[str, None] = 'a1c9d3e5f702'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('dashboard_shares', sa.Column('access_hours', sa.Integer(), nullable=True))
    op.add_column('dashboard_shares', sa.Column('access_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('dashboard_shares', sa.Column('access_ends_at', sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE dashboard_shares SET access_ends_at = now() + interval '30 days' WHERE status = 'active'")


def downgrade() -> None:
    op.drop_column('dashboard_shares', 'access_ends_at')
    op.drop_column('dashboard_shares', 'access_until')
    op.drop_column('dashboard_shares', 'access_hours')
