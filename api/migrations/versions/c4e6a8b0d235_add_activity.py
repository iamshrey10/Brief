"""count how long people have Brief open, per person per day, for the admin page

Revision ID: c4e6a8b0d235
Revises: b3d5f7a9c124
Create Date: 2026-11-12 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c4e6a8b0d235'
down_revision: Union[str, None] = 'b3d5f7a9c124'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'activity',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('seconds', sa.Integer(), server_default='0', nullable=False),
        sa.Column('visits', sa.Integer(), server_default='0', nullable=False),
        sa.Column('last_signal_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'day'),
    )


def downgrade() -> None:
    op.drop_table('activity')
