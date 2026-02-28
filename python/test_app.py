import os
import tempfile
import pytest
from fastapi.testclient import TestClient

# DB 및 환경변수 오버라이드 (가짜 데이터 경로 사용)
temp_dir = tempfile.TemporaryDirectory()
os.environ["MY_GRAPH_DATA_DIR"] = temp_dir.name
os.environ["MY_GRAPH_DB_PATH"] = os.path.join(temp_dir.name, "test_metadata.db")

from app import app
from doc_service import doc_service
from db_service import get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_teardown():
    # 매 테스트마다 데이터 초기화
    doc_service.meta_cache = {"folders": [], "tags": {}}
    doc_service._save_meta()
    
    with get_db() as conn:
        conn.execute("DELETE FROM document_tags")
        conn.execute("DELETE FROM graph_edges")
        conn.execute("DELETE FROM graph_nodes")
        conn.execute("DELETE FROM documents")
        conn.commit()
    yield

def test_docs_crud():
    # 1. 생성
    res = client.post("/api/docs", json={"title": "Test Doc", "content": "Hello World"})
    assert res.status_code == 200
    doc_id = res.json()["id"]
    assert doc_id is not None

    # 2. 목록 조회
    res = client.get("/api/docs")
    assert res.status_code == 200
    docs = res.json()
    assert len(docs) == 1
    assert docs[0]["title"] == "Test Doc"

    # 3. 상세 조회
    res = client.get(f"/api/docs/{doc_id}")
    assert res.status_code == 200
    doc = res.json()
    assert doc["content"] == "Hello World"

    # 4. 삭제
    res = client.delete(f"/api/docs/{doc_id}")
    assert res.status_code == 204

    # 5. 삭제 후 목록 조회
    res = client.get("/api/docs")
    assert len(res.json()) == 0

def test_tags_api():
    # 문서 생성
    res = client.post("/api/docs", json={"title": "Tag Test", "content": "..."})
    doc_id = res.json()["id"]

    # 태그 업데이트
    res = client.put(f"/api/docs/{doc_id}/tags", json={"tags": ["python", "fastapi"]})
    assert res.status_code == 204

    # 태그 조회 (문서별)
    res = client.get(f"/api/docs/{doc_id}/tags")
    assert res.status_code == 200
    assert set(res.json()) == {"python", "fastapi"}

    # 전체 태그 조회
    res = client.get("/api/tags")
    assert res.status_code == 200
    assert set(res.json()) == {"python", "fastapi"}

def test_folders_api():
    # 폴더 생성
    res = client.post("/api/folders", json={"name": "Projects"})
    assert res.status_code == 200
    assert "Projects" in res.json()

    # 폴더 이름 변경
    res = client.put("/api/folders/Projects", json={"newName": "Work"})
    assert res.status_code == 200
    assert "Work" in res.json()
    assert "Projects" not in res.json()

    # 폴더 삭제
    res = client.delete("/api/folders/Work")
    assert res.status_code == 200
    assert "Work" not in res.json()
