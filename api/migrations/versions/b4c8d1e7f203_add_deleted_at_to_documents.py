"""add deleted_at to documents, for the bin

Revision ID: b4c8d1e7f203
Revises: a7d3e5b19c42
Create Date: 2026-11-03 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b4c8d1e7f203'
down_revision: Union[str, None] = 'a7d3e5b19c42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f('ix_documents_deleted_at'), 'documents', ['deleted_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_documents_deleted_at'), table_name='documents')
    op.drop_column('documents', 'deleted_at')
