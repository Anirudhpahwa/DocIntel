"""
Database connection layer.

Provides a SQLAlchemy engine/session for PostgreSQL, plus small helper
functions used by the health check. ORM models (app/models/) declare their
tables against the shared `Base` defined here; Alembic (backend/alembic/)
owns turning those model definitions into actual schema migrations.
"""

from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_connection() -> bool:
    """Return True if a simple query against PostgreSQL succeeds."""
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
        return True


def check_pgvector_available() -> bool:
    """
    Return True if the pgvector extension is enabled on the connected
    database. Attempts to enable it if it isn't already (requires the
    pgvector extension files to be present in the Postgres image, which the
    pgvector/pgvector Docker image provides).
    """
    with SessionLocal() as db:
        db.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        db.commit()
        result = db.execute(
            text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
        ).first()
        return result is not None
