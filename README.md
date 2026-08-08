# DocIntel — Intelligent Document Query & Summarization System

DocIntel is a locally hosted, completely free document intelligence system
being built for NHSRCL. Once complete, it will let users upload files and
folders, browse the resulting document hierarchy, and ask plain-English
questions that are answered from the uploaded documents with citations, plus
generate file- and folder-level summaries — all without any paid API.

## Scope so far

**Phase 1 — Foundation:** FastAPI + PostgreSQL/pgvector + Next.js wired
together, with `GET /api/health` reporting API/database/pgvector/Ollama
status.

**Phase 2 — File & folder management (current):** upload single files,
multiple files, or entire folders (including nested folders); the backend
reconstructs the logical folder hierarchy, stores files on the local
filesystem, and records metadata in PostgreSQL; the frontend has a real
document explorer (expand/collapse tree, select a file or folder, see its
details, delete it).

**Not yet implemented** (later phases): reading file contents (PDF/DOCX/TXT
text extraction), chunking, embeddings, vector search, RAG, AI-generated
question answering, or summarization. The "Generate Summary" button visible
in the UI is a disabled placeholder only.

## Tech stack

| Layer      | Technology                              |
|------------|------------------------------------------|
| Frontend   | Next.js, TypeScript, Tailwind CSS         |
| Backend    | Python, FastAPI, SQLAlchemy, Alembic      |
| Database   | PostgreSQL + pgvector                     |
| Storage    | Local filesystem (`storage/documents/`)   |
| AI runtime | Ollama (local LLM), Sentence Transformers (added in a later phase) |
| Infra      | Docker Compose (PostgreSQL only)          |

## Project structure

```
docintel/
├── backend/
│   ├── alembic/            # Schema migrations
│   │   └── versions/
│   ├── app/
│   │   ├── api/              # FastAPI routers: health, documents, folders
│   │   ├── services/         # ollama_service, storage_service, document_service
│   │   ├── models/           # SQLAlchemy models: Folder, Document
│   │   ├── config.py         # Environment-based settings
│   │   ├── db.py             # SQLAlchemy engine/session + declarative Base
│   │   ├── schemas.py        # Pydantic request/response models
│   │   └── main.py           # App entry point
│   ├── alembic.ini
│   ├── requirements.txt
│   └── .env                   # local only, not committed
├── frontend/
│   ├── app/                   # Next.js App Router pages
│   ├── components/
│   │   ├── document/            # DocumentExplorer, FolderTree, DocumentDetail, UploadControls
│   │   ├── Header.tsx, HealthStatus.tsx, WelcomePanel.tsx
│   ├── lib/                    # api.ts (backend calls), format.ts, tree.ts
│   └── package.json
├── storage/                  # Uploaded files (local-only, gitignored)
│   └── documents/
├── docker-compose.yml        # PostgreSQL + pgvector
├── .env.example
└── README.md
```

## Prerequisites

- Docker Desktop
- Python 3.11+
- Node.js 20+
- [Ollama](https://ollama.com) installed locally (optional — the app runs
  fine without it, just reports `ollama: unavailable`)

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
cp ../.env.example .env       # or create backend/.env — see below
alembic upgrade head           # creates the folders/documents tables
uvicorn app.main:app --reload --port 8000
```

The backend reads configuration from `backend/.env` (see
[.env.example](.env.example) at the repo root for the variable names:
`DATABASE_URL`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `CORS_ORIGINS`,
`STORAGE_ROOT`, `MAX_UPLOAD_SIZE_MB`). Uploaded files are stored under
`<repo_root>/storage/documents/` by default. On startup the backend also
ensures that directory exists.

### Schema migrations

Schema changes are managed with Alembic (`backend/alembic/`). To apply the
latest schema: `alembic upgrade head`. When models change in a future
phase: `alembic revision --autogenerate -m "..."` then `alembic upgrade head`.

## 3. Start the Next.js frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend reads `NEXT_PUBLIC_API_URL` from `frontend/.env.local`
(defaults to `http://localhost:8000`). Visit `http://localhost:3000`.

## 4. Configure Ollama (optional so far)

Install [Ollama](https://ollama.com), then pull a model, e.g.:

```bash
ollama pull llama3.2
```

Ollama runs locally as its own process (not containerized) and is expected
at `OLLAMA_BASE_URL` (default `http://localhost:11434`). If it isn't
running, the health endpoint simply reports `ollama: unavailable` — the
rest of the app keeps working. Ollama isn't used for anything yet besides
this health check — question answering arrives in a later phase.

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
API, database, and pgvector checks are independent of it. The frontend
dashboard shows the same information under **System Status**, visible
whenever nothing is selected in the document tree.

## Documents & folders (Phase 2)

### Supported file types

`.pdf`, `.docx`, `.txt` only — anything else is rejected per-file with a
clear error (the file's contents are never read in this phase, only stored).

### API

| Method | Path                     | Purpose |
|--------|--------------------------|---------|
| GET    | `/api/health`            | API/database/pgvector/Ollama status |
| POST   | `/api/documents/upload`  | Upload one or more files (single, multiple, or a whole folder) |
| GET    | `/api/documents/tree`    | Full folder/document hierarchy in one response |
| DELETE | `/api/documents/{id}`    | Delete one document (DB row + physical file) |
| DELETE | `/api/folders/{id}`      | Delete a folder and everything inside it, recursively |

`POST /api/documents/upload` expects multipart form data with two parallel
fields: `files` (the file blobs) and `paths` (one string per file, in the
same order) giving that file's logical path relative to the upload root —
e.g. `January.pdf` for a flat upload, or `NHSRCL/Reports/2026/January.pdf`
for a folder upload. Missing intermediate folders are created
automatically. The response reports each file's outcome individually
(`created` / `replaced` / `error`) — one bad file never fails the whole
batch.

### Duplicate uploads

Uploading the same logical path again (same folder + filename) **replaces**
the existing document: its physical file is swapped and its metadata
updated in place, keeping the same document ID. This was chosen over
silently creating a second record or hard-rejecting, since re-uploading a
corrected file is the expected common case for this app.

### Storage layout

Physical files live under `storage/documents/` using a server-generated
UUID filename (e.g. `3f9a1c2e....pdf`) — never the user-supplied name or
path. The logical folder hierarchy the user actually sees lives entirely in
PostgreSQL (`folders.path`, `documents.name`/`folder_id`). This sidesteps
path-traversal risk entirely for storage I/O and avoids on-disk filename
collisions between same-named files in different folders.

## Notes

- No paid API is used anywhere in this project.
- Text extraction, embeddings, vector search, RAG, question answering, and
  summarization are intentionally out of scope so far — see "Scope so far"
  above.
