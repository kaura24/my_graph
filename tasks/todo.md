# To-Do List (Python Full Refactoring)

## 1. Planning (기획 및 아키텍처 설계)
- [x] 파이썬 리팩토링 범위 및 UI 프레임워크 결정
- [x] 데이터베이스(SQLite, 로컬 파일 시스템) 마이그레이션 전략 수립
- [x] 패키지 구조 설계 및 의존성 정의

## 2. Backend & Data Layer (데이터/백엔드 로직 재구현)
- [x] 메타 문서 모델 및 파일 I/O 파이썬 클래스 구현 (`doc_service.py`)
- [x] SQLite 메타데이터/그래프 관계 테이블 관리용 Python 모듈 (`db_service.py`)
- [x] Graph 연산, 로컬 검색 및 Chroma DB API 연동 파이썬 모듈화 (`graph_service.py`, `app.py`)

## 3. UI Layer (프론트엔드/데스크톱 UI 재구현)
- [x] 데스크톱 앱 셸 및 프레임워크 적용 (`desktop.py`, `pywebview`)
- [x] Frontend API 어댑터 교체 (`apiAdapter.ts` REST fetch)
- [x] 문서 작성(블록 기반 에디터 Tiptap) 통합 및 구현 (`Editor.tsx`)
- [x] 문서 그래프 뷰(React Flow 노드 기반 UI) 통합 및 구현 (`GraphView.tsx`)
- [x] 검색 UI (키워드/태그/하이브리드) 구현 (`Sidebar.tsx` 검색창)

## 4. Integration & Testing (통합 및 테스트)
- [x] 단위 테스트 작성 (`test_doc_service.py`)
- [x] FastAPI 엔드포인트 통합 테스트 (`test_app.py`)
- [x] PyInstaller를 이용한 독립 실행형 데스크톱 앱 빌드 설정 (`python/build_desktop.py`, `npm run build:desktop`)

## 5. Advanced Features & AI Integration (심화 기능 및 AI 연동 - NEXT PHASE)
- [ ] 로컬 LLM (Ollama 등) API 연동 — 문서 자동 요약 및 키워드 추출
- [ ] ChromaDB + Sentence-Transformers 연동 — 문단 단위 하이브리드(시맨틱) 검색 고도화
- [ ] 문서 내보내기/가져오기 기능 (Markdown, HTML, Excel 일괄 추출)
- [ ] React Flow 그래프 뷰 고도화 (노드 크기 가중치, 강제 방향 레이아웃)

## Progress Summary (2026-02-28)
- 기존 Electron → Python 데스크톱 전환(1~4번 마일스톤) **완벽하게 달성 완료!** ✅
- 다음 목표는 제품 요구사항(PRD)에 정의된 5단계 심화 기능(AI, 시맨틱 검색, 그래프 고도화) 파이프라인 개발입니다.

## UI Alignment Task (2026-02-28)
- [x] PyQt 3패널 구조에 맞게 프론트 레이아웃 정렬 (폴더/문서목록/에디터)
- [x] 패널 폭 정책 반영 (폴더 220px, 문서목록 320px, 에디터 가변)
- [x] 문서 생성 규칙 정리 (기본 제목 `새메모`, 선택 폴더 자동 배치)
- [x] 검색 트리거 정책 반영 (검색 버튼/Enter 시 실행, 검색 시 전체 문서 대상)

## Image Paste Upload Fix (2026-02-28)
- [x] 붙여넣기/드롭/파일선택 이미지 판별 로직 점검
- [x] `file.type` 비어있는 경우 확장자 기반 이미지 판별 추가
- [x] 붙여넣기 핸들러에서 `clipboardData.files` 우선 처리
- [x] 빌드 검증 (`npm run build`)

## 휴지통 (2026-02-28)
- [x] 백엔드: delete_doc → trash 이동, list_trash, restore, permanent delete
- [x] API: GET/POST/DELETE /api/trash
- [x] 프론트: FolderPanel 휴지통 항목, FilePanel 삭제일별 그룹화, 복원/완전 삭제 UI

## UI 개선 (2026-02-28)
- [x] 탭 바: 세그먼트 컨트롤 스타일 (Apple/IDE)
- [x] 타이포그래피 위계: --font-size-xl/l/s/xs, 전체 UI 적용
- [x] 폴더/문서 패널: 설정 글꼴 크기에 맞춰 스케일링

## 자동 태그 (2026-02-28)
- [x] extract_hashtags (doc_service.py)
- [x] 저장 시 auto_tag 옵션으로 #해시태그 자동 추출
- [x] 설정: autoTagFromHashtags 토글

## URL 링크 프리뷰 (2026-02-28)
- [x] GET /api/url-meta (og:title, og:description, og:image)
- [x] Editor: LinkPreview 노드, URL 붙여넣기 시 메신저 스타일 카드 삽입

---

## 향후 작업 (NEXT)

### 우선순위 높음
- [ ] 로컬 LLM (Ollama 등) API 연동 — 문서 자동 요약/키워드 추출
- [ ] ChromaDB + Sentence-Transformers 시맨틱 검색 고도화

### 우선순위 중간
- [ ] 문서 내보내기/가져오기 (Markdown, HTML, Excel 일괄)
- [ ] React Flow 그래프 뷰 고도화 (노드 가중치, 강제 방향 레이아웃)

### 우선순위 낮음
- [ ] 에디터 문자 수 제한 옵션 (CharacterCount)
- [ ] 휴지통 자동 비우기 (N일 후)
