# 기술 스택

## 앱 셸 (데스크톱)
- **pywebview** — Python 기반 크로스플랫폼 데스크톱 윈도우 (Electron 대체)
- `python/desktop.py` — FastAPI 백그라운드 스레드 + webview 통합 진입점

## 프론트엔드 (UI)
- React + TypeScript + Vite
- Zustand (상태 관리)
- Tiptap (블록 기반 에디터)
- lucide-react (아이콘 시스템)
- React Flow (노드 기반 그래프 뷰, 선택 기능)
- React Router

## 백엔드 (Python FastAPI)
- `python/app.py` — REST API 서버 (:8000)
- `python/doc_service.py` — 문서 CRUD / meta.json / 폴더/태그 관리
- `python/db_service.py` — SQLite 메타/태그/그래프 (sqlite3)
- `python/graph_service.py` — NetworkX 기반 그래프 연산

## 데이터 / 검색
- 문서 원본: `userData/my-graph-data/docs/*.md` (Markdown)
- 메타/폴더/태그: `userData/my-graph-data/meta.json`
- SQLite: `~/.config/my-graph/metadata.db` (메타/그래프 직렬화)
- 벡터 인덱스: Chroma DB (duckdb+parquet, 로컬)
- 임베딩 모델: sentence-transformers (`all-MiniLM-L6-v2`)
- 그래프: NetworkX (in-memory, SQLite 직렬화)

## 변환 / 내보내기
- markdown-it, turndown (Markdown ↔ HTML)
- html-to-text, xlsx (HTML→텍스트, Excel 내보내기)

## AI 확장
- openai (로컬 LLM 호환 API 클라이언트)
- axios (REST 호출)
- Chroma + sentence-transformers (로컬 임베딩 검색)

## 프론트엔드 → 백엔드 통신
- `src/adapters/apiAdapter.ts` — fetch 기반 REST 어댑터 (IPC 제거)
- `src/adapters/vectorAdapter.ts` — axios로 Chroma 검색 호출

## UI 레이아웃 정책
- 3패널 구조: `FolderPanel`(220px) + `FilePanel`(320px) + `Editor`(가변)
- 메인 탭: 세그먼트 컨트롤 (에디터/그래프/설정)
- 문서 생성: 기본 제목 `새메모`, 현재 선택 폴더 자동 배치
- 검색 트리거: 검색 버튼 클릭 또는 Enter 입력 시 실행
- 타이포그래피: `--font-size-xl/l/s/xs` (em), 설정 글꼴 크기 연동

## 추가 API (2026-02-28)
- 휴지통: `GET/POST/DELETE /api/trash`
- URL 메타: `GET /api/url-meta?url=...` (httpx로 og:meta 조회)

## 테스트
- pytest (Python 단위/통합 테스트)
- `python/test_doc_service.py` — doc_service 단위 테스트
