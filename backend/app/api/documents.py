"""
Document endpoints: upload (single/multiple/folder), the full tree, and
single-document deletion. Folder deletion lives in app/api/folders.py.
"""

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.document import Document
from app.schemas import DocumentTreeResponse, UploadFileResult, UploadResponse
from app.services import document_service, storage_service
from app.services.document_service import InvalidUploadPathError
from app.services.storage_service import UploadTooLargeError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/upload", response_model=UploadResponse)
async def upload_documents(
    files: list[UploadFile] = File(...),
    paths: list[str] = Form(...),
    db: Session = Depends(get_db),
) -> UploadResponse:
    """
    Upload one or more files. `paths` must contain exactly one entry per
    file, in the same order, giving that file's logical path relative to
    the upload root (e.g. "January.pdf" for a flat upload, or
    "NHSRCL/Reports/2026/January.pdf" for a folder upload). Missing
    intermediate folders are created automatically.

    Duplicate policy: uploading the same logical path again *replaces* the
    existing document (metadata + physical file) rather than creating a
    second record — see README for details.

    Never fails the whole batch for one bad file: each file succeeds or
    fails independently and is reported in `results`.
    """
    if len(files) != len(paths):
        raise HTTPException(
            status_code=400,
            detail=f"Got {len(files)} file(s) but {len(paths)} path(s) — they must match 1:1",
        )

    results: list[UploadFileResult] = []
    created = replaced = failed = 0

    for upload_file, raw_path in zip(files, paths):
        original_filename = upload_file.filename or raw_path

        try:
            parsed = document_service.parse_upload_path(raw_path)
            folder = document_service.get_or_create_folder_path(db, parsed.folder_segments)
            physical_relative_path, physical_abs_path = storage_service.generate_physical_path(
                parsed.extension
            )
            storage_service.save_upload_file(upload_file, physical_abs_path)
            file_size = physical_abs_path.stat().st_size

            document, was_replaced = document_service.upsert_document(
                db,
                folder=folder,
                filename=parsed.filename,
                original_filename=original_filename,
                file_type=parsed.extension.lstrip("."),
                physical_relative_path=physical_relative_path,
                file_size=file_size,
            )
            db.commit()

            if was_replaced:
                replaced += 1
                status = "replaced"
            else:
                created += 1
                status = "created"

            results.append(
                UploadFileResult(
                    filename=original_filename,
                    relative_path=raw_path,
                    status=status,
                    document_id=document.id,
                )
            )

        except (InvalidUploadPathError, UploadTooLargeError) as exc:
            db.rollback()
            failed += 1
            results.append(
                UploadFileResult(
                    filename=original_filename,
                    relative_path=raw_path,
                    status="error",
                    error=str(exc),
                )
            )
        except Exception:
            db.rollback()
            failed += 1
            logger.exception("Unexpected error uploading %r", raw_path)
            results.append(
                UploadFileResult(
                    filename=original_filename,
                    relative_path=raw_path,
                    status="error",
                    error="Unexpected server error while saving this file",
                )
            )
        finally:
            await upload_file.close()

    return UploadResponse(results=results, created=created, replaced=replaced, failed=failed)


@router.get("/tree", response_model=DocumentTreeResponse)
def get_document_tree(db: Session = Depends(get_db)) -> dict:
    return document_service.build_tree(db)


@router.delete("/{document_id}", status_code=204)
def delete_document(document_id: int, db: Session = Depends(get_db)) -> None:
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    storage_service.delete_physical_file(document.file_path)
    db.delete(document)
    db.commit()
