# DocIntel — Intelligent Document Query & Summarization System

DocIntel is a locally hosted, completely free document intelligence system
being built for NHSRCL. Once complete, it will let users upload files and
folders, browse the resulting document hierarchy, and ask plain-English
questions that are answered from the uploaded documents with citations, plus
generate file- and folder-level summaries — all without any paid API.

## Phase 1 scope

This phase establishes the project foundation only. It does **not** yet
implement document upload, parsing, chunking, embeddings, vector search,
RAG, question answering, or summarization — those arrive in later phases.

What Phase 1 delivers:

- A FastAPI backend that starts, connects to PostgreSQL, verifies pgvector
  is enabled, and checks whether Ollama is reachable — exposed via
  `GET /api/health`.
- A PostgreSQL + pgvector database running in Docker Compose with a
  persistent volume and health check.
- A Next.js + TypeScript + Tailwind frontend shell (header, placeholder
  document sidebar, main content area) that calls the health endpoint and
  displays live backend/database/AI-runtime status.

## Tech stack

| Layer      | Technology                              |
|------------|------------------------------------------|
| Frontend   | Next.js, TypeScript, Tailwind CSS         |
| Backend    | Python, FastAPI                           |
| Database   | PostgreSQL + pgvector                     |
| AI runtime | Ollama (local LLM), Sentence Transformers (added in a later phase) |
| Infra      | Docker Compose (PostgreSQL only)          |

## Project structure

```
docintel/
├── backend/
│   ├── app/
│   │   ├── api/         # FastAPI routers (health.py)
│   │   ├── services/     # External integrations (ollama_service.py)
│   │   ├── models/       # ORM models (empty until Phase 2)
│   │   ├── config.py     # Environment-based settings
│   │   ├── db.py         # SQLAlchemy engine/session + pgvector check
│   │   └── main.py       # App entry point
│   ├── requirements.txt
│   └── .env               # local only, not committed
├── frontend/
│   ├── app/               # Next.js App Router pages
│   ├── components/        # Header, Sidebar, HealthStatus
│   ├── lib/                # api.ts — fetch wrapper for the backend
│   └── package.json
├── docker-compose.yml     # PostgreSQL + pgvector
├── .env.example
└── README.md
```

## Prerequisites

- Docker Desktop
- Python 3.11+
- Node.js 20+
- [Ollama](https://ollama.com) installed locally (optional for Phase 1 —
  the app runs fine without it, just reports `ollama: unavailable`)

## 1. Start PostgreSQL (with pgvector)

From the repository root:

```bash
cp .env.example .env   # first time only
docker compose up -d
```

This starts a `pgvector/pgvector:pg16` container, publishes it on
`localhost:5433` (configurable via `POSTGRES_PORT` in `.env`, default
chosen to avoid clashing with a default local Postgres on 5432), and
persists data in a named Docker volume.

## 2. Start the FastAPI backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp .env.example ../.env       # or create backend/.env — see below
uvicorn app.main:app --reload --port 8000
```

The backend reads configuration from `backend/.env` (see
[.env.example](.env.example) at the repo root for the variable names:
`DATABASE_URL`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `CORS_ORIGINS`).

## 3. Start the Next.js frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend reads `NEXT_PUBLIC_API_URL` from `frontend/.env.local`
(defaults to `http://localhost:8000`). Visit `http://localhost:3000`.

## 4. Configure Ollama (optional in Phase 1)

Install [Ollama](https://ollama.com), then pull a model, e.g.:

```bash
ollama pull llama3.2
```

Ollama runs locally as its own process (not containerized) and is expected
at `OLLAMA_BASE_URL` (default `http://localhost:11434`). If it isn't
running, the health endpoint simply reports `ollama: unavailable` — the
rest of the app keeps working.

## 5. Verify the health endpoint

```bash
curl http://localhost:8000/api/health
```

Expected response once everything is running:

```json
{
  "api": "ok",
  "database": "ok",
  "pgvector": "ok",
  "ollama": "ok"
}
```

If Ollama isn't running, `ollama` will read `"unavailable"` instead — the
API, database, and pgvector checks are independent of it.

The frontend dashboard (`http://localhost:3000`) shows the same
information under **System Status**.

## Notes

- No paid API is used anywhere in this project.
- Document/folder/chunk database schema, file upload, parsing, embeddings,
  and question answering are intentionally out of scope for Phase 1.
