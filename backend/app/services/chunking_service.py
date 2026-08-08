"""
Text cleaning + deterministic chunking.

clean_text() only normalizes whitespace — it never touches numbers, dates,
names, or punctuation, since later phases need those intact for questions
like "how many trains ran from Ahmedabad to Mumbai from 6 Aug to 30 Aug?".

chunk_pages() packs each page's paragraphs into ~CHUNK_SIZE-character
blocks (splitting an oversized paragraph at word boundaries, never
mid-word), then stitches ~CHUNK_OVERLAP characters of trailing context from
each block onto the next so adjacent chunks share context. Overlap is kept
within a page's own text — chunk boundaries otherwise follow page
boundaries for PDFs, matching Phase 4's citation needs.
"""

import re
from dataclasses import dataclass

from app.services.extraction_service import ExtractedPage

CHUNK_SIZE = 1200
CHUNK_OVERLAP = 200

_BLANK_LINES_RE = re.compile(r"\n{3,}")
_HORIZONTAL_WHITESPACE_RE = re.compile(r"[ \t]+")


@dataclass
class ChunkDraft:
    content: str
    page_number: int | None
    chunk_index: int


def clean_text(text: str) -> str:
    """Whitespace-only normalization; preserves all actual content."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _HORIZONTAL_WHITESPACE_RE.sub(" ", text)
    text = _BLANK_LINES_RE.sub("\n\n", text)
    lines = [line.rstrip() for line in text.split("\n")]
    return "\n".join(lines).strip()


def _split_into_paragraphs(text: str) -> list[str]:
    return [p.strip() for p in text.split("\n\n") if p.strip()]


def _split_long_text(text: str, size: int) -> list[str]:
    """Word-boundary-safe split for a single paragraph longer than `size`."""
    words = text.split(" ")
    pieces: list[str] = []
    current = ""

    for word in words:
        candidate = f"{current} {word}" if current else word
        if len(candidate) <= size:
            current = candidate
            continue

        if current:
            pieces.append(current)
        if len(word) <= size:
            current = word
        else:
            # A single word longer than the whole chunk size (rare) — hard cut it.
            for i in range(0, len(word), size):
                pieces.append(word[i : i + size])
            current = ""

    if current:
        pieces.append(current)
    return pieces


def _pack_paragraphs(paragraphs: list[str]) -> list[str]:
    """Greedily pack paragraphs into ~CHUNK_SIZE blocks without splitting words."""
    blocks: list[str] = []
    current = ""

    def flush() -> None:
        nonlocal current
        if current:
            blocks.append(current)
            current = ""

    for para in paragraphs:
        candidate = f"{current}\n\n{para}" if current else para
        if len(candidate) <= CHUNK_SIZE:
            current = candidate
            continue

        flush()
        if len(para) <= CHUNK_SIZE:
            current = para
        else:
            blocks.extend(_split_long_text(para, CHUNK_SIZE))

    flush()
    return blocks


def _tail_for_overlap(text: str, max_chars: int) -> str:
    """Last ~max_chars of `text`, trimmed forward to a word boundary."""
    if len(text) <= max_chars:
        return text
    tail = text[-max_chars:]
    space_index = tail.find(" ")
    return tail[space_index + 1 :] if space_index != -1 else tail


def _apply_overlap(blocks: list[str]) -> list[str]:
    if len(blocks) <= 1:
        return blocks

    result = [blocks[0]]
    for i in range(1, len(blocks)):
        overlap = _tail_for_overlap(blocks[i - 1], CHUNK_OVERLAP)
        result.append(f"{overlap} {blocks[i]}".strip() if overlap else blocks[i])
    return result


def chunk_pages(pages: list[ExtractedPage]) -> list[ChunkDraft]:
    """
    Clean + chunk every page and return chunk drafts with a chunk_index
    that's sequential across the whole document (not reset per page).
    """
    drafts: list[ChunkDraft] = []
    index = 0

    for page in pages:
        cleaned = clean_text(page.text)
        paragraphs = _split_into_paragraphs(cleaned)
        if not paragraphs:
            continue

        blocks = _apply_overlap(_pack_paragraphs(paragraphs))
        for block in blocks:
            block = block.strip()
            if not block:
                continue
            drafts.append(ChunkDraft(content=block, page_number=page.page_number, chunk_index=index))
            index += 1

    return drafts
