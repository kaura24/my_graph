"""
app.py — FastAPI 백엔드 (벡터 검색 + 문서/태그/폴더 REST API)
Chroma 임베딩 엔드포인트는 유지하면서, Electron IPC 핸들러를 REST로 통합.
"""
from pathlib import Path as _Path
from dotenv import load_dotenv

# .env 로드: 프로젝트 루트 우선, CWD 폴백 (uvicorn 실행 경로 대응)
_env_paths = [
    _Path(__file__).resolve().parent.parent / ".env",
    _Path.cwd() / ".env",
    _Path.cwd().parent / ".env",
]
for _p in _env_paths:
    if _p.exists():
        load_dotenv(_p)
        break
else:
    load_dotenv(_env_paths[0])  # 없어도 시도 (키 없으면 빈 문자열)

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
import json
import os
import re
import subprocess
import webbrowser
import unicodedata
import numpy as np

import httpx

# ─── Chroma / Embedding (기존 유지) ───────────────
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

# ─── 서비스 모듈 ──────────────────────────────────
from doc_service import (
    list_docs, get_doc, save_doc, delete_doc,
    get_tags_for_doc, set_tags_for_doc, get_all_tags, extract_hashtags, extract_keywords_nlp,
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

# ─── Chroma 초기화 (v0.4+ 신규 API) ─────────────────
try:
    chroma_client = chromadb.PersistentClient(path="./chroma_db")
    CHROMA_AVAILABLE = True
except Exception:
    CHROMA_AVAILABLE = False
    chroma_client = None

# ─── 임베딩 모델 초기화 (Chroma와 독립) ──────────────
try:
    embed_model = SentenceTransformer("all-MiniLM-L6-v2")
    EMBED_AVAILABLE = True
except Exception:
    embed_model = None
    EMBED_AVAILABLE = False

# ─── OpenAI / AI 상태 ─────────────────────────────
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
AI_AVAILABLE = bool(OPENAI_API_KEY)
# AI 태그 추출에 실제 사용하는 모델
AI_TAG_MODEL = "gpt-4o-mini-search-preview"
AUTO_TAG_LIMIT = 8
EMBED_MODEL_NAME = "jhgan/ko-sroberta-sts"  # 한국어 시맨틱 임베딩 모델
TAG_EDGE_TYPE = "tag_semantic"
TAG_EDGE_THRESHOLD_AI = 0.15      # AI(GPT) 유사도 기준
TAG_EDGE_THRESHOLD_EMBED = 0.45   # 한국어 centroid 유사도 기준
TAG_EDGE_TOP_N = 3
TAG_EDGE_K = 8
AI_SIM_MODEL = "gpt-4o-mini"


def _check_internet() -> bool:
    """인터넷 연결 여부 확인 (타임아웃 3초)"""
    try:
        with httpx.Client(timeout=3.0) as client:
            r = client.get("https://api.openai.com/v1/models", headers={"Authorization": "Bearer dummy"})
            # 401 = 서버 도달 성공 (키 없음/잘못됨), 연결됨
            return r.status_code in (200, 401, 403)
    except Exception:
        return False


def _fetch_openai_models() -> tuple[bool, list[str]]:
    """
    OpenAI API로 연결 확인 + 사용 가능한 채팅 모델 목록 조회.
    Returns (connected: bool, models: list[str])
    """
    if not OPENAI_API_KEY:
        return False, []
    try:
        with httpx.Client(timeout=8.0) as client:
            r = client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            )
            if r.status_code != 200:
                return False, []
            data = r.json()
            models = data.get("data", [])
            # 채팅/완성용 모델만 필터 (gpt-*, o1-*)
            chat_models = sorted(
                m["id"]
                for m in models
                if isinstance(m.get("id"), str)
                and (m["id"].startswith("gpt-") or m["id"].startswith("o1-"))
            )
            return True, chat_models
    except Exception:
        return False, []


def _extract_keywords_ai(html_content: str, top_k: int = AUTO_TAG_LIMIT) -> list[str]:
    """OpenAI API로 본문에서 핵심 키워드/태그 추출. HTML 태그 제거 후 텍스트만 전달."""
    if not OPENAI_API_KEY or not html_content:
        return []
    import re
    text = re.sub(r"<[^>]+>", " ", html_content)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) < 10:
        return []
    try:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=AI_TAG_MODEL,
            messages=[
                {"role": "system", "content": "다음 텍스트에서 핵심 키워드/태그 5~8개를 추출해줘. 한글이면 한글로, 영어면 영어로. 쉼표로만 구분해서 답해줘. 다른 설명 없이 태그만."},
                {"role": "user", "content": text[:4000]},
            ],
            max_tokens=150,
        )
        raw = (resp.choices[0].message.content or "").strip()
        tags = [t.strip() for t in raw.replace("，", ",").split(",") if t.strip()]
        return tags[:top_k] if tags else []
    except Exception:
        return []


def _compute_tag_similarities_ai(needed_pairs: set[tuple[str, str]]) -> dict[tuple[str, str], float]:
    """
    GPT에게 실제 필요한 태그 쌍만 보내서 연관도를 판단시킨다.
    needed_pairs: 실제 문서 간 비교에 필요한 (tagA, tagB) 집합.
    """
    if not OPENAI_API_KEY or not needed_pairs:
        return {}

    cached = db_service.get_tag_similarity_cache(AI_SIM_MODEL)

    missing: list[tuple[str, str]] = []
    for key in needed_pairs:
        if key not in cached:
            missing.append(key)

    if missing:
        print(f"[AI-SIM] 캐시 히트: {len(needed_pairs)-len(missing)}, 새 계산 필요: {len(missing)}")
        _fetch_ai_similarities(missing, cached)

    return {k: cached.get(k, 0.0) for k in needed_pairs}


def _fetch_ai_similarities(
    pairs: list[tuple[str, str]],
    cache_out: dict[tuple[str, str], float],
):
    """GPT API 호출 → 태그 쌍별 유사도 → cache_out에 병합 + DB 저장."""
    BATCH = 500
    for start in range(0, len(pairs), BATCH):
        batch = pairs[start : start + BATCH]
        pair_lines = "\n".join(f"{i}: {a} | {b}" for i, (a, b) in enumerate(batch))
        prompt = (
            "아래 태그 쌍들의 의미적 연관도를 0.0~1.0 사이 숫자로 평가해줘.\n"
            "0.0 = 완전 무관, 1.0 = 동의어/거의 같은 의미.\n"
            "JSON 배열로만 답해줘. [{\"i\":0,\"s\":0.85}, ...] 형식.\n"
            "설명 없이 JSON만.\n\n"
            f"{pair_lines}"
        )
        try:
            from openai import OpenAI
            client = OpenAI(api_key=OPENAI_API_KEY)
            resp = client.chat.completions.create(
                model=AI_SIM_MODEL,
                messages=[
                    {"role": "system", "content": "태그 연관도 평가 전문가. JSON만 반환."},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=min(len(batch) * 20, 16384),
                temperature=0.0,
            )
            raw = (resp.choices[0].message.content or "").strip()
            raw = re.sub(r"^```json\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
            items = json.loads(raw)
            to_save: list[dict] = []
            for item in items:
                idx = int(item["i"])
                score = max(0.0, min(1.0, float(item["s"])))
                if 0 <= idx < len(batch):
                    key = batch[idx]
                    cache_out[key] = score
                    to_save.append({"tagA": key[0], "tagB": key[1], "score": score})
            if to_save:
                db_service.save_tag_similarity_cache(to_save, AI_SIM_MODEL)
        except Exception:
            import traceback
            traceback.print_exc()
            fallback: list[dict] = []
            for key in batch:
                if key not in cache_out:
                    cache_out[key] = 0.0
                    fallback.append({"tagA": key[0], "tagB": key[1], "score": 0.0})
            if fallback:
                db_service.save_tag_similarity_cache(fallback, AI_SIM_MODEL)


def _to_plain_text(html_content: str) -> str:
    """임베딩 입력용: HTML 제거 + 공백 정규화."""
    text = re.sub(r"<[^>]+>", " ", html_content or "")
    text = re.sub(r"\s+", " ", text).strip()
    # 변수 할당 접두사 제거 (para_B2 = """... 등) → 본문만 비교
    text = re.sub(r"^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*[\"']{3}\s*", "", text)
    text = re.sub(r"\s*[\"']{3}\s*$", "", text)
    return text.strip()


def _normalize_tag(tag: str) -> str:
    """
    태그 비교/집계용 정규화.
    - Unicode NFC 정규화
    - 내부 공백 1칸화
    - 대소문자 비정규화(casefold)
    """
    t = unicodedata.normalize("NFC", str(tag or ""))
    t = re.sub(r"\s+", " ", t).strip()
    return t.casefold()


_NOISE_TAGS = frozenset({
    "para", "param", "var", "const", "let", "def", "class", "function",
    "true", "false", "null", "none", "undefined", "return", "import",
    "http", "https", "www", "html", "css", "json", "xml",
})

def _is_noise_tag(tag: str) -> bool:
    if len(tag) < 2:
        return True
    if tag in _NOISE_TAGS:
        return True
    if re.fullmatch(r"[a-z_][a-z0-9_]*", tag) and len(tag) <= 4:
        return True
    return False


def _normalize_tag_list(tags: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in tags:
        n = _normalize_tag(raw)
        if not n or n in seen or _is_noise_tag(n):
            continue
        seen.add(n)
        out.append(n)
    return out


def _build_tag_centroids(min_docs: int = 1) -> tuple[dict[str, np.ndarray], dict[str, int]]:
    """
    태그별 컨텍스트 임베딩 centroid 생성.
    - 단위: 문서 본문 임베딩
    - 태그 벡터: 해당 태그가 붙은 문서 임베딩의 평균
    """
    if embed_model is None:
        return {}, {}

    tag_sum_vectors: dict[str, np.ndarray] = {}
    tag_counts: dict[str, int] = {}

    for item in list_docs():
        doc_id = item.get("id")
        if not doc_id:
            continue
        tags = _normalize_tag_list([str(t) for t in (item.get("tags") or [])])
        if not tags:
            continue
        detail = get_doc(doc_id)
        if not detail:
            continue
        text = _to_plain_text(detail.get("content", ""))
        if len(text) < 10:
            continue
        try:
            emb = np.asarray(embed_model.encode([text])[0], dtype=np.float32)
        except Exception:
            continue
        for tag in tags:
            if tag in tag_sum_vectors:
                tag_sum_vectors[tag] = tag_sum_vectors[tag] + emb
                tag_counts[tag] = tag_counts[tag] + 1
            else:
                tag_sum_vectors[tag] = emb.copy()
                tag_counts[tag] = 1

    centroids: dict[str, np.ndarray] = {}
    counts: dict[str, int] = {}
    for tag, vec_sum in tag_sum_vectors.items():
        c = tag_counts.get(tag, 0)
        if c >= max(1, min_docs):
            centroids[tag] = vec_sum / float(c)
            counts[tag] = c
    return centroids, counts


def _build_doc_edges_ai(
    tag_sims: dict[tuple[str, str], float],
    threshold: float = TAG_EDGE_THRESHOLD_AI,
    top_n: int = TAG_EDGE_TOP_N,
    k_per_node: int = TAG_EDGE_K,
) -> list[dict]:
    """
    문서-문서 edge 생성 (공통 태그 게이트 + AI 태그 유사도 가중치).
    핵심 원칙:
      1. 공통 태그 ≥1 필수 — 0개면 유사도 0, 연결 없음
      2. 연결 강도(weight)는 AI가 판단한 cross-tag 유사도로 결정
      3. threshold 미만이면 제외, 노드당 k_per_node 제한 적용
    """
    items = list_docs()
    doc_tags: dict[str, list[str]] = {}
    for item in items:
        doc_id = str(item.get("id") or "").strip()
        if not doc_id:
            continue
        tags = _normalize_tag_list([str(t) for t in (item.get("tags") or [])])
        if tags:
            doc_tags[doc_id] = tags

    doc_ids = sorted(doc_tags.keys())
    if len(doc_ids) < 2:
        return []

    def _get_sim(a: str, b: str) -> float:
        if a == b:
            return 1.0
        key = (a, b) if a <= b else (b, a)
        return tag_sims.get(key, 0.0)

    candidates: list[dict] = []
    n = len(doc_ids)
    for i in range(n):
        a = doc_ids[i]
        set_a = set(doc_tags[a])
        for j in range(i + 1, n):
            b = doc_ids[j]
            set_b = set(doc_tags[b])
            shared = set_a & set_b
            if not shared:
                continue

            pair_scores: list[tuple[float, str, str]] = []
            for ta in doc_tags[a]:
                for tb in doc_tags[b]:
                    pair_scores.append((_get_sim(ta, tb), ta, tb))
            pair_scores.sort(key=lambda x: (-x[0], x[1], x[2]))
            picked = pair_scores[: max(1, min(top_n, len(pair_scores)))]
            doc_sim = float(sum(s for s, _, _ in picked) / len(picked))

            evidence: list[dict] = [{"sharedTags": sorted(shared)}]
            for score, ta, tb in picked:
                evidence.append({"tagA": ta, "tagB": tb, "similarity": round(score, 4)})

            candidates.append({
                "sourceDocId": a, "targetDocId": b,
                "weight": round(doc_sim, 6),
                "distance": round(1.0 - doc_sim, 6),
                "evidence": evidence,
            })

    if not candidates:
        return []

    candidates.sort(key=lambda x: (-x["weight"], x["sourceDocId"]))

    selected: list[dict] = []
    degree: dict[str, int] = {}
    for row in candidates:
        s, t = row["sourceDocId"], row["targetDocId"]
        if row["weight"] < threshold:
            if degree.get(s, 0) >= k_per_node or degree.get(t, 0) >= k_per_node:
                continue
        selected.append(row)
        degree[s] = degree.get(s, 0) + 1
        degree[t] = degree.get(t, 0) + 1
    return selected


def _collect_doc_tags() -> tuple[dict[str, list[str]], list[str]]:
    """문서별 태그 맵 + 전체 고유 태그 리스트 수집."""
    doc_tags: dict[str, list[str]] = {}
    all_tags: set[str] = set()
    for item in list_docs():
        doc_id = str(item.get("id") or "").strip()
        if not doc_id:
            continue
        tags = _normalize_tag_list([str(t) for t in (item.get("tags") or [])])
        if tags:
            doc_tags[doc_id] = tags
            all_tags.update(tags)
    return doc_tags, sorted(all_tags)


def _collect_needed_pairs(doc_tags: dict[str, list[str]]) -> set[tuple[str, str]]:
    """공통 태그가 있는 문서쌍에서 필요한 태그 쌍만 수집."""
    needed: set[tuple[str, str]] = set()
    ids = sorted(doc_tags.keys())
    for i, a in enumerate(ids):
        set_a = set(doc_tags[a])
        for b in ids[i + 1:]:
            if set_a & set(doc_tags[b]):
                for ta in doc_tags[a]:
                    for tb in doc_tags[b]:
                        if ta != tb:
                            key = (ta, tb) if ta <= tb else (tb, ta)
                            needed.add(key)
    return needed


def _build_centroid_sims(
    centroids: dict[str, np.ndarray],
) -> dict[tuple[str, str], float]:
    """centroid 벡터 간 cosine similarity 딕셔너리."""
    norm_c = {t: float(np.linalg.norm(v)) for t, v in centroids.items()}
    sims: dict[tuple[str, str], float] = {}
    tags_c = list(centroids.keys())
    for i, a in enumerate(tags_c):
        for b in tags_c[i + 1:]:
            key = (a, b) if a <= b else (b, a)
            denom = norm_c[a] * norm_c[b] + 1e-12
            sims[key] = float(np.dot(centroids[a], centroids[b]) / denom)
    return sims


def _rebuild_semantic_graph_edges(
    engine: str = "auto",
    top_n: int = TAG_EDGE_TOP_N,
    k_per_node: int = TAG_EDGE_K,
    min_docs: int = 1,
) -> dict:
    """
    engine:
      "auto"   — AI 키가 있으면 ai, 없으면 korean_centroid
      "ai"     — GPT-4o-mini 태그 유사도 (API 키 필요)
      "korean_centroid" — ko-sroberta-sts 한국어 centroid 유사도 (로컬)
    """
    doc_tags, all_tags_list = _collect_doc_tags()
    if len(all_tags_list) < 2:
        return {"status": "skipped", "reason": "tags < 2"}

    if engine == "auto":
        engine = "ai" if AI_AVAILABLE else "korean_centroid"

    if engine == "ai":
        if not AI_AVAILABLE:
            return {"status": "skipped", "reason": "OpenAI API key not set"}
        needed = _collect_needed_pairs(doc_tags)
        print(f"[REBUILD:ai] 태그 {len(all_tags_list)}개, 쌍 {len(needed)}개")
        tag_sims = _compute_tag_similarities_ai(needed)
        threshold = TAG_EDGE_THRESHOLD_AI
        edge_rows = _build_doc_edges_ai(
            tag_sims=tag_sims, threshold=threshold,
            top_n=top_n, k_per_node=k_per_node,
        )
        model_used = AI_SIM_MODEL

    elif engine == "korean_centroid":
        if not EMBED_AVAILABLE or embed_model is None:
            return {"status": "skipped", "reason": "embedding model unavailable"}
        centroids, counts = _build_tag_centroids(min_docs=min_docs)
        tag_rows = [
            {"tag": t, "vector": v.tolist(), "docCount": counts.get(t, 0)}
            for t, v in sorted(centroids.items())
        ]
        if CHROMA_AVAILABLE:
            db_service.replace_tag_embeddings(tag_rows, EMBED_MODEL_NAME)
        tag_sims_c = _build_centroid_sims(centroids)
        threshold = TAG_EDGE_THRESHOLD_EMBED
        print(f"[REBUILD:korean_centroid] 태그 {len(all_tags_list)}개, centroid {len(centroids)}개")
        edge_rows = _build_doc_edges_ai(
            tag_sims=tag_sims_c, threshold=threshold,
            top_n=top_n, k_per_node=k_per_node,
        )
        model_used = EMBED_MODEL_NAME
    else:
        return {"status": "skipped", "reason": f"unknown engine: {engine}"}

    db_service.replace_graph_edges(edge_rows, TAG_EDGE_TYPE, model_used)
    return {
        "status": "ok",
        "engine": engine,
        "tagCount": len(all_tags_list),
        "edgeCount": len(edge_rows),
        "threshold": threshold,
        "topN": top_n,
        "kPerNode": k_per_node,
    }


def _safe_rebuild_semantic_graph_edges(
    *,
    engine: str = "auto",
    top_n: int = TAG_EDGE_TOP_N,
    k_per_node: int = TAG_EDGE_K,
    min_docs: int = 1,
    context: str = "",
) -> dict:
    try:
        res = _rebuild_semantic_graph_edges(
            engine=engine,
            top_n=top_n,
            k_per_node=k_per_node,
            min_docs=min_docs,
        )
        return {"ok": True, "context": context, **res}
    except Exception as e:
        return {"ok": False, "context": context, "status": "error", "reason": str(e)}


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
    top_k: int = 8


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
    auto_tag: bool = False  # #해시태그 추출
    auto_tag_nlp: bool = False  # kiwipiepy 기반 명사 추출
    auto_tag_ai: bool = False  # OpenAI 기반 AI 태그 추출 (인터넷 + API 키 필요)


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
    # 자동 태그: #해시태그 + NLP 명사 추출 후 기존 태그와 병합
    extracted_all: list[str] = []
    if req.auto_tag and req.content:
        try:
            extracted_all.extend(extract_hashtags(req.content))
        except Exception:
            pass
    if req.auto_tag_nlp and req.content:
        try:
            extracted_all.extend(extract_keywords_nlp(req.content, top_k=AUTO_TAG_LIMIT))
        except Exception:
            pass
    if req.auto_tag_ai and req.content and AI_AVAILABLE:
        try:
            extracted_all.extend(_extract_keywords_ai(req.content, top_k=AUTO_TAG_LIMIT))
        except Exception:
            pass
    if extracted_all:
        try:
            existing = get_tags_for_doc(new_id)
            extracted_unique = list(dict.fromkeys(extracted_all))[:AUTO_TAG_LIMIT]
            merged = list(dict.fromkeys(existing + extracted_unique))[:AUTO_TAG_LIMIT]
            old_norm = set(_normalize_tag_list(existing))
            new_norm = set(_normalize_tag_list(merged))
            changed = old_norm ^ new_norm
            if changed:
                db_service.invalidate_tag_similarity_cache(list(changed), AI_SIM_MODEL)
            set_tags_for_doc(new_id, merged)
        except Exception:
            pass
    rebuild = _safe_rebuild_semantic_graph_edges(context="save_doc")
    return {"id": new_id, "rebuild": rebuild}


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


@app.get("/api/network/status")
def api_network_status():
    """인터넷 연결 여부 확인"""
    return {"connected": _check_internet()}


@app.get("/api/ai/status")
def api_ai_status():
    """AI(OpenAI) 사용 가능 여부: API 키로 연결 확인 + 사용 가능 모델 목록"""
    has_key = bool(OPENAI_API_KEY)
    if not has_key:
        return {
            "connected": _check_internet(),
            "hasKey": False,
            "available": False,
            "models": [],
            "activeModel": "",
        }
    connected, models = _fetch_openai_models()
    return {
        "connected": connected,
        "hasKey": True,
        "available": connected,
        "models": models,
        "activeModel": AI_TAG_MODEL,
    }


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


# ═══════════════════════════════════════════════════
# URL 분석 → 문서 자동 생성
# ═══════════════════════════════════════════════════

def _fetch_page_text(url: str) -> tuple[str, str]:
    """URL에서 전체 HTML을 가져온 뒤 본문 텍스트와 raw HTML 반환"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    }
    with httpx.Client(timeout=20, follow_redirects=True) as client:
        r = client.get(url, headers=headers)
        r.raise_for_status()
        html = r.text

    body = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.I | re.S)
    body = re.sub(r"<style[^>]*>.*?</style>", " ", body, flags=re.I | re.S)
    body = re.sub(r"<[^>]+>", " ", body)
    body = re.sub(r"\s+", " ", body).strip()
    return body, html


def _ai_analyze_url(url: str, page_text: str, meta: dict) -> dict:
    """GPT로 URL 페이지를 분석하여 제목, 요약, 태그를 생성"""
    if not AI_AVAILABLE:
        raise RuntimeError("OpenAI API 키가 설정되지 않았습니다")

    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY)

    truncated = page_text[:12000]
    meta_hint = ""
    if meta.get("title"):
        meta_hint += f"메타 제목: {meta['title']}\n"
    if meta.get("description"):
        meta_hint += f"메타 설명: {meta['description']}\n"

    prompt = f"""다음은 웹 페이지({url})의 본문 텍스트입니다.

{meta_hint}
본문:
{truncated}

위 내용을 분석하여 아래 JSON 형식으로 답해주세요. 다른 설명 없이 JSON만 출력하세요.
{{
  "title": "핵심을 담은 간결한 제목 (한국어)",
  "summary": "1000자 이상으로 상세하게 핵심 내용을 요약 (한국어, 문단 나누어서 작성)",
  "tags": ["태그1", "태그2", ...최대 8개]
}}"""

    resp = client.chat.completions.create(
        model=AI_TAG_MODEL,
        messages=[
            {"role": "system", "content": "너는 웹 페이지 분석 전문가야. 주어진 페이지 내용을 분석해서 제목, 요약, 태그를 JSON으로 반환해."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=4000,
    )
    raw = (resp.choices[0].message.content or "").strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        result = {"title": meta.get("title", url), "summary": raw[:500], "tags": []}

    if not isinstance(result.get("tags"), list):
        result["tags"] = []
    result["tags"] = [t for t in result["tags"] if isinstance(t, str) and t.strip()][:AUTO_TAG_LIMIT]
    return result


# ─── 표준 분류 체계 ────────────────────────────────────────────────────────────
# AI 자동 분류용 20개: AI 세부 10개 + 코드 세부 10개
# 일반 카테고리(AI, 코드, 여행 등)는 사용자가 직접 폴더 생성 시 활용
_FOLDER_TAXONOMY: list[str] = [
    # AI 세부 (10개)
    "AI/머신러닝",
    "AI/딥러닝",
    "AI/NLP",
    "AI/컴퓨터비전",
    "AI/생성AI",
    "AI/프롬프트",
    "AI/모델",
    "AI/데이터",
    "AI/연구",
    "AI/활용사례",
    # 코드 세부 (10개)
    "코드/프론트엔드",
    "코드/백엔드",
    "코드/데이터베이스",
    "코드/인프라",
    "코드/알고리즘",
    "코드/보안",
    "코드/모바일",
    "코드/오픈소스",
    "코드/도구",
    "코드/아키텍처",
]


def _ai_classify_folder(title: str, tags: list[str]) -> dict:
    """AI가 문서를 적절한 폴더에 배치.
    우선순위: ① 사용자가 직접 만든 폴더 → ② 표준 분류 체계 → ③ '기타'
    """
    if not AI_AVAILABLE:
        return {"folder": "", "created": False}

    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY)

    existing_folders = list_folders()
    tags_str = ", ".join(tags) if tags else "(없음)"

    # 사용자 폴더와 표준 체계를 합산 (중복 제거, 사용자 폴더 우선 표시)
    combined = list(existing_folders)
    for f in _FOLDER_TAXONOMY:
        if f not in combined:
            combined.append(f)

    user_section = (
        "\n".join(f"  - {f}" for f in existing_folders)
        if existing_folders else "  (없음)"
    )
    taxonomy_section = "\n".join(f"  - {f}" for f in _FOLDER_TAXONOMY)

    # 일반 카테고리 fallback (표준 체계에 없는 경우 안내)
    general_categories = ["AI", "코드", "여행", "경제/금융", "건강/의료", "과학/기술", "사회/문화", "역사", "비즈니스", "기타"]

    prompt = f"""문서를 분류할 폴더를 하나 선택해줘.

[사용자가 만든 폴더 — 최우선 검토]
{user_section}

[표준 분류 체계 (AI·코드 세부 20개) — 사용자 폴더에 적합한 것이 없을 때 사용]
{taxonomy_section}

[일반 카테고리 (위 두 목록에 없을 때만 사용)]
{chr(10).join(f"  - {c}" for c in general_categories)}

새 문서 정보:
- 제목: {title}
- 태그: [{tags_str}]

규칙:
1. 사용자 폴더 중 의미상 잘 맞는 것이 있으면 반드시 그것을 사용
2. 없으면 표준 분류 체계 20개에서 가장 적합한 것을 선택
3. AI/코드 관련이 아닌 내용은 일반 카테고리(여행, 경제/금융 등)에서 선택
4. 반드시 위 목록에 있는 이름을 정확히 그대로 반환

JSON만 답해: {{"folder": "폴더명"}}"""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "너는 문서 분류 전문가야. 사용자 폴더를 최우선으로 검토하고, 없으면 표준 체계를 사용해. 반드시 목록에 있는 이름만 반환해. JSON만 반환해."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=60,
        )
        raw = (resp.choices[0].message.content or "").strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        parsed = json.loads(raw)

        folder_name = str(parsed.get("folder", "")).strip()

        _GENERAL_CATEGORIES = ["AI", "코드", "여행", "경제/금융", "건강/의료", "과학/기술", "사회/문화", "역사", "비즈니스", "기타"]
        # 사용자 폴더, 표준 체계 20개, 일반 카테고리 모두에 없으면 "기타"로 폴백
        valid = existing_folders + _FOLDER_TAXONOMY + _GENERAL_CATEGORIES
        if folder_name not in valid:
            folder_name = "기타"

        is_new = folder_name not in existing_folders
        if is_new:
            create_folder(folder_name)

        return {"folder": folder_name, "created": is_new}
    except Exception:
        return {"folder": "", "created": False}


class UrlAnalyzeReq(BaseModel):
    url: str


@app.post("/api/url/analyze")
def api_analyze_url(req: UrlAnalyzeReq):
    """URL → 메타정보 + 본문 스크래핑 → AI 분석 (제목/요약/태그)"""
    u = (req.url or "").strip()
    if not u.startswith("http://") and not u.startswith("https://"):
        raise HTTPException(status_code=400, detail="유효한 URL이 아닙니다 (http:// 또는 https://)")
    if not AI_AVAILABLE:
        raise HTTPException(status_code=503, detail="AI 미연결 — OpenAI API 키를 설정하세요")

    try:
        meta = _fetch_url_meta(u)
    except Exception:
        meta = {"title": u, "description": "", "image": "", "url": u}

    try:
        page_text, _ = _fetch_page_text(u)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"페이지를 가져올 수 없습니다: {e}")

    if len(page_text) < 20:
        raise HTTPException(status_code=422, detail="페이지에서 충분한 텍스트를 추출할 수 없습니다")

    try:
        analysis = _ai_analyze_url(u, page_text, meta)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 분석 실패: {e}")

    ai_title = analysis.get("title", meta.get("title", u))
    ai_tags = analysis.get("tags", [])

    folder_result = _ai_classify_folder(ai_title, ai_tags)

    return {
        "url": u,
        "meta": meta,
        "title": ai_title,
        "summary": analysis.get("summary", meta.get("description", "")),
        "tags": ai_tags,
        "image": meta.get("image", ""),
        "folder": folder_result.get("folder", ""),
        "folderCreated": folder_result.get("created", False),
    }


@app.delete("/api/docs/{doc_id}")
def api_delete_doc(doc_id: str):
    delete_doc(doc_id)
    try:
        db_service.delete_meta_document(doc_id)
    except Exception:
        pass
    rebuild = _safe_rebuild_semantic_graph_edges(context="delete_doc")
    return {"status": "ok", "rebuild": rebuild}


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
    rebuild = _safe_rebuild_semantic_graph_edges(context="restore_doc")
    return {"status": "ok", "rebuild": rebuild}


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
    limited = list(dict.fromkeys(req.tags))[:AUTO_TAG_LIMIT]
    new_normalized = _normalize_tag_list(limited)
    old_tags = _normalize_tag_list(get_tags_for_doc(doc_id))
    changed = set(new_normalized) ^ set(old_tags)
    if changed:
        db_service.invalidate_tag_similarity_cache(list(changed), AI_SIM_MODEL)
    set_tags_for_doc(doc_id, limited)
    rebuild = _safe_rebuild_semantic_graph_edges(context="set_tags")
    return {"status": "ok", "rebuild": rebuild}


@app.get("/api/tags/similarity")
def api_tag_similarity(tag: str, top_k: int = 8, min_docs: int = 1):
    """
    태그 컨텍스트 임베딩 기반 거리 분석.
    - 태그 벡터: 해당 태그 문서들의 본문 임베딩 평균(centroid)
    """
    if embed_model is None:
        return {
            "available": False,
            "baseTag": tag,
            "neighbors": [],
            "reason": "embedding model unavailable",
        }

    centroids, counts = _build_tag_centroids(min_docs=min_docs)
    if tag not in centroids:
        raise HTTPException(status_code=404, detail="Tag centroid not found")

    base_vec = centroids[tag]
    base_norm = float(np.linalg.norm(base_vec))
    if base_norm <= 0.0:
        return {
            "available": True,
            "baseTag": tag,
            "docCount": counts.get(tag, 0),
            "neighbors": [],
        }

    rows = []
    for other_tag, other_vec in centroids.items():
        if other_tag == tag:
            continue
        denom = base_norm * float(np.linalg.norm(other_vec)) + 1e-12
        sim = float(np.dot(base_vec, other_vec) / denom)
        rows.append(
            {
                "tag": other_tag,
                "similarity": round(sim, 6),
                "distance": round(1.0 - sim, 6),
                "docCount": counts.get(other_tag, 0),
            }
        )

    rows.sort(key=lambda x: x["similarity"], reverse=True)
    return {
        "available": True,
        "baseTag": tag,
        "docCount": counts.get(tag, 0),
        "candidateCount": len(centroids),
        "neighbors": rows[: max(1, min(100, top_k))],
    }


@app.get("/api/graph/edges")
def api_graph_edges(edge_type: str = TAG_EDGE_TYPE, min_weight: float = 0.0, limit: int = 2000):
    rows = db_service.list_graph_edges(
        edge_type=edge_type,
        min_weight=min_weight,
        limit=max(1, min(10000, limit)),
    )
    return {"edgeType": edge_type, "count": len(rows), "edges": rows}


@app.post("/api/graph/rebuild-semantic")
def api_rebuild_semantic_graph(
    engine: str = "auto",
    top_n: int = TAG_EDGE_TOP_N,
    k_per_node: int = TAG_EDGE_K,
    min_docs: int = 1,
):
    result = _safe_rebuild_semantic_graph_edges(
        engine=engine,
        top_n=max(1, min(10, top_n)),
        k_per_node=max(1, min(20, k_per_node)),
        min_docs=max(1, min(20, min_docs)),
        context="rebuild_api",
    )
    return result


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
