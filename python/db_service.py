"""
db_service.py — SQLite 메타데이터/태그/그래프 관리
sqliteAdapter.ts를 Python으로 이식
"""
import sqlite3
import os
from pathlib import Path
from datetime import datetime, timezone

_DEFAULT_DB_PATH = os.path.join(
    os.environ.get("APPDATA") or os.path.join(Path.home(), ".config"),
    "my-graph",
    "metadata.db",
)
DB_PATH = os.environ.get("MY_GRAPH_DB_PATH", _DEFAULT_DB_PATH)


def _get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            title TEXT,
            updatedAt TEXT
        );
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            docId TEXT,
            tag TEXT
        );
        CREATE TABLE IF NOT EXISTS graph_store (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            json TEXT
        );
        CREATE TABLE IF NOT EXISTS image_assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            docId TEXT,
            originalName TEXT,
            storedName TEXT,
            mimeType TEXT,
            size INTEGER,
            source TEXT,
            url TEXT,
            createdAt TEXT
        );
    """)
    return conn


def save_meta_document(doc_id: str, title: str, updated_at: str):
    conn = _get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO documents (id, title, updatedAt) VALUES (?, ?, ?)",
        (doc_id, title, updated_at),
    )
    conn.commit()
    conn.close()


def delete_meta_document(doc_id: str):
    conn = _get_conn()
    conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.execute("DELETE FROM tags WHERE docId = ?", (doc_id,))
    conn.commit()
    conn.close()


def set_tags_for_doc(doc_id: str, tags: list[str]):
    conn = _get_conn()
    conn.execute("DELETE FROM tags WHERE docId = ?", (doc_id,))
    conn.executemany(
        "INSERT INTO tags (docId, tag) VALUES (?, ?)",
        [(doc_id, t) for t in tags],
    )
    conn.commit()
    conn.close()


def get_tags_for_doc(doc_id: str) -> list[str]:
    conn = _get_conn()
    rows = conn.execute("SELECT tag FROM tags WHERE docId = ?", (doc_id,)).fetchall()
    conn.close()
    return [r["tag"] for r in rows]


def get_all_docs() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute("SELECT id, title, updatedAt FROM documents").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def save_graph_json(json_str: str):
    conn = _get_conn()
    conn.execute("INSERT INTO graph_store (json) VALUES (?)", (json_str,))
    conn.commit()
    conn.close()


def load_latest_graph_json() -> str | None:
    conn = _get_conn()
    row = conn.execute("SELECT json FROM graph_store ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    return row["json"] if row else None


def save_image_asset(
    stored_name: str,
    original_name: str,
    mime_type: str,
    size: int,
    url: str,
    doc_id: str | None = None,
    source: str = "upload",
):
    conn = _get_conn()
    conn.execute(
        """
        INSERT INTO image_assets (docId, originalName, storedName, mimeType, size, source, url, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            doc_id,
            original_name,
            stored_name,
            mime_type,
            size,
            source,
            url,
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    conn.commit()
    conn.close()


def list_image_assets(doc_id: str | None = None, limit: int = 100) -> list[dict]:
    conn = _get_conn()
    if doc_id:
        rows = conn.execute(
            """
            SELECT id, docId, originalName, storedName, mimeType, size, source, url, createdAt
            FROM image_assets
            WHERE docId = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (doc_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT id, docId, originalName, storedName, mimeType, size, source, url, createdAt
            FROM image_assets
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
