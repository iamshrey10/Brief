"""record how far a read has got

Revision ID: c41a7d2e9b05
Revises: 8e85d63f0984
Create Date: 2026-10-07 10:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c41a7d2e9b05'
down_revision: Union[str, None] = '8e85d63f0984'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('progress_done', sa.Integer(), nullable=True))
    op.add_column('documents', sa.Column('progress_total', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'progress_total')
    op.drop_column('documents', 'progress_done')
