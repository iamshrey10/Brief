"""add the usage table

Revision ID: d52b8e1f7a30
Revises: c41a7d2e9b05
Create Date: 2026-10-11 09:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd52b8e1f7a30'
down_revision: Union[str, None] = 'c41a7d2e9b05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('usage',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('kind', sa.String(length=50), nullable=False),
    sa.Column('count', sa.Integer(), server_default='0', nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'day', 'kind')
    )


def downgrade() -> None:
    op.drop_table('usage')
