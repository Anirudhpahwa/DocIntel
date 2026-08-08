"""
Scope resolution + vector similarity retrieval for RAG queries.

The nearest-neighbor search happens entirely in PostgreSQL via pgvector's
cosine_distance operator (ORDER BY ... LIMIT K) — chunks are never loaded
into Python to be ranked by hand. Folder scope reuses
document_service.collect_documents_under_folder rather than re-implementing
folder-subtree traversal here.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document import Document, ProcessingStatus
from app.models.document_chunk import DocumentChunk
from app.models.folder import Folder
from app.services import document_service


class ScopeNotFoundError(ValueError):
    """Raised when scope.type is 'document'/'folder' but that id doesn't exist."""


@dataclass
class RetrievedChunk:
    document_id: int
    document_name: str
    page_number: int | None
    chunk_index: int
    content: str
    similarity: float  # 1 - cosine_distance; 1.0 = identical, higher = more relevant


def resolve_scope_document_ids(
    db: Session, scope_type: str, scope_id: int | None
) -> list[int] | None:
    """
    Translate a query scope into the set of document IDs retrieval should
    be constrained to. Returns None for scope_type == "all" (no
    constraint beyond "indexed", applied separately by the caller).

    Raises ScopeNotFoundError if scope_type is "document"/"folder" and
    that id doesn't exist — the router turns this into a 404.
    """
    if scope_type == "all":
        return None

    if scope_type == "document":
        document = db.get(Document, scope_id)
        if document is None:
            raise ScopeNotFoundError(f"Document {scope_id} not found")
        return [document.id]

    if scope_type == "folder":
        folder = db.get(Folder, scope_id)
        if folder is None:
            raise ScopeNotFoundError(f"Folder {scope_id} not found")
        # Reuses the same BFS helper Phase 2 uses for recursive folder delete.
        documents = document_service.collect_documents_under_folder(db, scope_id)
        return [d.id for d in documents]

    raise ValueError(f"Unknown scope type: {scope_type!r}")


def retrieve_relevant_chunks(
    db: Session,
    query_embedding: list[float],
    document_ids: list[int] | None,
    top_k: int,
    similarity_threshold: float,
) -> list[RetrievedChunk]:
    """
    Top-K chunks by cosine similarity to query_embedding, constrained to
    `document_ids` (or unconstrained if None, i.e. scope "all") and always
    limited to documents with processing_status == "indexed". Chunks below
    similarity_threshold are dropped so a bad match never gets forwarded
    to the LLM as if it were relevant context.
    """
    if document_ids is not None and not document_ids:
        return []  # e.g. an empty folder — nothing to search, skip the query entirely

    distance = DocumentChunk.embedding.cosine_distance(query_embedding)

    stmt = (
        select(DocumentChunk, Document.name, distance.label("distance"))
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(Document.processing_status == ProcessingStatus.INDEXED.value)
    )
    if document_ids is not None:
        stmt = stmt.where(DocumentChunk.document_id.in_(document_ids))
    stmt = stmt.order_by(distance).limit(top_k)

    results: list[RetrievedChunk] = []
    for chunk, document_name, distance_value in db.execute(stmt).all():
        similarity = 1 - distance_value
        if similarity < similarity_threshold:
            continue
        results.append(
            RetrievedChunk(
                document_id=chunk.document_id,
                document_name=document_name,
                page_number=chunk.page_number,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                similarity=similarity,
            )
        )
    return results
