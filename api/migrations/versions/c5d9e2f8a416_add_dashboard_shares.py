"""add the dashboard shares table

Revision ID: c5d9e2f8a416
Revises: b4c8d1e7f203
Create Date: 2026-11-04 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c5d9e2f8a416'
down_revision: Union[str, None] = 'b4c8d1e7f203'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'dashboard_shares',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('owner_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('viewer_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('label', sa.String(length=100), nullable=True),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('code_hash', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('failed_codes', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_viewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['viewer_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_dashboard_shares_owner_id'), 'dashboard_shares', ['owner_id'], unique=False)
    op.create_index(op.f('ix_dashboard_shares_viewer_id'), 'dashboard_shares', ['viewer_id'], unique=False)
    op.create_index(op.f('ix_dashboard_shares_token_hash'), 'dashboard_shares', ['token_hash'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_dashboard_shares_token_hash'), table_name='dashboard_shares')
    op.drop_index(op.f('ix_dashboard_shares_viewer_id'), table_name='dashboard_shares')
    op.drop_index(op.f('ix_dashboard_shares_owner_id'), table_name='dashboard_shares')
    op.drop_table('dashboard_shares')
