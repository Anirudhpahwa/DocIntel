"""
Document ORM model.

Phase 2 stores metadata + a pointer to the physical file on the local
filesystem only — no extracted text, chunks, or embeddings yet (Phase 3).
`folder_id` is nullable: NULL means the document sits at the top level
(e.g. from a plain "Upload Files" action with no folder involved).
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


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
