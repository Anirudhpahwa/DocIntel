"""
ORM models, registered against the shared declarative Base (app/db.py).

Importing this package (or the individual modules) is what makes the
models visible to Alembic's autogenerate and to SQLAlchemy's relationship
resolution — both Folder and Document must be imported before mappers are
configured, since each references the other by class name as a string.
"""

from app.models.document import Document
from app.models.folder import Folder

__all__ = ["Folder", "Document"]
