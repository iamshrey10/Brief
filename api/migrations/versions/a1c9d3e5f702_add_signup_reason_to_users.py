"""remember why a person said they came to Brief, to count what people use it for

Revision ID: a1c9d3e5f702
Revises: f8a2b5c1d749
Create Date: 2026-11-12 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1c9d3e5f702'
down_revision: Union[str, None] = 'f8a2b5c1d749'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('signup_reason', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'signup_reason')
