"""
Pydantic request/response schemas for the documents & folders API.

Kept separate from the SQLAlchemy models in app/models/: those describe the
database, these describe the wire format. `file_path` (the physical,
UUID-named location on disk) is intentionally never exposed here.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.config import settings


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


# ---- RAG query (Phase 4) ----


class QueryScope(BaseModel):
    type: Literal["all", "folder", "document"] = "all"
    id: int | None = None

    @model_validator(mode="after")
    def _id_required_for_scoped_types(self) -> "QueryScope":
        if self.type in ("folder", "document") and self.id is None:
            raise ValueError(f"scope.id is required when scope.type is '{self.type}'")
        return self


class QueryRequest(BaseModel):
    question: str
    scope: QueryScope = QueryScope()

    @field_validator("question")
    @classmethod
    def _validate_question(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("question must not be empty")
        if len(value) > settings.rag_max_question_length:
            raise ValueError(
                f"question must be at most {settings.rag_max_question_length} characters"
            )
        return value


class SourceOut(BaseModel):
    document_id: int
    document_name: str
    page_number: int | None


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceOut]
    chunks_retrieved: int


class LLMAnswerWithSources(BaseModel):
    """
    Shape of the structured JSON Ollama is asked to return for a query
    (Phase 4 source-selection). Internal only — never returned directly by
    the API. `supporting_source_ids` are expected to be a subset of the
    backend-generated, request-scoped "SOURCE_N" labels handed to the model
    in the prompt (see rag_service._build_context); they are NOT database
    ids and must never be trusted as citation metadata on their own —
    rag_service validates every id against the labels it actually sent
    before mapping any of them back to real chunk/document metadata.
    """

    answer: str
    supporting_source_ids: list[str] = []
