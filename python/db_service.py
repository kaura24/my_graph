"""
db_service.py — SQLite 메타데이터/태그/그래프 관리
sqliteAdapter.ts를 Python으로 이식
"""
import sqlite3
import os
import json
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
        CREATE TABLE IF NOT EXISTS tag_embeddings (
            tag TEXT PRIMARY KEY,
            vectorJson TEXT NOT NULL,
            docCount INTEGER NOT NULL DEFAULT 0,
            model TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS graph_edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sourceDocId TEXT NOT NULL,
            targetDocId TEXT NOT NULL,
            edgeType TEXT NOT NULL,
            weight REAL NOT NULL,
            distance REAL NOT NULL,
            evidenceJson TEXT,
            model TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            UNIQUE(sourceDocId, targetDocId, edgeType)
        );
        CREATE INDEX IF NOT EXISTS idx_graph_edges_type_weight
            ON graph_edges(edgeType, weight DESC);
        CREATE INDEX IF NOT EXISTS idx_graph_edges_source
            ON graph_edges(sourceDocId);
        CREATE INDEX IF NOT EXISTS idx_graph_edges_target
            ON graph_edges(targetDocId);
        CREATE TABLE IF NOT EXISTS tag_similarity_cache (
            tagA TEXT NOT NULL,
            tagB TEXT NOT NULL,
            score REAL NOT NULL,
            model TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            PRIMARY KEY (tagA, tagB)
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


def replace_tag_embeddings(tag_rows: list[dict], model: str):
    """
    태그 centroid 임베딩 전체 교체.
    tag_rows: [{tag, vector, docCount}]
    """
    conn = _get_conn()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute("DELETE FROM tag_embeddings")
    conn.executemany(
        """
        INSERT INTO tag_embeddings (tag, vectorJson, docCount, model, updatedAt)
        VALUES (?, ?, ?, ?, ?)
        """,
        [
            (
                row["tag"],
                json.dumps(row["vector"], ensure_ascii=False),
                int(row.get("docCount", 0)),
                model,
                now,
            )
            for row in tag_rows
        ],
    )
    conn.commit()
    conn.close()


def replace_graph_edges(edge_rows: list[dict], edge_type: str, model: str):
    """
    특정 edgeType의 그래프 엣지 전체 교체.
    edge_rows: [{sourceDocId,targetDocId,weight,distance,evidence}]
    """
    conn = _get_conn()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute("DELETE FROM graph_edges WHERE edgeType = ?", (edge_type,))
    conn.executemany(
        """
        INSERT INTO graph_edges
        (sourceDocId, targetDocId, edgeType, weight, distance, evidenceJson, model, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                row["sourceDocId"],
                row["targetDocId"],
                edge_type,
                float(row["weight"]),
                float(row["distance"]),
                json.dumps(row.get("evidence", []), ensure_ascii=False),
                model,
                now,
            )
            for row in edge_rows
        ],
    )
    conn.commit()
    conn.close()


def get_tag_similarity_cache(model: str) -> dict[tuple[str, str], float]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT tagA, tagB, score FROM tag_similarity_cache WHERE model = ?",
        (model,),
    ).fetchall()
    conn.close()
    return {(r["tagA"], r["tagB"]): r["score"] for r in rows}


def save_tag_similarity_cache(pairs: list[dict], model: str):
    """pairs: [{"tagA", "tagB", "score"}]"""
    conn = _get_conn()
    now = datetime.now(timezone.utc).isoformat()
    conn.executemany(
        """
        INSERT OR REPLACE INTO tag_similarity_cache (tagA, tagB, score, model, updatedAt)
        VALUES (?, ?, ?, ?, ?)
        """,
        [(p["tagA"], p["tagB"], float(p["score"]), model, now) for p in pairs],
    )
    conn.commit()
    conn.close()


def invalidate_tag_similarity_cache(tags: list[str], model: str):
    """특정 태그가 포함된 캐시 행만 삭제 (증분 재계산용)."""
    if not tags:
        return
    conn = _get_conn()
    placeholders = ",".join("?" for _ in tags)
    conn.execute(
        f"DELETE FROM tag_similarity_cache WHERE model = ? AND (tagA IN ({placeholders}) OR tagB IN ({placeholders}))",
        [model] + tags + tags,
    )
    conn.commit()
    conn.close()


def list_graph_edges(edge_type: str = "tag_semantic", min_weight: float = 0.0, limit: int = 2000) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        """
        SELECT sourceDocId, targetDocId, edgeType, weight, distance, evidenceJson, model, updatedAt
        FROM graph_edges
        WHERE edgeType = ? AND weight >= ?
        ORDER BY weight DESC, sourceDocId ASC, targetDocId ASC
        LIMIT ?
        """,
        (edge_type, float(min_weight), int(limit)),
    ).fetchall()
    conn.close()
    result: list[dict] = []
    for r in rows:
        item = dict(r)
        try:
            item["evidence"] = json.loads(item.get("evidenceJson") or "[]")
        except Exception:
            item["evidence"] = []
        item.pop("evidenceJson", None)
        result.append(item)
    return result
