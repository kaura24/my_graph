"""
test_doc_service.py — doc_service 단위 테스트
임시 디렉토리를 사용하므로 실 데이터에 영향 없음.
"""
import os
import pytest
from pathlib import Path


@pytest.fixture(autouse=True)
def tmp_data_dir(tmp_path, monkeypatch):
    """각 테스트마다 독립적인 임시 데이터 디렉토리 사용"""
    monkeypatch.setenv("MY_GRAPH_DATA_DIR", str(tmp_path / "data"))
    # doc_service 모듈을 재임포트하여 경로 갱신
    import importlib
    import doc_service
    importlib.reload(doc_service)
    return tmp_path


def test_list_empty():
    import doc_service
    assert doc_service.list_docs() == []


def test_save_and_get():
    import doc_service
    doc_id = doc_service.save_doc("", "테스트 문서", "내용입니다")
    assert doc_id  # 비어 있지 않아야 함

    doc = doc_service.get_doc(doc_id)
    assert doc is not None
    assert doc["title"] == "테스트 문서"
    assert doc["content"] == "내용입니다"


def test_list_after_save():
    import doc_service
    doc_service.save_doc("", "문서A", "A 내용")
    doc_service.save_doc("", "문서B", "B 내용")
    docs = doc_service.list_docs()
    assert len(docs) == 2
    titles = {d["title"] for d in docs}
    assert "문서A" in titles
    assert "문서B" in titles


def test_delete():
    import doc_service
    doc_id = doc_service.save_doc("", "삭제할 문서", "내용")
    doc_service.delete_doc(doc_id)
    assert doc_service.get_doc(doc_id) is None
    assert len(doc_service.list_docs()) == 0


def test_tags():
    import doc_service
    doc_id = doc_service.save_doc("", "태그 문서", "내용")
    assert doc_service.get_tags_for_doc(doc_id) == []

    doc_service.set_tags_for_doc(doc_id, ["AI", "Python"])
    assert set(doc_service.get_tags_for_doc(doc_id)) == {"AI", "Python"}

    all_tags = doc_service.get_all_tags()
    assert "AI" in all_tags and "Python" in all_tags


def test_folders():
    import doc_service
    assert doc_service.list_folders() == []

    doc_service.create_folder("연구")
    assert "연구" in doc_service.list_folders()

    doc_service.rename_folder("연구", "Research")
    assert "Research" in doc_service.list_folders()
    assert "연구" not in doc_service.list_folders()

    doc_service.delete_folder("Research")
    assert doc_service.list_folders() == []


def test_doc_folder_assignment():
    import doc_service
    doc_service.create_folder("카테고리1")
    doc_id = doc_service.save_doc("", "분류 문서", "내용")
    doc_service.set_doc_folder(doc_id, "카테고리1")

    filtered = doc_service.list_docs(folder="카테고리1")
    assert any(d["id"] == doc_id for d in filtered)

    # 다른 폴더로 필터링하면 안 나와야 함
    filtered2 = doc_service.list_docs(folder="없는폴더")
    assert all(d["id"] != doc_id for d in filtered2)
