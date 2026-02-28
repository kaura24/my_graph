"""
app.py — FastAPI 백엔드 (벡터 검색 + 문서/태그/폴더 REST API)
Chroma 임베딩 엔드포인트는 유지하면서, Electron IPC 핸들러를 REST로 통합.
"""
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from pathlib import Path
from datetime import datetime
import tempfile
import zipfile
import shutil
import os
import re
import subprocess
import webbrowser

import httpx

# ─── Chroma / Embedding (기존 유지) ───────────────
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

# ─── 서비스 모듈 ──────────────────────────────────
from doc_service import (
    list_docs, get_doc, save_doc, delete_doc,
    get_tags_for_doc, set_tags_for_doc, get_all_tags, extract_hashtags,
    list_folders, create_folder, rename_folder, delete_folder,
    set_doc_folder, save_image, get_image_path, save_file, get_file_path,
    list_trash, restore_from_trash, delete_from_trash_permanently,
)
import doc_service
import db_service

app = FastAPI(title="My Graph API")

# CORS — Vite dev 서버(5173) 및 pywebview 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Chroma 초기화 ────────────────────────────────
try:
    chroma_client = chromadb.Client(
        Settings(chroma_db_impl="duckdb+parquet", persist_directory="./chroma_db")
    )
    embed_model = SentenceTransformer("all-MiniLM-L6-v2")
    CHROMA_AVAILABLE = True
except Exception:
    CHROMA_AVAILABLE = False
    chroma_client = None
    embed_model = None


# ═══════════════════════════════════════════════════
# Chroma 엔드포인트 (기존 유지)
# ═══════════════════════════════════════════════════
class UpsertReq(BaseModel):
    collection: str
    ids: List[str]
    documents: Optional[List[str]] = None
    metadatas: Optional[List[dict]] = None


class QueryReq(BaseModel):
    collection: str
    query: Optional[str] = None
    top_k: int = 5


@app.post("/upsert")
def upsert(req: UpsertReq):
    if not CHROMA_AVAILABLE:
        return {"status": "skipped", "reason": "chroma not available"}
    coll = chroma_client.get_or_create_collection(req.collection)
    embeddings = None
    if req.documents:
        embeddings = embed_model.encode(req.documents).tolist()
    coll.add(
        ids=req.ids,
        documents=req.documents or [],
        metadatas=req.metadatas or [],
        embeddings=embeddings,
    )
    chroma_client.persist()
    return {"status": "ok", "count": len(req.ids)}


@app.post("/query")
def query(req: QueryReq):
    if not CHROMA_AVAILABLE:
        return {"results": []}
    coll = chroma_client.get_or_create_collection(req.collection)
    if req.query is None:
        return {"results": []}
    q_emb = embed_model.encode([req.query]).tolist()[0]
    res = coll.query(query_embeddings=[q_emb], n_results=req.top_k)
    return {"ids": res["ids"], "distances": res.get("distances", [])}


# ═══════════════════════════════════════════════════
# 문서 API
# ═══════════════════════════════════════════════════
@app.get("/api/docs")
def api_list_docs(folder: Optional[str] = None):
    return list_docs(folder)


@app.get("/api/docs/{doc_id}")
def api_get_doc(doc_id: str):
    doc = get_doc(doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


class SaveDocReq(BaseModel):
    title: str = ""
    content: str = ""
    auto_tag: bool = False


class OpenPathReq(BaseModel):
    path: str


class OpenExternalReq(BaseModel):
    url: str


@app.post("/api/docs")
def api_save_doc(req: SaveDocReq, id: str = ""):
    new_id = save_doc(id, req.title, req.content)
    # best-effort: SQLite meta + vector upsert
    try:
        from datetime import datetime, timezone
        db_service.save_meta_document(new_id, req.title, datetime.now(timezone.utc).isoformat())
    except Exception:
        pass
    try:
        if CHROMA_AVAILABLE and req.content:
            coll = chroma_client.get_or_create_collection("my_graph_collection")
            emb = embed_model.encode([req.content]).tolist()
            coll.add(ids=[new_id], documents=[req.content], metadatas=[{"title": req.title}], embeddings=emb)
            chroma_client.persist()
    except Exception:
        pass
    # 자동 태그: 본문 #해시태그 추출 후 기존 태그와 병합
    if req.auto_tag and req.content:
        try:
            extracted = extract_hashtags(req.content)
            if extracted:
                existing = get_tags_for_doc(new_id)
                merged = list(dict.fromkeys(existing + extracted))
                set_tags_for_doc(new_id, merged)
        except Exception:
            pass
    return {"id": new_id}


@app.post("/api/system/open-path")
def api_open_path(req: OpenPathReq):
    raw = (req.path or "").strip().strip('"')
    if not raw:
        raise HTTPException(status_code=400, detail="Empty path")
    target = Path(raw)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Path not found")

    try:
        if os.name == "nt":
            if target.is_dir():
                os.startfile(str(target))  # type: ignore[attr-defined]
            else:
                subprocess.Popen(["explorer", "/select,", str(target)])
        elif os.name == "posix":
            subprocess.Popen(["xdg-open", str(target if target.is_dir() else target.parent)])
        else:
            raise HTTPException(status_code=400, detail="Unsupported platform")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open path: {e}")

    return {"status": "ok"}


@app.post("/api/system/open-external")
def api_open_external(req: OpenExternalReq):
    url = (req.url or "").strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Only http/https URL is supported")
    try:
        webbrowser.open(url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open url: {e}")
    return {"status": "ok"}


def _fetch_url_meta(url: str) -> dict:
    """URL 페이지에서 Open Graph / Twitter Card 메타 정보 추출"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    with httpx.Client(timeout=10, follow_redirects=True) as client:
        r = client.get(url, headers=headers)
        r.raise_for_status()
        html = r.text

    def _get_meta(prop: str) -> Optional[str]:
        # property="og:title" content="..."
        for pattern in [
            rf'<meta[^>]+(?:property|name)=["\'](?:og:{prop}|twitter:{prop})["\'][^>]+content=["\']([^"\']+)["\']',
            rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:{prop}|twitter:{prop})["\']',
        ]:
            m = re.search(pattern, html, re.I | re.DOTALL)
            if m:
                return m.group(1).strip()
        return None

    title = _get_meta("title")
    if not title:
        m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.I)
        title = m.group(1).strip() if m else url

    description = _get_meta("description")
    image = _get_meta("image")
    if image and image.startswith("/"):
        from urllib.parse import urlparse
        parsed = urlparse(url)
        image = f"{parsed.scheme}://{parsed.netloc}{image}"

    return {"title": title, "description": description or "", "image": image or "", "url": url}


@app.get("/api/url-meta")
def api_fetch_url_meta(url: str = ""):
    """URL 메타 정보 조회 (og:title, og:description, og:image) — 메신저 스타일 링크 프리뷰용"""
    u = (url or "").strip()
    if not u.startswith("http://") and not u.startswith("https://"):
        raise HTTPException(status_code=400, detail="Invalid URL")
    try:
        return _fetch_url_meta(u)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch URL: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/docs/{doc_id}")
def api_delete_doc(doc_id: str):
    delete_doc(doc_id)
    try:
        db_service.delete_meta_document(doc_id)
    except Exception:
        pass
    return {"status": "ok"}


# ═══════════════════════════════════════════════════
# 휴지통 API
# ═══════════════════════════════════════════════════
@app.get("/api/trash")
def api_list_trash():
    return list_trash()


@app.post("/api/trash/{doc_id}/restore")
def api_restore_from_trash(doc_id: str):
    if not restore_from_trash(doc_id):
        raise HTTPException(status_code=404, detail="Trash item not found")
    return {"status": "ok"}


@app.delete("/api/trash/{doc_id}")
def api_delete_from_trash(doc_id: str):
    if not delete_from_trash_permanently(doc_id):
        raise HTTPException(status_code=404, detail="Trash item not found")
    return {"status": "ok"}


# ═══════════════════════════════════════════════════
# 태그 API
# ═══════════════════════════════════════════════════
@app.get("/api/tags")
def api_get_all_tags():
    return get_all_tags()


@app.get("/api/docs/{doc_id}/tags")
def api_get_tags(doc_id: str):
    return get_tags_for_doc(doc_id)


class SetTagsReq(BaseModel):
    tags: List[str]


@app.put("/api/docs/{doc_id}/tags")
def api_set_tags(doc_id: str, req: SetTagsReq):
    set_tags_for_doc(doc_id, req.tags)
    return {"status": "ok"}


# ═══════════════════════════════════════════════════
# 폴더 API
# ═══════════════════════════════════════════════════
@app.get("/api/folders")
def api_list_folders():
    return list_folders()


class FolderReq(BaseModel):
    name: str


@app.post("/api/folders")
def api_create_folder(req: FolderReq):
    return create_folder(req.name)


class RenameFolderReq(BaseModel):
    newName: str


@app.put("/api/folders/{name}")
def api_rename_folder(name: str, req: RenameFolderReq):
    return rename_folder(name, req.newName)


@app.delete("/api/folders/{name}")
def api_delete_folder(name: str):
    return delete_folder(name)


class SetFolderReq(BaseModel):
    folder: Optional[str] = None


@app.put("/api/docs/{doc_id}/folder")
def api_set_doc_folder(doc_id: str, req: SetFolderReq):
    set_doc_folder(doc_id, req.folder)
    return {"status": "ok"}


# ═══════════════════════════════════════════════════
# 이미지 API
# ═══════════════════════════════════════════════════
@app.post("/api/images")
async def api_upload_image(
    file: UploadFile = File(...),
    docId: Optional[str] = Form(None),
    source: Optional[str] = Form(None),
):
    data = await file.read()
    filename = save_image(file.filename or "image.png", data)
    url = f"/api/images/{filename}"
    try:
        db_service.save_image_asset(
            stored_name=filename,
            original_name=file.filename or filename,
            mime_type=file.content_type or "image/png",
            size=len(data),
            url=url,
            doc_id=docId,
            source=source or "upload",
        )
    except Exception:
        pass
    return {"url": url, "filename": filename}


@app.get("/api/images/library")
def api_list_image_library(docId: Optional[str] = None, limit: int = 100):
    try:
        return db_service.list_image_assets(doc_id=docId, limit=limit)
    except Exception:
        return []


@app.get("/api/images/{filename}")
def api_get_image(filename: str):
    path = get_image_path(filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)


@app.post("/api/files")
async def api_upload_file(file: UploadFile = File(...)):
    data = await file.read()
    filename = save_file(file.filename or "file.bin", data)
    return {"url": f"/api/files/{filename}", "filename": filename}


@app.get("/api/files/{filename}")
def api_get_file(filename: str):
    path = get_file_path(filename)
    if path is None:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


# ═══════════════════════════════════════════════════
# 백업/복구 API
# ═══════════════════════════════════════════════════
def _make_backup_zip() -> Path:
    data_dir = Path(doc_service.DATA_DIR)
    data_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    tmp_dir = Path(tempfile.gettempdir())
    zip_path = tmp_dir / f"my-graph-backup-{ts}.zip"

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in data_dir.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(data_dir))
    return zip_path


def _restore_from_zip(uploaded_zip: Path):
    data_dir = Path(doc_service.DATA_DIR)
    data_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="my-graph-restore-") as temp_extract:
        extract_dir = Path(temp_extract)
        with zipfile.ZipFile(uploaded_zip, "r") as zf:
            zf.extractall(extract_dir)

        meta_path = extract_dir / "meta.json"
        docs_path = extract_dir / "docs"
        if not meta_path.exists() or not docs_path.exists():
            raise HTTPException(status_code=400, detail="Invalid backup zip: meta.json/docs missing")

        backup_dir = data_dir.parent / "backup"
        backup_dir.mkdir(parents=True, exist_ok=True)
        snapshot = backup_dir / f"restore_before_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        if data_dir.exists():
            shutil.copytree(data_dir, snapshot, dirs_exist_ok=True)

        # 전체 데이터 디렉토리를 복구본으로 교체
        for child in data_dir.iterdir():
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink(missing_ok=True)

        for child in extract_dir.iterdir():
            target = data_dir / child.name
            if child.is_dir():
                shutil.copytree(child, target, dirs_exist_ok=True)
            else:
                shutil.copy2(child, target)


@app.get("/api/backup/download")
def api_backup_download():
    zip_path = _make_backup_zip()
    return FileResponse(
        str(zip_path),
        media_type="application/zip",
        filename=zip_path.name,
    )


@app.post("/api/backup/restore")
async def api_backup_restore(file: UploadFile = File(...)):
    suffix = Path(file.filename or "backup.zip").suffix or ".zip"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tf:
        data = await file.read()
        tf.write(data)
        temp_zip = Path(tf.name)
    try:
        _restore_from_zip(temp_zip)
        return {"status": "ok"}
    finally:
        temp_zip.unlink(missing_ok=True)
