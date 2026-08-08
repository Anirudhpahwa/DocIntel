"""
POST /api/query — the core RAG endpoint. Turns a plain-English question
(optionally scoped to a document or folder) into a grounded answer plus
cited sources, using local embeddings + pgvector retrieval + Ollama.

Router stays thin: all real work happens in rag_service.py.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import QueryRequest, QueryResponse, SourceOut
from app.services import rag_service
from app.services.ollama_service import OllamaUnavailableError
from app.services.retrieval_service import ScopeNotFoundError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["query"])


@router.post("/query", response_model=QueryResponse)
async def query_documents(request: QueryRequest, db: Session = Depends(get_db)) -> QueryResponse:
    try:
        result = await rag_service.answer_question(
            db,
            question=request.question,
            scope_type=request.scope.type,
            scope_id=request.scope.id,
        )
    except ScopeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OllamaUnavailableError:
        # Distinguish "AI runtime down" from a DB/retrieval failure (500
        # below) and never leak the raw connection error to the frontend.
        logger.exception("Ollama unavailable while answering a query")
        raise HTTPException(
            status_code=503, detail="AI model is currently unavailable."
        ) from None
    except Exception:
        logger.exception("Unexpected error answering query")
        raise HTTPException(
            status_code=500, detail="Something went wrong answering your question."
        ) from None

    return QueryResponse(
        answer=result.answer,
        sources=[
            SourceOut(
                document_id=s.document_id, document_name=s.document_name, page_number=s.page_number
            )
            for s in result.sources
        ],
        chunks_retrieved=result.chunks_retrieved,
    )
