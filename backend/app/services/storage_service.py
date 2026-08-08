"""
Local filesystem storage for uploaded documents.

Physical files are never written or read using a user-supplied name or
path — every file on disk gets a server-generated UUID filename inside
settings.storage_root/documents/. That alone rules out path traversal for
storage I/O; resolve_storage_path() adds a defense-in-depth check on top.

The logical folder hierarchy the user actually cares about lives entirely
in the database (Folder.path, Document.name) — see document_service.py.
"""

import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import settings

STORAGE_ROOT = Path(settings.storage_root).resolve()
DOCUMENTS_DIRNAME = "documents"


class UploadTooLargeError(Exception):
    """Raised when an upload exceeds settings.max_upload_size_mb."""


def documents_dir() -> Path:
    path = STORAGE_ROOT / DOCUMENTS_DIRNAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def ensure_storage_dirs() -> None:
    """Create the storage directory tree if it doesn't exist yet."""
    documents_dir()


def resolve_storage_path(relative_path: str) -> Path:
    """
    Resolve a path stored in Document.file_path to an absolute path,
    guaranteeing the result stays inside STORAGE_ROOT.

    Defense-in-depth: relative_path always comes from generate_physical_path()
    below, never from user input, so this should never actually reject
    anything in practice.
    """
    candidate = (STORAGE_ROOT / relative_path).resolve()
    if candidate != STORAGE_ROOT and STORAGE_ROOT not in candidate.parents:
        raise ValueError(f"Resolved path escapes storage root: {relative_path!r}")
    return candidate


def generate_physical_path(extension: str) -> tuple[str, Path]:
    """
    Generate a fresh, collision-proof physical filename for a new upload.

    Returns (relative_path, absolute_path) where relative_path is what gets
    stored in Document.file_path (relative to STORAGE_ROOT).
    """
    filename = f"{uuid.uuid4().hex}{extension}"
    relative_path = f"{DOCUMENTS_DIRNAME}/{filename}"
    return relative_path, documents_dir() / filename


def save_upload_file(upload_file: UploadFile, destination: Path) -> int:
    """
    Stream an UploadFile to disk, enforcing settings.max_upload_size_bytes.
    Returns the number of bytes written. Deletes the partial file and
    raises UploadTooLargeError if the limit is exceeded.
    """
    max_bytes = settings.max_upload_size_bytes
    written = 0
    try:
        with destination.open("wb") as out:
            while chunk := upload_file.file.read(1024 * 1024):
                written += len(chunk)
                if written > max_bytes:
                    raise UploadTooLargeError(
                        f"File exceeds the {settings.max_upload_size_mb}MB upload limit"
                    )
                out.write(chunk)
    except UploadTooLargeError:
        destination.unlink(missing_ok=True)
        raise
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return written


def delete_physical_file(relative_path: str) -> None:
    """Best-effort delete of a physical file; ignores a missing file."""
    try:
        path = resolve_storage_path(relative_path)
    except ValueError:
        return
    path.unlink(missing_ok=True)
