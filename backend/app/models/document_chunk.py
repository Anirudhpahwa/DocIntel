"""
DocumentChunk ORM model — one row per chunk of extracted text, with its
embedding vector stored alongside it in the same Postgres database via
pgvector. No separate vector store.

EMBEDDING_DIMENSIONS is defined here (the schema fact) and imported by
embedding_service.py, rather than the other way around, so the model file
stays the single source of truth for what the DB column expects.
"""

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

# sentence-transformers/all-MiniLM-L6-v2 produces 384-dimensional vectors.
EMBEDDING_DIMENSIONS = 384


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # NULL for DOCX/TXT, which have no reliable page boundaries.
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 0-based, sequential within a document (in extraction order).
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMENSIONS), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    document: Mapped["Document"] = relationship("Document", back_populates="chunks")
