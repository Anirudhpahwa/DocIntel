"""
Pydantic request/response schemas for the documents & folders API.

Kept separate from the SQLAlchemy models in app/models/: those describe the
database, these describe the wire format. `file_path` (the physical,
UUID-named location on disk) is intentionally never exposed here.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    folder_id: int | None
    name: str
    original_filename: str
    file_type: str
    file_size: int
    created_at: datetime
    updated_at: datetime
    processing_status: str  # "pending" | "processing" | "indexed" | "failed"
    processing_error: str | None


class FolderNode(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    parent_id: int | None
    path: str
    created_at: datetime
    folders: list["FolderNode"] = []
    documents: list[DocumentOut] = []


FolderNode.model_rebuild()


class DocumentTreeResponse(BaseModel):
    folders: list[FolderNode] = []
    documents: list[DocumentOut] = []


class UploadFileResult(BaseModel):
    filename: str
    relative_path: str
    status: str  # "created" | "replaced" | "error"
    document_id: int | None = None
    error: str | None = None
    # Populated once processing (extract/chunk/embed) finishes for this
    # file — processing runs synchronously as part of the same request.
    processing_status: str | None = None
    processing_error: str | None = None


class UploadResponse(BaseModel):
    results: list[UploadFileResult]
    created: int
    replaced: int
    failed: int
