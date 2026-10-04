"""Create ML schema

Revision ID: 001_create_ml_schema
Revises: 
Create Date: 2026-10-03 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '001_create_ml_schema'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS ml")

def downgrade() -> None:
    op.execute("DROP SCHEMA IF EXISTS ml CASCADE")
