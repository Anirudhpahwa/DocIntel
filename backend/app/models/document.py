"""
Document ORM model.

Phase 2 added metadata + a pointer to the physical file on the local
filesystem. Phase 3 adds processing status tracking and a `chunks`
relationship to DocumentChunk (extracted text + embeddings) — see
document_processing_service.py for the pipeline that populates it.
`folder_id` is nullable: NULL means the document sits at the top level
(e.g. from a plain "Upload Files" action with no folder involved).
"""

from datetime import datetime
from enum import Enum

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class ProcessingStatus(str, Enum):
    """Lifecycle of a document's text-extraction/chunking/embedding pipeline."""

    PENDING = "pending"
    PROCESSING = "processing"
    INDEXED = "indexed"
    FAILED = "failed"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    folder_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("folders.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # Logical display name, e.g. "January.pdf". Equal to original_filename
    # unless a future phase starts allowing renames.
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Filename exactly as supplied by the uploader, kept for reference/citations.
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # Path to the physical file, relative to settings.storage_root
    # (e.g. "documents/3f9a1c2e....pdf"). Never derived from user input.
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    # Lowercase extension without the dot: "pdf" | "docx" | "txt".
    file_type: Mapped[str] = mapped_column(String(10), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # Phase 3: text-extraction/chunking/embedding pipeline status. New
    # documents start "pending"; the upload endpoint kicks off processing
    # synchronously right after the row is committed (see
    # document_processing_service.process_document).
    processing_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=ProcessingStatus.PENDING.value,
        server_default=ProcessingStatus.PENDING.value,
    )
    # Set only when processing_status == "failed"; cleared on every new
    # processing attempt.
    processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    folder: Mapped["Folder | None"] = relationship("Folder", back_populates="documents")
    chunks: Mapped[list["DocumentChunk"]] = relationship(
        "DocumentChunk",
        cascade="all, delete-orphan",
        passive_deletes=True,
        back_populates="document",
    )
