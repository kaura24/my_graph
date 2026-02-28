"""
doc_service.py — 문서 CRUD 및 meta.json 관리
Electron main.cjs의 IPC 핸들러를 Python으로 이식한 서비스 계층
"""
import json
import re
import os
import uuid
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone

# 기본 데이터 디렉토리 (환경변수로 오버라이드 가능)
_DEFAULT_DATA_DIR = os.path.join(
    os.environ.get("APPDATA") or os.path.join(Path.home(), ".config"),
    "my-graph",
    "my-graph-data",
)
DATA_DIR = Path(os.environ.get("MY_GRAPH_DATA_DIR", _DEFAULT_DATA_DIR))
DOCS_DIR = DATA_DIR / "docs"
TRASH_DIR = DATA_DIR / "trash"
META_PATH = DATA_DIR / "meta.json"

_EMPTY_META = {
    "documents": {},
    "documentTags": {},
    "folders": [],
    "documentFolders": {},
}


def _ensure_data_dir():
    """데이터 디렉토리와 meta.json이 존재하지 않으면 생성"""
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    TRASH_DIR.mkdir(parents=True, exist_ok=True)
    if not META_PATH.exists():
        META_PATH.write_text(json.dumps(_EMPTY_META, ensure_ascii=False, indent=2), encoding="utf-8")


def get_meta() -> dict:
    _ensure_data_dir()
    return json.loads(META_PATH.read_text(encoding="utf-8"))


def save_meta(meta: dict):
    _ensure_data_dir()
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def _safe_id(raw: str) -> str:
    """Electron main.cjs와 동일한 안전한 ID 생성 규칙"""
    base = Path(raw).stem if raw.endswith(".md") else raw
    safe = re.sub(r"[^a-zA-Z0-9가-힣_\-\s]", "", base).strip()
    safe = re.sub(r"\s+", "_", safe)
    return safe or "untitled"


def _new_doc_id(title: str) -> str:
    """
    신규 문서용 고유 ID 생성.
    - 제목 기반으로 가독성을 유지하되,
    - uuid 접미사를 붙여 동일 제목이라도 덮어쓰지 않도록 보장.
    """
    base = _safe_id(title or "untitled")
    return f"{base}_{uuid.uuid4().hex[:8]}"


# ─── 문서 CRUD ───────────────────────────────────

def list_docs(folder: Optional[str] = None) -> list[dict]:
    _ensure_data_dir()
    meta = get_meta()
    ids = [p.stem for p in DOCS_DIR.glob("*.md")]
    items = []
    doc_tags_map = meta.get("documentTags", {})
    for doc_id in ids:
        d = meta.get("documents", {}).get(doc_id, {})
        doc_folder = meta.get("documentFolders", {}).get(doc_id)
        items.append({
            "id": doc_id,
            "title": d.get("title", doc_id),
            "updatedAt": d.get("updatedAt", ""),
            "folder": doc_folder,
            "tags": doc_tags_map.get(doc_id, []),
        })
    items.sort(key=lambda x: x.get("updatedAt", ""), reverse=True)
    if folder:
        items = [it for it in items if it.get("folder") == folder]
    return items


def get_doc(doc_id: str) -> Optional[dict]:
    _ensure_data_dir()
    safe = _safe_id(doc_id)
    file_path = DOCS_DIR / f"{safe}.md"
    if not file_path.exists():
        return None
    content = file_path.read_text(encoding="utf-8")
    meta = get_meta()
    d = meta.get("documents", {}).get(safe, {})
    return {
        "id": safe,
        "title": d.get("title", safe),
        "content": content,
        "updatedAt": d.get("updatedAt", ""),
    }


def save_doc(doc_id: str, title: str, content: str) -> str:
    _ensure_data_dir()
    # 신규 생성(doc_id 없음)은 항상 고유 ID를 발급해 기존 문서 덮어쓰기를 방지
    safe = _safe_id(doc_id) if doc_id else _new_doc_id(title)
    file_path = DOCS_DIR / f"{safe}.md"
    file_path.write_text(content or "", encoding="utf-8")

    meta = get_meta()
    from datetime import datetime, timezone
    existing = meta.get("documents", {}).get(safe, {})
    # 빈 제목으로 저장 시 기존 제목 유지 (ID가 표시되는 현상 방지)
    effective_title = (title or "").strip() or existing.get("title") or safe
    meta.setdefault("documents", {})[safe] = {
        "title": effective_title,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    meta.setdefault("documentFolders", {}).setdefault(safe, None)
    meta.setdefault("documentTags", {}).setdefault(safe, [])
    save_meta(meta)
    return safe


def delete_doc(doc_id: str):
    """문서를 휴지통으로 이동 (완전 삭제 아님)"""
    _ensure_data_dir()
    safe = _safe_id(doc_id)
    file_path = DOCS_DIR / f"{safe}.md"
    if not file_path.exists():
        meta = get_meta()
        meta.get("documents", {}).pop(safe, None)
        meta.get("documentTags", {}).pop(safe, None)
        meta.get("documentFolders", {}).pop(safe, None)
        save_meta(meta)
        return
    meta = get_meta()
    doc_meta = meta.get("documents", {}).get(safe, {})
    tags = meta.get("documentTags", {}).get(safe, [])
    folder = meta.get("documentFolders", {}).get(safe)
    content = file_path.read_text(encoding="utf-8")
    trash_meta = {
        "id": safe,
        "title": doc_meta.get("title", safe),
        "folder": folder,
        "tags": tags,
        "updatedAt": doc_meta.get("updatedAt", ""),
        "deletedAt": datetime.now(timezone.utc).isoformat(),
    }
    trash_file = TRASH_DIR / f"{safe}.md"
    trash_meta_file = TRASH_DIR / f"{safe}.meta.json"
    trash_file.write_text(content, encoding="utf-8")
    trash_meta_file.write_text(json.dumps(trash_meta, ensure_ascii=False, indent=2), encoding="utf-8")
    file_path.unlink()
    meta.get("documents", {}).pop(safe, None)
    meta.get("documentTags", {}).pop(safe, None)
    meta.get("documentFolders", {}).pop(safe, None)
    save_meta(meta)


def list_trash() -> list[dict]:
    """휴지통 문서 목록"""
    _ensure_data_dir()
    items = []
    for meta_path in TRASH_DIR.glob("*.meta.json"):
        try:
            d = json.loads(meta_path.read_text(encoding="utf-8"))
            items.append(d)
        except Exception:
            pass
    items.sort(key=lambda x: x.get("deletedAt", ""), reverse=True)
    return items


def restore_from_trash(doc_id: str) -> bool:
    """휴지통에서 문서 복원"""
    _ensure_data_dir()
    safe = _safe_id(doc_id)
    trash_file = TRASH_DIR / f"{safe}.md"
    trash_meta_file = TRASH_DIR / f"{safe}.meta.json"
    if not trash_file.exists() or not trash_meta_file.exists():
        return False
    meta = get_meta()
    trash_meta = json.loads(trash_meta_file.read_text(encoding="utf-8"))
    content = trash_file.read_text(encoding="utf-8")
    meta.setdefault("documents", {})[safe] = {
        "title": trash_meta.get("title", safe),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    meta.setdefault("documentFolders", {})[safe] = trash_meta.get("folder")
    meta.setdefault("documentTags", {})[safe] = trash_meta.get("tags", [])
    save_meta(meta)
    dest = DOCS_DIR / f"{safe}.md"
    dest.write_text(content, encoding="utf-8")
    trash_file.unlink()
    trash_meta_file.unlink()
    return True


def delete_from_trash_permanently(doc_id: str) -> bool:
    """휴지통에서 문서 완전 삭제"""
    _ensure_data_dir()
    safe = _safe_id(doc_id)
    trash_file = TRASH_DIR / f"{safe}.md"
    trash_meta_file = TRASH_DIR / f"{safe}.meta.json"
    if trash_file.exists():
        trash_file.unlink()
    if trash_meta_file.exists():
        trash_meta_file.unlink()
    return True


# ─── 태그 ────────────────────────────────────────

def extract_hashtags(html_content: str) -> list[str]:
    """본문에서 #해시태그 추출 (HTML 태그 제거 후)"""
    if not html_content:
        return []
    text = re.sub(r"<[^>]+>", " ", html_content)
    matches = re.findall(r"#([a-zA-Z0-9가-힣_]+)", text)
    seen: set[str] = set()
    result: list[str] = []
    for m in matches:
        tag = m.strip()
        if tag and tag.lower() not in seen:
            seen.add(tag.lower())
            result.append(tag)
    return result


def get_tags_for_doc(doc_id: str) -> list[str]:
    meta = get_meta()
    return meta.get("documentTags", {}).get(doc_id, [])


def set_tags_for_doc(doc_id: str, tags: list[str]):
    meta = get_meta()
    meta.setdefault("documentTags", {})[doc_id] = tags
    save_meta(meta)


def get_all_tags() -> list[str]:
    meta = get_meta()
    tag_set: set[str] = set()
    for tags in meta.get("documentTags", {}).values():
        tag_set.update(tags)
    return sorted(tag_set)


# ─── 폴더 (논리적 카테고리) ───────────────────────

def list_folders() -> list[str]:
    meta = get_meta()
    return meta.get("folders", [])


def create_folder(name: str) -> list[str]:
    meta = get_meta()
    folders = meta.setdefault("folders", [])
    if name not in folders:
        folders.append(name)
    save_meta(meta)
    return folders


def rename_folder(old_name: str, new_name: str) -> list[str]:
    meta = get_meta()
    folders = meta.setdefault("folders", [])
    if old_name in folders:
        idx = folders.index(old_name)
        folders[idx] = new_name
    doc_folders = meta.setdefault("documentFolders", {})
    for k in doc_folders:
        if doc_folders[k] == old_name:
            doc_folders[k] = new_name
    save_meta(meta)
    return folders


def delete_folder(name: str) -> list[str]:
    meta = get_meta()
    doc_folders = meta.setdefault("documentFolders", {})
    # 폴더 안의 모든 문서 삭제
    for doc_id in list(doc_folders.keys()):
        if doc_folders.get(doc_id) == name:
            delete_doc(doc_id)
    meta["folders"] = [f for f in meta.get("folders", []) if f != name]
    save_meta(meta)
    return meta["folders"]


def set_doc_folder(doc_id: str, folder: Optional[str]):
    meta = get_meta()
    meta.setdefault("documentFolders", {})[doc_id] = folder
    save_meta(meta)


# ─── 이미지 저장 ─────────────────────────────────

IMAGES_DIR = DATA_DIR / "images"
FILES_DIR = DATA_DIR / "files"


def save_image(filename: str, data: bytes) -> str:
    """이미지를 저장하고 고유 파일명을 반환"""
    import uuid
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(filename).suffix or ".png"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    (IMAGES_DIR / unique_name).write_bytes(data)
    return unique_name


def get_image_path(filename: str) -> Optional[Path]:
    """이미지 파일 경로를 반환 (없으면 None)"""
    p = IMAGES_DIR / filename
    return p if p.exists() else None


def save_file(filename: str, data: bytes) -> str:
    """일반 파일을 저장하고 고유 파일명을 반환"""
    import uuid
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(filename).suffix
    unique_name = f"{uuid.uuid4().hex}{ext}" if ext else uuid.uuid4().hex
    (FILES_DIR / unique_name).write_bytes(data)
    return unique_name


def get_file_path(filename: str) -> Optional[Path]:
    """일반 파일 경로를 반환 (없으면 None)"""
    p = FILES_DIR / filename
    return p if p.exists() else None
