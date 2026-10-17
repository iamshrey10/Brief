"""add the answer traces table

Revision ID: a7d3e5b19c42
Revises: e63c9f2a8b41
Create Date: 2026-10-17 09:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a7d3e5b19c42'
down_revision: Union[str, None] = 'e63c9f2a8b41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('answer_traces',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('document_id', sa.UUID(), nullable=False),
    sa.Column('request_id', sa.String(length=64), nullable=False),
    sa.Column('kind', sa.String(length=50), nullable=False),
    sa.Column('outcome', sa.String(length=50), nullable=False),
    sa.Column('retrieved', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('cited', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('elapsed_ms', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_answer_traces_document_id'), 'answer_traces', ['document_id'], unique=False)
    op.create_index(op.f('ix_answer_traces_request_id'), 'answer_traces', ['request_id'], unique=False)
    op.create_index(op.f('ix_answer_traces_user_id'), 'answer_traces', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_answer_traces_user_id'), table_name='answer_traces')
    op.drop_index(op.f('ix_answer_traces_request_id'), table_name='answer_traces')
    op.drop_index(op.f('ix_answer_traces_document_id'), table_name='answer_traces')
    op.drop_table('answer_traces')
