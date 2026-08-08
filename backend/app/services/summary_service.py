"""
Orchestrates Phase 5 summarization for POST /api/summarize:

  scope (document or folder) -> resolve to a document-id set
  (retrieval_service, reused unchanged from Phase 4 -- no new scope logic)
  -> load already-indexed chunks for those documents (no new extraction/
  chunking/embedding pipeline; Phase 3's pipeline already produced these)
  -> build a reading-order context, grouped and labeled by document
  -> Ollama (ollama_service.generate_answer, the existing plain-text
  primitive -- no structured JSON needed here, unlike Phase 4 Q&A)
  -> summary text.

This is deliberately a different, simpler shape than rag_service.py:
summarization has no question to ground an answer against, no similarity
ranking, and no citation-selection step (§ Phase 5 spec explicitly says not
to force Phase 4's SOURCE_N citation mechanism in here). Chunks are used in
their natural chunk_index order (reading order), not similarity rank.
"""

import logging
from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import settings
from app.models.document import Document, ProcessingStatus
from app.models.document_chunk import DocumentChunk
from app.services import ollama_service, retrieval_service

logger = logging.getLogger(__name__)


class InvalidSummaryScopeError(ValueError):
    """Raised when scope.type isn't a valid summarization scope."""


# Shown (not sent to the LLM) when the resolved scope has no indexed
# content at all -- an empty folder, a document still processing/failed,
# or a folder containing only such documents. Calling Ollama with nothing
# to summarize would just invite invented content, so this short-circuits
# instead, mirroring rag_service.NO_CONTEXT_MESSAGE's role in Phase 4.
NO_INDEXED_CONTENT_MESSAGE = (
    "There is no indexed content available to summarize for this selection. "
    "Make sure the document(s) have finished processing (see their status) "
    "before generating a summary."
)

# A dedicated prompt, not a reuse of rag_service.SYSTEM_PROMPT -- summarizing
# is a different task from grounded question-answering (no question to
# answer, no citation selection, different failure modes to guard against).
SUMMARY_SYSTEM_PROMPT = """You are DocIntel, a document summarization assistant.

You will be given the extracted text content of one or more documents, grouped under DOCUMENT headings, each containing its own SOURCE_CHUNK sections in reading order. Write a clear, natural-language summary of this content.

Rules:
- The supplied document content below is your ONLY source of truth. Do not use outside knowledge, even information you are confident is true.
- Never invent facts, numbers, dates, names, or relationships that are not present in the supplied content.
- Preserve important numbers, dates, names, routes, and project details exactly as given -- do not round, estimate, rename, or alter them. Include specific figures (counts, measurements, times) in the summary itself rather than only describing them in vague general terms, whenever they are among the important facts.
- If multiple documents are supplied, synthesize across them into a single coherent summary rather than writing separate, disconnected summaries per document. When the same metric appears across multiple documents or dates, state each individual figure alongside its date or document so the reader can see how it changed or stayed the same.
- Do NOT compute a combined total, sum, or aggregate across documents or dates, even if the arithmetic looks simple. Only state a total if the source content itself already states that exact total explicitly -- never calculate one yourself. A wrong total is worse than no total, and listing the individual figures side by side is the correct way to synthesize a repeated metric.
- Before writing each number down, re-check it against its exact source sentence. When a single source sentence already gives a breakdown (e.g. "6 of one kind and 4 of another"), keep both figures and their labels exactly as given -- do not merge them into one figure or move a label from one figure to another.
- Focus on the most important information; do not simply restate every sentence or list every fact.
- Be concise but useful. As a rough guide: about 3-6 short paragraphs for a single document, about 5-10 for a multi-document set -- guidelines, not hard limits.
- Write plain prose (short paragraphs; a heading only if it genuinely helps organize a multi-document summary). Do not output JSON, a bullet-point dump of every fact, or the raw source text.
- If the supplied content is empty or clearly too sparse to produce a meaningful summary, say so plainly instead of inventing content to fill the gap.

The example below uses a generic scenario purely to illustrate the pattern -- it is unrelated to the real documents you will be given. Given documents that separately report 5 units shipped on Monday, 7 on Tuesday, and 3 on Wednesday:
Correct: "Units shipped were 5 on Monday, 7 on Tuesday, and 3 on Wednesday."
Incorrect: "A total of 15 units were shipped over the three days."
Never write a sentence like the incorrect example. State the individual figures side by side instead, exactly as in the correct example, even across many documents."""

# Stage 2 of the map->combine fallback (see _generate_map_reduce below). A
# distinct prompt from SUMMARY_SYSTEM_PROMPT because its input is already-
# summarized text, not raw document content -- different instructions
# apply (synthesize summaries, don't re-summarize source text).
SUMMARY_COMBINE_SYSTEM_PROMPT = """You are DocIntel, a document summarization assistant.

You will be given several short summaries, each already produced from one document, labeled by document name. Combine them into a single coherent overall summary of the whole set.

Rules:
- The supplied summaries below are your ONLY source of truth. Do not use outside knowledge, and do not invent facts, numbers, dates, or names beyond what is stated in them.
- Synthesize across the documents rather than concatenating the summaries unchanged -- merge related points, and where documents describe the same subject on different dates, state each individual figure alongside its date or document rather than combining them into a single number.
- Do NOT compute a combined total, sum, or aggregate across documents or dates, even if the arithmetic looks simple. Only state a total if one of the supplied summaries already states that exact total -- never calculate one yourself. A wrong total is worse than no total.
- Preserve important numbers, dates, names, routes, and project details exactly as given in the summaries.
- Be concise but useful: roughly 5-10 short paragraphs, as a guideline, not a hard limit.
- Write plain prose. Do not output JSON, and do not just list the input summaries verbatim one after another.

The example below uses a generic scenario purely to illustrate the pattern -- it is unrelated to the real summaries you will be given. Given summaries that separately report 5 units shipped on Monday, 7 on Tuesday, and 3 on Wednesday:
Correct: "Units shipped were 5 on Monday, 7 on Tuesday, and 3 on Wednesday."
Incorrect: "A total of 15 units were shipped over the three days."
Never write a sentence like the incorrect example. State the individual figures side by side instead."""


@dataclass
class SummaryResult:
    summary: str
    documents_included: int
    chunks_used: int


async def generate_summary(db: Session, scope_type: str, scope_id: int | None) -> SummaryResult:
    if scope_type not in ("document", "folder"):
        raise InvalidSummaryScopeError(
            "Summarization requires a specific document or folder -- scope.type must be "
            "'document' or 'folder', not 'all'."
        )

    # Reuses the exact same scope-resolution helper Phase 4 uses for RAG
    # retrieval (raises retrieval_service.ScopeNotFoundError -> 404 if the
    # id doesn't exist, and internally reuses document_service's folder-
    # descendant BFS for "folder" scope) -- no new traversal logic here.
    document_ids = retrieval_service.resolve_scope_document_ids(db, scope_type, scope_id)
    assert document_ids is not None, "resolve_scope_document_ids only returns None for 'all'"

    if not document_ids:
        # e.g. an empty folder -- nothing to query, skip straight to the message.
        return SummaryResult(summary=NO_INDEXED_CONTENT_MESSAGE, documents_included=0, chunks_used=0)

    indexed_documents = (
        db.query(Document)
        .filter(
            Document.id.in_(document_ids),
            Document.processing_status == ProcessingStatus.INDEXED.value,
        )
        .order_by(Document.name)  # deterministic, human-readable order (Aug06 < Aug07 < Aug08)
        .all()
    )
    if not indexed_documents:
        return SummaryResult(summary=NO_INDEXED_CONTENT_MESSAGE, documents_included=0, chunks_used=0)

    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id.in_([d.id for d in indexed_documents]))
        .order_by(DocumentChunk.document_id, DocumentChunk.chunk_index)
        .all()
    )
    if not chunks:
        # Shouldn't happen in practice -- "indexed" implies chunks were
        # written (Phase 3's transaction guarantee) -- but handled instead
        # of assumed, since it's cheap to check and impossible to recover
        # a meaningful summary from zero chunks regardless of cause.
        return SummaryResult(summary=NO_INDEXED_CONTENT_MESSAGE, documents_included=0, chunks_used=0)

    chunks_by_document: dict[int, list[DocumentChunk]] = defaultdict(list)
    for chunk in chunks:
        chunks_by_document[chunk.document_id].append(chunk)

    context = _build_context(indexed_documents, chunks_by_document)

    fits_char_budget = len(context) <= settings.summary_max_context_chars
    fits_document_budget = len(indexed_documents) <= settings.summary_single_pass_max_documents

    if fits_char_budget and fits_document_budget:
        logger.info(
            "Summarizing %d document(s) / %d chunk(s) in a single pass (%d context chars)",
            len(indexed_documents),
            len(chunks),
            len(context),
        )
        summary = await _summarize_text(context)
    else:
        logger.info(
            "Falling back to per-document map -> combine summarization "
            "(%d documents, %d context chars; budgets are %d documents / %d chars)",
            len(indexed_documents),
            len(context),
            settings.summary_single_pass_max_documents,
            settings.summary_max_context_chars,
        )
        summary = await _generate_map_reduce(indexed_documents, chunks_by_document)

    return SummaryResult(
        summary=summary, documents_included=len(indexed_documents), chunks_used=len(chunks)
    )


def _build_context(
    documents: list[Document], chunks_by_document: dict[int, list[DocumentChunk]]
) -> str:
    """
    DOCUMENT N / Name / SOURCE_CHUNK_N / Page / text, one block per document
    in the given order, chunks within each document ordered by chunk_index
    (i.e. logical reading order -- unlike Phase 4's similarity-rank order,
    which doesn't apply here since there's no question to rank against).
    `documents` is expected to already be in the desired display order.
    """
    blocks = []
    for doc_num, document in enumerate(documents, start=1):
        doc_chunks = sorted(chunks_by_document.get(document.id, []), key=lambda c: c.chunk_index)
        if not doc_chunks:
            continue
        chunk_blocks = []
        for i, chunk in enumerate(doc_chunks, start=1):
            page_line = f"Page {chunk.page_number}" if chunk.page_number is not None else "Page N/A"
            chunk_blocks.append(f"SOURCE_CHUNK_{i}\n{page_line}\n\n{chunk.content}")
        blocks.append(f"DOCUMENT {doc_num}\nName: {document.name}\n\n" + "\n\n".join(chunk_blocks))
    return "\n\n\n".join(blocks)


async def _summarize_text(context: str) -> str:
    user_prompt = f"{context}\n\nWrite the summary now."
    return await ollama_service.generate_answer(
        SUMMARY_SYSTEM_PROMPT, user_prompt, extra_options={"num_ctx": settings.summary_num_ctx}
    )


async def _generate_map_reduce(
    documents: list[Document], chunks_by_document: dict[int, list[DocumentChunk]]
) -> str:
    """
    Simple two-stage fallback for content too large for one prompt:
    summarize each document individually, then combine the resulting short
    per-document summaries into one final synthesis with a second, distinct
    prompt (SUMMARY_COMBINE_SYSTEM_PROMPT). Exactly two stages, not a
    general recursive/hierarchical framework -- chosen because it's the
    simplest approach that still lets the model reconcile facts across
    every document, and because the current demo corpus (~2,700 chars
    total) never actually needs this path; it exists as protection for
    future larger uploads, not because today's dataset requires it.

    If even a single document's own content exceeds the budget (impossible
    with the current test corpus), that document's chunks are deterministically
    truncated -- kept in chunk_index order until the budget fills, tail
    dropped -- rather than sending an oversized prompt to Ollama, and the
    resulting mini-summary is flagged with a short note so truncation is
    never silent.
    """
    per_document_summaries: list[str] = []

    for document in documents:
        doc_chunks = sorted(chunks_by_document.get(document.id, []), key=lambda c: c.chunk_index)
        if not doc_chunks:
            continue

        doc_context = _build_context([document], {document.id: doc_chunks})
        truncated = False
        if len(doc_context) > settings.summary_max_context_chars:
            kept: list[DocumentChunk] = []
            running_len = 0
            for chunk in doc_chunks:
                if kept and running_len + len(chunk.content) > settings.summary_max_context_chars:
                    break
                kept.append(chunk)
                running_len += len(chunk.content)
            doc_context = _build_context([document], {document.id: kept})
            truncated = True

        doc_summary = await _summarize_text(doc_context)
        if truncated:
            doc_summary += (
                " (Note: this document's content was truncated to fit the "
                "summarization context budget.)"
            )
        per_document_summaries.append(f"Document: {document.name}\n{doc_summary}")

    combined_input = "\n\n".join(per_document_summaries)
    combine_prompt = f"{combined_input}\n\nWrite the combined summary now."
    return await ollama_service.generate_answer(
        SUMMARY_COMBINE_SYSTEM_PROMPT,
        combine_prompt,
        extra_options={"num_ctx": settings.summary_num_ctx},
    )
