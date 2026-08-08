"""
ORM models, registered against the shared declarative Base (app/db.py).

Importing this package (or the individual modules) is what makes the
models visible to Alembic's autogenerate and to SQLAlchemy's relationship
resolution — Folder, Document, and DocumentChunk must all be imported
before mappers are configured, since they reference each other by class
name as strings.
"""

from app.models.document import Document, ProcessingStatus
from app.models.document_chunk import DocumentChunk
from app.models.folder import Folder

__all__ = ["Folder", "Document", "ProcessingStatus", "DocumentChunk"]
