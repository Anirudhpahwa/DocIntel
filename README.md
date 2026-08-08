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

**Phase 2 — File & folder management:** upload single files, multiple
files, or entire folders (including nested folders); the backend
reconstructs the logical folder hierarchy, stores files on the local
filesystem, and records metadata in PostgreSQL; the frontend has a real
document explorer (expand/collapse tree, select a file or folder, see its
details, delete it).

**Phase 3 — Document processing, chunking & local embeddings (current):**
every uploaded PDF/DOCX/TXT is automatically extracted, cleaned, split into
overlapping chunks, embedded locally with Sentence Transformers, and stored
in PostgreSQL via pgvector — no external AI API involved. The document tree
shows each file's processing status (indexed / processing / failed).

**Not yet implemented** (later phases): semantic search / retrieval over
the stored embeddings, RAG question answering, Ollama-generated answers,
citations in answers, or summarization. The "Generate Summary" button
visible in the UI is still a disabled placeholder.

## Tech stack

| Layer      | Technology                              |
|------------|------------------------------------------|
| Frontend   | Next.js, TypeScript, Tailwind CSS         |
| Backend    | Python, FastAPI, SQLAlchemy, Alembic      |
| Database   | PostgreSQL + pgvector                     |
| Storage    | Local filesystem (`storage/documents/`)   |
| Document processing | PyMuPDF (PDF), python-docx (DOCX)|
| Embeddings | Sentence Transformers, `all-MiniLM-L6-v2`, local, 384-dim |
| AI runtime | Ollama (local LLM) — health-checked only so far, used for Q&A in a later phase |
| Infra      | Docker Compose (PostgreSQL only)          |

## Project structure

```
docintel/
├── backend/
│   ├── alembic/                # Schema migrations
│   │   └── versions/
│   ├── app/
│   │   ├── api/                  # FastAPI routers: health, documents, folders
│   │   ├── services/
│   │   │   ├── storage_service.py           # physical file I/O (Phase 2)
│   │   │   ├── document_service.py          # folders/documents CRUD, tree (Phase 2)
│   │   │   ├── extraction_service.py        # PDF/DOCX/TXT -> text (Phase 3)
│   │   │   ├── chunking_service.py          # clean + chunk text (Phase 3)
│   │   │   ├── embedding_service.py         # Sentence Transformers (Phase 3)
│   │   │   ├── document_processing_service.py  # orchestrates the above (Phase 3)
│   │   │   └── ollama_service.py            # health check only
│   │   ├── models/               # SQLAlchemy: Folder, Document, DocumentChunk
│   │   ├── config.py             # Environment-based settings
│   │   ├── db.py                 # SQLAlchemy engine/session + declarative Base
│   │   ├── schemas.py            # Pydantic request/response models
│   │   └── main.py               # App entry point
│   ├── alembic.ini
│   ├── requirements.txt
│   └── .env                       # local only, not committed
├── frontend/
│   ├── app/                       # Next.js App Router pages
│   ├── components/
│   │   ├── document/                # DocumentExplorer, FolderTree, DocumentDetail, UploadControls
│   │   ├── Header.tsx, HealthStatus.tsx, WelcomePanel.tsx
│   ├── lib/                        # api.ts, format.ts, tree.ts, processingStatus.ts
│   └── package.json
├── storage/                      # Uploaded files (local-only, gitignored)
│   └── documents/
├── test-data/
│   └── NHSRCL-Demo/               # Synthetic fictional test dataset (see below)
├── docker-compose.yml             # PostgreSQL + pgvector
├── .env.example
└── README.md
```

## Prerequisites

- Docker Desktop
- Python 3.11+
- Node.js 20+
- [Ollama](https://ollama.com) installed locally (optional — the app runs
  fine without it, just reports `ollama: unavailable`)
- ~500MB free disk for the one-time Sentence Transformers model download
  (see "Local embeddings" below)

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
alembic upgrade head           # creates/updates all tables
uvicorn app.main:app --reload --port 8002
```

The backend reads configuration from `backend/.env` (see
[.env.example](.env.example) at the repo root for the variable names:
`DATABASE_URL`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `CORS_ORIGINS`,
`STORAGE_ROOT`, `MAX_UPLOAD_SIZE_MB`). Uploaded files are stored under
`<repo_root>/storage/documents/` by default. On startup the backend also
ensures that directory exists.

> **Port 8002, not 8000:** this project's default dev port is 8002 (not
> FastAPI's usual 8000) because 8000 is unreliably squatted by other local
> projects' Docker networking on the reference dev machine — the exact
> same reason Postgres runs on 5433 instead of 5432 (see above). Adjust
> freely if 8002 is also taken on your machine; just keep
> `NEXT_PUBLIC_API_URL` (frontend) in sync.

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
(defaults to `http://localhost:8002`). Visit `http://localhost:3000`.

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
curl http://localhost:8002/api/health
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
clear error.

### API

| Method | Path                     | Purpose |
|--------|--------------------------|---------|
| GET    | `/api/health`            | API/database/pgvector/Ollama status |
| POST   | `/api/documents/upload`  | Upload one or more files (single, multiple, or a whole folder); processes each synchronously (see below) |
| GET    | `/api/documents/tree`    | Full folder/document hierarchy, including each document's processing status |
| DELETE | `/api/documents/{id}`    | Delete one document (DB row + physical file + its chunks) |
| DELETE | `/api/folders/{id}`      | Delete a folder and everything inside it, recursively (subfolders, documents, chunks) |

`POST /api/documents/upload` expects multipart form data with two parallel
fields: `files` (the file blobs) and `paths` (one string per file, in the
same order) giving that file's logical path relative to the upload root —
e.g. `January.pdf` for a flat upload, or `NHSRCL/Reports/2026/January.pdf`
for a folder upload. Missing intermediate folders are created
automatically. The response reports each file's outcome individually
(`created` / `replaced` / `error`, plus `processing_status` /
`processing_error`) — one bad file never fails the whole batch.

### Duplicate uploads

Uploading the same logical path again (same folder + filename) **replaces**
the existing document: its physical file is swapped, its metadata updated
in place, and it is fully reprocessed (old chunks/embeddings deleted, new
ones generated) — keeping the same document ID throughout.

### Storage layout

Physical files live under `storage/documents/` using a server-generated
UUID filename (e.g. `3f9a1c2e....pdf`) — never the user-supplied name or
path. The logical folder hierarchy the user actually sees lives entirely in
PostgreSQL (`folders.path`, `documents.name`/`folder_id`). This sidesteps
path-traversal risk entirely for storage I/O and avoids on-disk filename
collisions between same-named files in different folders.

## Document processing & local embeddings (Phase 3)

Every successfully uploaded file is processed **synchronously**, as part of
the same upload request (no background job queue — this is a small local
demo, so simplicity wins):

```
Stored file -> extract text -> clean -> chunk (~1200 chars, ~200 overlap)
            -> embed locally (Sentence Transformers) -> store in pgvector
            -> document marked "indexed" (or "failed" with a reason)
```

- **Extraction** (`extraction_service.py`): PDF via PyMuPDF, page-by-page
  (empty pages skipped, page numbers preserved). DOCX via python-docx —
  python-docx has no reliable page boundaries, so DOCX/TXT chunks always
  have `page_number: null` rather than a fabricated number.
- **Cleaning** (`chunking_service.clean_text`): whitespace normalization
  only — numbers, dates, names, and punctuation are never touched, since
  later phases need those intact (e.g. "how many trains ran ... from 6 Aug
  to 30 Aug?").
- **Chunking** (`chunking_service.chunk_pages`): packs paragraphs into
  ~1200-character blocks without splitting words, then carries ~200
  characters of trailing context from each block into the next
  (overlap). `chunk_index` is sequential per document; `page_number`
  (PDFs only) is preserved per chunk.
- **Embeddings** (`embedding_service.py`): [`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2),
  384 dimensions, loaded once per process and reused for every chunk.
  **Runs entirely on-device — no API key, no external embedding service.**
  The model downloads once (~90MB) from Hugging Face on first use and is
  cached under `~/.cache/huggingface/`; every embedding call after that
  runs locally against the cached weights.

### `document_chunks` table

```
id | document_id (FK, ON DELETE CASCADE) | page_number (nullable)
   | chunk_index | content | embedding VECTOR(384) | created_at
```

No HNSW/vector index was added — at this project's scale (a handful of
demo documents, low hundreds of chunks), pgvector's exact brute-force scan
is already fast, and adding an index "just in case" would be premature
optimization for a two-day local demo. This can be revisited if Phase 4's
real usage shows it's actually needed.

### Processing status

Each document has `processing_status` (`pending` / `processing` /
`indexed` / `failed`) and an optional `processing_error`, both visible in
`GET /api/documents/tree` and shown in the frontend (a small icon next to
each file in the tree, and a full status line in the detail panel). A
processing failure (e.g. a corrupt PDF) never crashes the API or blocks the
upload — the file is still stored, just marked `failed` with a diagnostic
message.

### Synthetic test dataset

`test-data/NHSRCL-Demo/` contains a small set of **entirely fictional**
NHSRCL-style documents (daily operations PDFs with train counts per route,
a DOCX safety report, a TXT project overview) used to exercise and verify
the processing pipeline end-to-end. None of it is real NHSRCL data.

## Notes

- No paid API is used anywhere in this project. Embeddings run 100% locally
  after the one-time model download described above.
- Semantic retrieval, RAG question answering, citations, and summarization
  are intentionally out of scope so far — see "Scope so far" above.
