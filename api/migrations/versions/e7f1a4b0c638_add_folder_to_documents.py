"""add the storage folder to documents

Revision ID: e7f1a4b0c638
Revises: d6e0f3a9b527
Create Date: 2026-11-05 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e7f1a4b0c638'
down_revision: Union[str, None] = 'd6e0f3a9b527'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('folder', sa.String(length=50), server_default='Other', nullable=False))
    # A document already there belongs in the folder for its kind.
    op.execute("UPDATE documents SET folder = 'Lease' WHERE doc_type = 'lease'")
    op.execute("UPDATE documents SET folder = 'Education_Loan' WHERE doc_type = 'loan'")
    op.execute("UPDATE documents SET folder = 'Job_Offers' WHERE doc_type = 'offer'")


def downgrade() -> None:
    op.drop_column('documents', 'folder')
