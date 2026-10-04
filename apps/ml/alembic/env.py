import sys
import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context
from tradr_ml.config import settings
from tradr_ml.db.models import Base

# add src to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)) + "/src")

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# We pass the URL directly to configure/engine_from_config instead
# of setting it in the config object, to avoid configparser interpolation errors
# with the % symbol in the password.

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        version_table_schema=settings.ML_SCHEMA
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        url=settings.DATABASE_URL,
    )

    with connectable.connect() as connection:
        import sqlalchemy as sa
        # Ensure the schema exists before Alembic tries to create the version table in it
        connection.execute(sa.text(f"CREATE SCHEMA IF NOT EXISTS {settings.ML_SCHEMA}"))
        connection.commit()

        context.configure(
            connection=connection, 
            target_metadata=target_metadata,
            include_schemas=True,
            version_table_schema=settings.ML_SCHEMA
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
