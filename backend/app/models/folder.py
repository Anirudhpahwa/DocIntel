"""
Folder ORM model.

Folders form a self-referential tree via `parent_id`. `path` is the
materialized logical path ("NHSRCL/Reports/2026") and is the source of
truth for find-or-create lookups during upload — it stays unique and
NULL-safe, unlike a (parent_id, name) constraint would be for root-level
folders (parent_id IS NULL).
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("folders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Full logical path from the upload root, e.g. "NHSRCL/Reports/2026".
    path: Mapped[str] = mapped_column(String(2048), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # passive_deletes=True: don't let SQLAlchemy try to manage cascading in
    # Python (which would just NULL out child FKs); let Postgres's
    # ON DELETE CASCADE handle it in a single statement instead.
    parent: Mapped["Folder | None"] = relationship(
        "Folder",
        remote_side=[id],
        back_populates="children",
        passive_deletes=True,
    )
    children: Mapped[list["Folder"]] = relationship(
        "Folder",
        back_populates="parent",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    documents: Mapped[list["Document"]] = relationship(
        "Document",
        cascade="all, delete-orphan",
        passive_deletes=True,
        back_populates="folder",
    )
