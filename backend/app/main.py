"""
DocIntel backend entry point.

Phase 1 scope: application bootstrap, CORS, and the /api/health endpoint
only. Document upload, parsing, embeddings, and RAG are implemented in
later phases.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health
from app.config import settings

app = FastAPI(title="DocIntel API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "DocIntel API", "status": "running"}
