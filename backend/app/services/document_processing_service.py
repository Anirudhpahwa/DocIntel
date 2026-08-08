"""
Orchestrates the per-document pipeline: extract -> clean -> chunk -> embed
-> persist. Called synchronously right after a document is stored (see
api/documents.py) — this is a two-day local demo, so no background worker
queue; processing finishes before the upload request returns.

Transaction shape, chosen so a failure never leaves a misleading status:
  1. Mark the document "processing" and delete any existing chunks for it
     (a re-upload's old chunks describe a file that's already gone from
     disk — they must never survive, success or failure) — commit.
  2. Extract, chunk, embed, insert new chunks, mark "indexed" — commit,
     all together, only on full success.
  3. On any exception: roll back the partial insert (nothing from step 1
     is touched), mark "failed" with a diagnostic message — commit.
A document therefore always ends this function in either "indexed" (with
fresh chunks matching the current file) or "failed" (with zero chunks) —
never a stale or half-written state.
"""

import logging

from sqlalchemy.orm import Session

from app.models.document import Document, ProcessingStatus
from app.models.document_chunk import DocumentChunk
from app.services import chunking_service, embedding_service, extraction_service, storage_service

logger = logging.getLogger(__name__)

# Cap stored error messages so a pathological exception message can't bloat the row.
_MAX_ERROR_LENGTH = 2000


def process_document(db: Session, document_id: int) -> None:
    document = db.get(Document, document_id)
    if document is None:
        return

    document.processing_status = ProcessingStatus.PROCESSING.value
    document.processing_error = None
    db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).delete()
    db.commit()

    try:
        abs_path = storage_service.resolve_storage_path(document.file_path)
        pages = extraction_service.extract_document(abs_path, document.file_type)
        drafts = chunking_service.chunk_pages(pages)
        vectors = embedding_service.embed_texts([d.content for d in drafts]) if drafts else []

        for draft, vector in zip(drafts, vectors):
            db.add(
                DocumentChunk(
                    document_id=document.id,
                    page_number=draft.page_number,
                    chunk_index=draft.chunk_index,
                    content=draft.content,
                    embedding=vector,
                )
            )

        document.processing_status = ProcessingStatus.INDEXED.value
        document.processing_error = None
        db.commit()
        logger.info("Indexed document id=%s (%d chunks)", document_id, len(drafts))

    except Exception as exc:
        db.rollback()
        logger.exception("Failed to process document id=%s", document_id)

        failed_document = db.get(Document, document_id)
        if failed_document is not None:
            failed_document.processing_status = ProcessingStatus.FAILED.value
            failed_document.processing_error = str(exc)[:_MAX_ERROR_LENGTH]
            db.commit()
