"""add reminders: what a person asked to be reminded of, with a date, and optionally a time, a note and a document

Revision ID: a4c7e1b92d58
Revises: d6f8b0c2e346
Create Date: 2026-11-17 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a4c7e1b92d58'
down_revision: Union[str, None] = 'd6f8b0c2e346'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'reminders',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('title', sa.String(length=120), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('due_time', sa.Time(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_reminders_user_id'), 'reminders', ['user_id'], unique=False)
    op.create_index(op.f('ix_reminders_document_id'), 'reminders', ['document_id'], unique=False)
    op.create_index('ix_reminders_user_id_due_date', 'reminders', ['user_id', 'due_date'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_reminders_user_id_due_date', table_name='reminders')
    op.drop_index(op.f('ix_reminders_document_id'), table_name='reminders')
    op.drop_index(op.f('ix_reminders_user_id'), table_name='reminders')
    op.drop_table('reminders')
