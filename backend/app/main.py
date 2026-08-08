"""
DocIntel backend entry point.

Phase 1: application bootstrap, CORS, and the /api/health endpoint.
Phase 2: document/folder upload, storage, and browsing.
Phase 3: text extraction, chunking, and local embeddings.
Phase 4: RAG question answering over the indexed chunks.
Phase 5: document/folder summarization over the same indexed chunks.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import documents, folders, health, query, summarize
from app.config import settings
from app.services.storage_service import ensure_storage_dirs


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_storage_dirs()
    yield


app = FastAPI(title="DocIntel API", version="0.5.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(documents.router)
app.include_router(folders.router)
app.include_router(query.router)
app.include_router(summarize.router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "DocIntel API", "status": "running"}
