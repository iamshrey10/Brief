"""count anonymous site events per day, such as the demo video being opened, for the admin page

Revision ID: d6f8b0c2e346
Revises: c4e6a8b0d235
Create Date: 2026-11-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd6f8b0c2e346'
down_revision: Union[str, None] = 'c4e6a8b0d235'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'site_events',
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('name', sa.String(length=40), nullable=False),
        sa.Column('count', sa.Integer(), server_default='0', nullable=False),
        sa.PrimaryKeyConstraint('day', 'name'),
    )


def downgrade() -> None:
    op.drop_table('site_events')
