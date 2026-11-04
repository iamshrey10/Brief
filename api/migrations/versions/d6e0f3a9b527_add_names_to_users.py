"""add first and last name to users

Revision ID: d6e0f3a9b527
Revises: c5d9e2f8a416
Create Date: 2026-11-04 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd6e0f3a9b527'
down_revision: Union[str, None] = 'c5d9e2f8a416'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('first_name', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')
