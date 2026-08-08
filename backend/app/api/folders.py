"""
Folder endpoints. Only deletion lives here — folders are otherwise created
implicitly by document uploads (see document_service.get_or_create_folder_path)
and read as part of GET /api/documents/tree.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.folder import Folder
from app.services import document_service, storage_service

router = APIRouter(prefix="/api/folders", tags=["folders"])


@router.delete("/{folder_id}", status_code=204)
def delete_folder(folder_id: int, db: Session = Depends(get_db)) -> None:
    """
    Delete a folder and everything inside it, recursively. Physical files
    for every document in the subtree are removed from disk; the folder,
    document, and subfolder rows are removed via ON DELETE CASCADE once we
    delete this one folder row.
    """
    folder = db.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")

    documents = document_service.collect_documents_under_folder(db, folder_id)
    for document in documents:
        storage_service.delete_physical_file(document.file_path)

    db.delete(folder)
    db.commit()
