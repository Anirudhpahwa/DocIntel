"""
Turns a stored file into plain text, one page at a time where the format
has real pages. All three supported formats funnel through
extract_document() and produce the same shape: a list of ExtractedPage.

PDF uses PyMuPDF (imported as `pymupdf` — the modern name; `fitz` is now
just a deprecated compatibility alias for the same library/API). DOCX uses
python-docx. Neither DOCX nor TXT have reliable page boundaries, so their
page_number is always None — Phase 4 will cite those by filename instead.
"""

from dataclasses import dataclass
from pathlib import Path

import pymupdf
from docx import Document as DocxDocument


@dataclass
class ExtractedPage:
    text: str
    page_number: int | None  # 1-based for PDFs; None for DOCX/TXT


class ExtractionError(Exception):
    """Raised when a supported file's text can't be extracted."""


def extract_pdf(path: Path) -> list[ExtractedPage]:
    pages: list[ExtractedPage] = []
    try:
        with pymupdf.open(path) as pdf:
            for index, page in enumerate(pdf, start=1):
                text = page.get_text("text")
                if text.strip():  # ignore completely empty pages
                    pages.append(ExtractedPage(text=text, page_number=index))
    except Exception as exc:
        raise ExtractionError(f"Could not read PDF: {exc}") from exc
    return pages


def extract_docx(path: Path) -> list[ExtractedPage]:
    try:
        doc = DocxDocument(str(path))
        paragraphs = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
    except Exception as exc:
        raise ExtractionError(f"Could not read DOCX: {exc}") from exc

    text = "\n\n".join(paragraphs)
    if not text.strip():
        return []
    # DOCX has no reliable page boundaries via python-docx — one "page" with
    # page_number=None, rather than fabricating page numbers.
    return [ExtractedPage(text=text, page_number=None)]


def extract_txt(path: Path) -> list[ExtractedPage]:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise ExtractionError(f"Could not read file: {exc}") from exc

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        # Best-effort fallback for a mis-encoded upload rather than failing
        # the whole document outright.
        text = raw.decode("utf-8", errors="replace")

    if not text.strip():
        return []
    return [ExtractedPage(text=text, page_number=None)]


_EXTRACTORS = {
    "pdf": extract_pdf,
    "docx": extract_docx,
    "txt": extract_txt,
}


def extract_document(path: Path, file_type: str) -> list[ExtractedPage]:
    extractor = _EXTRACTORS.get(file_type)
    if extractor is None:
        raise ExtractionError(f"No extractor available for file type {file_type!r}")
    return extractor(path)
