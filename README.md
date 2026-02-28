# My Graph

> **개인 연구자(1인)용 오프라인 우선 지식 관리 앱**
> Python + pywebview 기반 데스크톱 앱 | 로컬 AI 검색 내장

---

## 아키텍처

```
[React UI (Vite)]  ←REST→  [FastAPI 백엔드 :8000]  ←→  [Chroma DB (벡터)]
                                    │
                              [SQLite / meta.json]
                              [docs/*.md (문서 원본)]
[pywebview 데스크톱 셸]  → FastAPI 백그라운드 + Vite dist 로드
```

- **UI**: React + Vite (Tiptap 에디터, 3패널 문서 워크스페이스)
- **백엔드**: FastAPI (문서 CRUD, 태그, 폴더, 벡터 검색)
- **데이터**: 로컬 Markdown 파일 + `meta.json` + SQLite
- **벡터**: Chroma + sentence-transformers (로컬 임베딩)
- **데스크톱 셸**: pywebview (`python/desktop.py`)
- **아이콘**: lucide-react (이모지 대체)

---

## 실행 방법

### 방법 1 — 개발 모드 (가장 빠름)

**터미널 1** — Python 백엔드 실행:
```bash
cd python
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

**터미널 2** — 프론트엔드 개발 서버:
```bash
npm install
npm run dev
```
→ 브라우저: `http://localhost:5173`

추가 실행 스크립트:
```bash
npm run dev:backend   # python/.venv 기준 FastAPI 실행
npm run dev:frontend  # Vite 실행
```

### 방법 2 — 데스크톱 앱 (pywebview)

```bash
# 1. 프론트엔드 빌드
npm run build

# 2. 데스크톱 앱 실행 (백엔드 + webview 통합)
cd python
python desktop.py
```

### 방법 3 — 개발 중 데스크톱 모드

```bash
cd python
python desktop.py --dev   # Vite dev 서버(5173) + pywebview 연동
```

---

## 📂 폴더 구조

```
My_graph/
├── src/                     # React 프론트엔드
│   ├── adapters/
│   │   ├── apiAdapter.ts    # REST API 호출 (Electron → Python)
│   │   └── vectorAdapter.ts # Chroma 벡터 검색
│   ├── components/
│   │   ├── FolderPanel.tsx  # 폴더 패널 (220px)
│   │   ├── FilePanel.tsx    # 문서 목록/검색 패널 (320px)
│   │   └── Editor.tsx       # 에디터 패널 (가변)
│   └── store/useStore.ts    # Zustand 상태 관리
├── python/                  # Python 백엔드
│   ├── app.py               # FastAPI 앱 (REST + Chroma 엔드포인트)
│   ├── doc_service.py       # 문서 CRUD / meta.json / 폴더 관리
│   ├── db_service.py        # SQLite 메타/태그/그래프
│   ├── graph_service.py     # NetworkX 그래프 연산
│   ├── desktop.py           # pywebview 데스크톱 셸
│   ├── test_doc_service.py  # 단위 테스트
│   └── requirements.txt
├── electron/                # (레거시, 참조용 보존)
├── tasks/
│   ├── todo.md              # 작업 계획
│   └── lessons.md           # 레슨/피드백
├── PRD.md                   # 제품 요구사항
├── TECH_STACK.md            # 기술 스택
└── AGENTS.md                # AI 에이전트 가이드
```

---

## UI/UX 규칙

- 기본 워크스페이스는 3패널 레이아웃(폴더/문서목록/에디터)
- 메인 탭: 에디터 / 그래프 / 설정 (세그먼트 컨트롤 스타일)
- 문서 생성 기본 제목은 `새메모`
- 문서 생성 시 선택 폴더 자동 배치
- 검색은 입력 즉시 실행이 아니라, **검색 버튼 클릭 또는 Enter**에서 실행
- 검색 범위는 현재 폴더가 아닌 **전체 문서**
- 문서 목록 항목 우클릭으로 CRUD + 폴더 이동 지원
- 문서 목록에서 날짜 선택(달력) + 최신/오래된 순 정렬 지원
- **다중 선택** 후 일괄 삭제 지원
- 에디터에서 이미지/파일/XML/HTML 첨부 지원
  - 이미지: 붙여넣기, 드래그앤드롭, 파일선택, 보관함 삽입
  - 일반 파일: 링크 삽입
  - XML/HTML: object 개체 삽입
- URL/경로 붙여넣기
  - URL: 메타 정보(og:title, og:description, og:image) 조회 후 **메신저 스타일 링크 프리뷰** 삽입
  - 경로: 링크로 저장
  - 링크 클릭 시: URL → OS 기본 브라우저, 경로 → 탐색기 열기
- **휴지통**: 삭제 시 휴지통으로 이동, 삭제일별 그룹화, 복원/완전 삭제
- **자동 태그**: 본문 `#해시태그` 자동 추출 (설정에서 on/off)
- **타이포그래피 위계**: 설정 글꼴 크기에 따라 전체 UI 스케일링

---

## ⚙️ 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `MY_GRAPH_DATA_DIR` | `~/.config/my-graph/my-graph-data` | 문서/메타 저장 경로 |
| `MY_GRAPH_DB_PATH` | `~/.config/my-graph/metadata.db` | SQLite 경로 |
| `VITE_API_URL` | `http://127.0.0.1:8000` | 백엔드 URL |
| `OPENAI_API_KEY` | (없음) | AI 태그 추출용 OpenAI API 키 (`.env`에 설정) |

### .env 설정 (AI 기능)

프로젝트 루트에 `.env` 파일을 만들고 OpenAI API 키를 넣으세요:

```bash
cp .env.example .env
# .env 편집: OPENAI_API_KEY=sk-your-key-here
```

---

## 주요 API 추가 사항

- 백업/복구
  - `GET /api/backup/download`
  - `POST /api/backup/restore`
- 휴지통
  - `GET /api/trash` (목록)
  - `POST /api/trash/{id}/restore` (복원)
  - `DELETE /api/trash/{id}` (완전 삭제)
- URL 메타 (링크 프리뷰)
  - `GET /api/url-meta?url=...` (og:title, og:description, og:image)
- 첨부 파일
  - `POST /api/images`, `GET /api/images/{filename}`
  - `GET /api/images/library` (SQLite 이미지 메타 보관함)
  - `POST /api/files`, `GET /api/files/{filename}`
- 시스템 열기
  - `POST /api/system/open-path` (탐색기 열기)
  - `POST /api/system/open-external` (기본 브라우저 열기)
- 네트워크 / AI 상태
  - `GET /api/network/status` (인터넷 연결 여부)
  - `GET /api/ai/status` (인터넷 + API 키로 AI 사용 가능 여부)

---

## 운영 참고 (중요)

- 포트 `8000`에 오래된 FastAPI 프로세스가 남아 있으면 일부 신규 API가 반영되지 않을 수 있습니다.
- 대표 증상:
  - `/api/images/library` 404
  - 이미지 업로드 시 `There was an error parsing the body`
- 조치:
  - 백엔드 프로세스 정리 후 재시작
  - 임시로는 프론트에서 이미지 base64 임베드 폴백이 동작합니다.

---

## 🧪 테스트

```bash
cd python
python -m pytest test_doc_service.py -v
```

---

## 📋 주요 문서

| 문서 | 설명 |
|------|------|
| [`PRD.md`](PRD.md) | 제품 요구사항 |
| [`TECH_STACK.md`](TECH_STACK.md) | 기술 스택 |
| [`AGENTS.md`](AGENTS.md) | AI 에이전트 워크플로우 가이드 |
| [`AGENT_CONTEXT.md`](AGENT_CONTEXT.md) | 에이전트 핵심 컨텍스트 (항상 읽을 것) |
| [`tasks/todo.md`](tasks/todo.md) | 현재 작업 진행 상황 / 향후 작업 |
| [`tasks/lessons.md`](tasks/lessons.md) | 레슨/피드백 기록 |

---

## 📝 최근 변경 이력 (2026-02-28)

| 기능 | 설명 |
|------|------|
| 휴지통 | 삭제 시 휴지통 이동, 삭제일별 그룹화, 복원/완전 삭제 |
| 자동 태그 | 본문 `#해시태그` 자동 추출 (설정 on/off) |
| URL 링크 프리뷰 | URL 붙여넣기 시 og:meta 조회, 메신저 스타일 카드 |
| 탭 UI | 세그먼트 컨트롤 스타일 (Apple/IDE) |
| 타이포그래피 | 글꼴 크기 위계 변수, 설정 연동 스케일링 |
