# Setup local Chroma + Embedding service

Prereqs: Python 3.10+, git

1. Create venv and install

```bash
python -m venv .venv
source .venv/bin/activate   # or .venv\\Scripts\\activate on Windows
pip install -r python/requirements.txt
```

2. Run the server

```bash
uvicorn python.app:app --host 127.0.0.1 --port 8000
```

Endpoints:
- POST /upsert {collection, ids, documents, metadatas} — upsert documents (embeddings auto-generated)
- POST /query {collection, query, top_k} — returns nearest ids

