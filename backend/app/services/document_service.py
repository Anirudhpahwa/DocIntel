"""
Business logic for folders and documents: turning a browser-supplied
relative path into a safe (folder hierarchy, filename) pair, finding or
creating the folder chain, upserting the Document row, and assembling the
full tree for the frontend in a small, fixed number of queries.
"""

from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.document import Document, ProcessingStatus
from app.models.folder import Folder
from app.services import storage_service

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}
MAX_PATH_SEGMENTS = 100  # sanity cap against pathological input, not a "depth limit"
MAX_SEGMENT_LENGTH = 255


class InvalidUploadPathError(ValueError):
    """Raised when a relative upload path is unsafe or malformed."""


@dataclass
class ParsedUploadPath:
    folder_segments: list[str]
    filename: str
    extension: str  # lowercase, with leading dot, e.g. ".pdf"


def parse_upload_path(raw_path: str) -> ParsedUploadPath:
    """
    Validate and split a browser-supplied relative path (e.g.
    "NHSRCL/Reports/2026/January.pdf") into folder segments + filename.

    Rejects anything that looks like it's trying to escape the logical
    upload root: empty segments, ".", "..", absolute paths, drive letters,
    NUL bytes. This governs the *logical* folder hierarchy stored in the
    database — it never touches the filesystem directly (see
    storage_service, which uses server-generated filenames for that).
    """
    if not raw_path or not raw_path.strip():
        raise InvalidUploadPathError("Path must not be empty")

    normalized = raw_path.replace("\\", "/")
    if "\x00" in normalized:
        raise InvalidUploadPathError("Path contains invalid characters")
    if normalized.startswith("/") or ":" in normalized:
        raise InvalidUploadPathError("Absolute paths are not allowed")

    raw_segments = [seg.strip() for seg in normalized.split("/")]
    segments = [seg for seg in raw_segments if seg != ""]

    if not segments:
        raise InvalidUploadPathError("Path must not be empty")
    if len(segments) > MAX_PATH_SEGMENTS:
        raise InvalidUploadPathError("Path is nested too deeply")

    for seg in segments:
        if seg in (".", ".."):
            raise InvalidUploadPathError("Path must not contain '.' or '..'")
        if len(seg) > MAX_SEGMENT_LENGTH:
            raise InvalidUploadPathError(f"Path segment too long: {seg[:50]!r}...")

    *folder_segments, filename = segments
    extension = ""
    if "." in filename:
        extension = "." + filename.rsplit(".", 1)[1].lower()

    if extension not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise InvalidUploadPathError(
            f"Unsupported file type {extension or '(none)'!r} - allowed: {allowed}"
        )

    return ParsedUploadPath(folder_segments=folder_segments, filename=filename, extension=extension)


def get_or_create_folder_path(db: Session, segments: list[str]) -> Folder | None:
    """
    Walk a list of folder names, creating any that don't already exist, and
    return the deepest Folder. Returns None if segments is empty (the
    upload targets the top level, no folder).
    """
    parent: Folder | None = None
    parent_id: int | None = None
    path_parts: list[str] = []

    for name in segments:
        path_parts.append(name)
        path = "/".join(path_parts)

        folder = db.query(Folder).filter(Folder.path == path).one_or_none()
        if folder is None:
            folder = Folder(name=name, parent_id=parent_id, path=path)
            db.add(folder)
            db.flush()  # assign folder.id for the next level / caller

        parent = folder
        parent_id = folder.id

    return parent


def upsert_document(
    db: Session,
    folder: Folder | None,
    filename: str,
    original_filename: str,
    file_type: str,
    physical_relative_path: str,
    file_size: int,
) -> tuple[Document, bool]:
    """
    Create a document, or replace it in place if one with the same name
    already exists in the same folder (this is DocIntel's duplicate-upload
    policy — see README). Returns (document, replaced).
    """
    folder_id = folder.id if folder else None
    existing = (
        db.query(Document)
        .filter(Document.folder_id == folder_id, Document.name == filename)
        .one_or_none()
    )

    if existing is not None:
        storage_service.delete_physical_file(existing.file_path)
        existing.original_filename = original_filename
        existing.file_path = physical_relative_path
        existing.file_type = file_type
        existing.file_size = file_size
        # Reset processing state — document_processing_service will reprocess
        # this document (deleting stale chunks) right after upload commits.
        existing.processing_status = ProcessingStatus.PENDING.value
        existing.processing_error = None
        db.flush()
        return existing, True

    document = Document(
        folder_id=folder_id,
        name=filename,
        original_filename=original_filename,
        file_path=physical_relative_path,
        file_type=file_type,
        file_size=file_size,
        processing_status=ProcessingStatus.PENDING.value,
    )
    db.add(document)
    db.flush()
    return document, False


def build_tree(db: Session) -> dict:
    """
    Fetch every folder and document in two queries and assemble the full
    nested hierarchy in memory — the frontend renders the whole tree from
    a single GET /api/documents/tree call.
    """
    folders = db.query(Folder).order_by(Folder.name).all()
    documents = db.query(Document).order_by(Document.name).all()

    children_by_parent: dict[int | None, list[Folder]] = defaultdict(list)
    for folder in folders:
        children_by_parent[folder.parent_id].append(folder)

    documents_by_folder: dict[int | None, list[Document]] = defaultdict(list)
    for document in documents:
        documents_by_folder[document.folder_id].append(document)

    def serialize_folder(folder: Folder) -> dict:
        return {
            "id": folder.id,
            "name": folder.name,
            "parent_id": folder.parent_id,
            "path": folder.path,
            "created_at": folder.created_at,
            "folders": [serialize_folder(c) for c in children_by_parent.get(folder.id, [])],
            "documents": [serialize_document(d) for d in documents_by_folder.get(folder.id, [])],
        }

    def serialize_document(document: Document) -> dict:
        return {
            "id": document.id,
            "folder_id": document.folder_id,
            "name": document.name,
            "original_filename": document.original_filename,
            "file_type": document.file_type,
            "file_size": document.file_size,
            "created_at": document.created_at,
            "updated_at": document.updated_at,
            "processing_status": document.processing_status,
            "processing_error": document.processing_error,
        }

    return {
        "folders": [serialize_folder(f) for f in children_by_parent.get(None, [])],
        "documents": [serialize_document(d) for d in documents_by_folder.get(None, [])],
    }


def collect_documents_under_folder(db: Session, folder_id: int) -> list[Document]:
    """
    Gather every document inside a folder and all of its nested
    subfolders (BFS over an in-memory parent/child map). Used to delete
    physical files before the DB cascade removes the rows.
    """
    all_folders = db.query(Folder).all()
    children_by_parent: dict[int | None, list[int]] = defaultdict(list)
    for folder in all_folders:
        children_by_parent[folder.parent_id].append(folder.id)

    folder_ids = {folder_id}
    queue = [folder_id]
    while queue:
        current = queue.pop()
        for child_id in children_by_parent.get(current, []):
            if child_id not in folder_ids:
                folder_ids.add(child_id)
                queue.append(child_id)

    return db.query(Document).filter(Document.folder_id.in_(folder_ids)).all()
