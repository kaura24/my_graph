# Agent Context — 핵심 컨텍스트 (항상 읽을 것)

이 파일은 에이전트가 작업을 시작하기 전에 반드시 읽어야 하는 프로젝트 핵심 컨텍스트입니다.

## 현재 아키텍처 (v0.2 — Python 리팩토링 완료)
- **데스크톱 셸**: pywebview (`python/desktop.py`) — Electron 완전 제거
- **백엔드**: FastAPI (`python/app.py`) — REST API (:8000)
- **서비스 계층**: `doc_service.py`, `db_service.py`, `graph_service.py`
- **프론트엔드**: React + Vite (Electron IPC 제거 → REST fetch 방식)
- **API 어댑터**: `src/adapters/apiAdapter.ts` — window.api 대신 REST 호출

## 최근 변경 요약 (세션 축약)
- 메인 UI는 3패널(폴더/문서목록/메인) + 메인 탭(`에디터`/`그래프`/`설정`) 구조
- **탭 바**: 세그먼트 컨트롤 스타일 (Apple/IDE 스타일)
- 폴더 패널 하단에 시스템 버튼 추가: `백업`, `복구`, `설정`
- 문서 생성은 기본 제목 `새메모`, 생성 시 고유 ID(`memo_*`)로 저장되도록 수정
- 아이콘은 `lucide-react`로 통일 (이모지 기반 버튼 대체)
- `run_mygraph.bat` 추가: 패키징 없이 로컬 실행 가능
- 문서 목록(`FilePanel`) 우클릭 컨텍스트 메뉴 추가:
  - `새 메모 만들기`, `열기`, `제목 변경`, `삭제`, `미분류/폴더 이동`
- **다중 선택** 후 일괄 삭제 지원
- 문서 목록에 날짜 기반 기능 추가:
  - `input[type=date]`로 일자 필터
  - `최신순/오래된순` 정렬
- 에디터 첨부 기능 확장:
  - 이미지: 붙여넣기/드롭/파일선택/보관함 삽입 지원
  - 일반 파일: 링크 삽입
  - XML/HTML: 개체(object)로 삽입
- URL/경로 붙여넣기:
  - **URL**: `GET /api/url-meta`로 og:meta 조회 후 **메신저 스타일 링크 프리뷰**(LinkPreview 노드) 삽입
  - 경로: 링크로 저장
  - 링크 클릭 시: URL → 기본 브라우저, 경로 → 탐색기 열기
- 이미지 메타 DB 연동:
  - SQLite `image_assets` 테이블 저장
  - 이미지 보관함 API/UI로 재삽입 가능
- 업로드 폴백:
  - 이미지 업로드 API 실패 시 base64 임베드로 문서 저장 유지

## 휴지통 (2026-02-28)
- 삭제 시 완전 삭제 대신 `DATA_DIR/trash`로 이동
- `list_trash`, `restore_from_trash`, `delete_from_trash_permanently` (doc_service.py)
- API: `GET /api/trash`, `POST /api/trash/{id}/restore`, `DELETE /api/trash/{id}`
- UI: FolderPanel에 휴지통 항목, FilePanel에서 삭제일별 그룹화 표시, 복원/완전 삭제 버튼

## 자동 태그 (2026-02-28)
- 본문 `#해시태그` 자동 추출 (`extract_hashtags` in doc_service.py)
- 저장 시 `auto_tag: true`이면 추출된 태그를 기존 태그와 병합
- 설정: `autoTagFromHashtags` (기본 true)

## 타이포그래피 위계 (2026-02-28)
- CSS 변수: `--font-size-xl`, `--font-size-l`, `--font-size-s`, `--font-size-xs` (em 기반)
- 설정 글꼴 크기(`settings.fontSize`)에 따라 전체 UI 스케일링
- side-panel, editor-area에 `font-size: var(--font-size)` 명시

## 최근 안정화 작업 (2026-02-28)
- 이미지 업로드/저장 신뢰성 개선:
  - 1차 업로드 실패 시 placeholder 대신 **즉시 base64 삽입 + 문서 저장 우선**
  - 이후 백그라운드 재시도(지연 간격 기반)로 서버 URL 치환 저장 시도
  - legacy placeholder 텍스트(`이미지 업로드 중… img-...`) 자동 정리 로직 추가
- 붙여넣기 UX 개선:
  - 클립보드 `file.type`이 비어도 확장자 기반으로 이미지 판별
  - `clipboardData.files` 우선 처리로 Windows 파일 붙여넣기 호환성 강화
  - 이미지+텍스트 동시 붙여넣기 시 텍스트가 유실되지 않도록 동시 삽입 처리
  - 문자 단위 줄바꿈(OCR/웹 복사) 정규화로 본문 UI 깨짐 완화
- 에디터 렌더 안정화:
  - 본문 `p`/`img`/`ProseMirror` CSS 보강(`pre-wrap`, wrap/auto-height)
  - 이미지와 텍스트 혼합 문서에서 레이아웃 깨짐 최소화
- 사용자 피드백 시스템 추가:
  - `src/utils/feedback.ts`, `src/components/FeedbackToasts.tsx`
  - 주요 액션(저장/업로드/백업/복구/이동/오류)에 토스트 피드백 연결
- 문서 제목 변경 안정화:
  - `FilePanel` 우클릭 제목 변경: `prompt` → 인라인 편집(Enter/Escape/blur)
  - 에디터 상단 제목 입력: 문서 전환 시점만 동기화하도록 조정(입력 덮어쓰기 방지)
  - 제목 변경도 자동 저장 조건에 포함, Enter/blur 저장 보강
- UI/표시 업데이트:
  - 탭 우측 상단 버전 배지 추가: `V 1.0` (저채도 KB YELLO 톤)
  - 이미지 버튼 UX: 기본 버튼은 파일 불러오기, 드롭다운에서 클립보드/보관함

## 현재 확인 포인트 (중요)
- `python/app.py`에 백업 API 추가됨:
  - `GET /api/backup/download` (zip 다운로드)
  - `POST /api/backup/restore` (zip 복구)
- `src/adapters/apiAdapter.ts` 및 `FolderPanel`에서 백업/복구 버튼 연동 완료
- 단, 로컬 8000 포트에 이전 프로세스가 남아 있으면 신규 API가 반영되지 않을 수 있음
  - 증상: `/api/backup/download` 404
  - 조치: 백엔드 프로세스 정리 후 재시작 필요
- 최근 API 추가 목록(핵심):
  - `GET /api/trash`, `POST /api/trash/{id}/restore`, `DELETE /api/trash/{id}`
  - `GET /api/url-meta?url=...` (URL og:meta 조회)
  - `POST /api/files`, `GET /api/files/{filename}`
  - `GET /api/images/library`
  - `POST /api/system/open-path`
  - `POST /api/system/open-external`
- 운영 이슈:
  - 8000 포트 중복 리스너가 생기면 `/api/images`가 `400 There was an error parsing the body`로 실패할 수 있음
  - 임시 우회: 프론트에서 base64 폴백 저장
  - 근본 조치: 중복 백엔드 프로세스 정리 후 재시작
  - 추가 우회(코드 반영): `apiAdapter.ts`에서 백엔드 후보(기본 8000 + 8011)의 `openapi.json`을 점검해
    필수 라우트(`/api/docs`, `/api/images`, `/api/files`, `/api/system/open-path`, `/api/system/open-external`)가
    모두 있는 서버를 자동 선택
    - 목적: 포트 충돌 시 구버전 백엔드로 붙는 문제 최소화

### 문제 가능성 기록 (재발 주의)
- **근본 원인(확정)**: 백엔드가 여러 개 중복 실행되어 서로 다른 버전이 `:8000`을 번갈아 점유함.
- **직접 증상**:
  - 이미지 업로드 `POST /api/images` → `400 There was an error parsing the body`
  - 파일 업로드 `POST /api/files` → `404` 또는 라우트 미노출
  - 같은 세션에서도 업로드 성공/실패가 간헐적으로 바뀌는 현상
- **확인 포인트**:
  - `openapi.json`에 `/api/files`, `/api/system/open-path`, `/api/system/open-external`이 보이는지 확인
  - 포트 리스너가 단일 프로세스인지 확인
- **표준 조치**:
  1) 중복 uvicorn 프로세스 정리
  2) 단일 백엔드만 재기동
  3) 필요 시 8011 백업 포트 사용 + 프론트 자동 선택 로직으로 정상 서버 고정

## 폴더/데이터 정책
- 폴더는 **논리적 카테고리** (물리적 디렉토리 아님)
- 문서 원본: `userData/my-graph-data/docs/*.md`
- 메타(태그, 폴더): `userData/my-graph-data/meta.json`
- SQLite(선택적): `~/.config/my-graph/metadata.db`
- Chroma DB: `python/chroma_db/`
- 첨부 파일:
  - 이미지: `userData/my-graph-data/images/`
  - 일반 파일: `userData/my-graph-data/files/`

## UI / 레이아웃
- 3패널 고정: 폴더(220px) / 문서 목록(320px) / 에디터(가변)
- 폴더 패널: 폴더 선택/생성/이름 변경/삭제 + 문서 수 표시
- 문서 목록 패널: 문서 선택, 검색(버튼/Enter 트리거), 태그 기반 필터, 날짜 필터, 정렬
- 에디터 패널: 제목/본문/태그/저장/삭제, 이미지 메뉴, 파일 첨부, 이미지 보관함
- 아이콘은 이모지 대신 `lucide-react` 기준으로 유지

## 실행 방법

### 개발 (권장)
```bash
# 터미널 1: 백엔드
cd python && uvicorn app:app --host 127.0.0.1 --port 8000 --reload

# 터미널 2: 프론트엔드
npm run dev
```

### 포트 충돌 대응 실행안 (권장)
```bash
# 8000 충돌/구버전 응답 의심 시
# 1) 프로젝트 백엔드를 8011로 기동
cd python && .venv/Scripts/python.exe -m uvicorn app:app --host 127.0.0.1 --port 8011

# 2) 프론트는 그대로 npm run dev
#    (apiAdapter가 openapi 기반으로 정상 백엔드를 자동 선택)
```

### 업로드 장애 진단 빠른 체크
- `http://127.0.0.1:8000/openapi.json`, `http://127.0.0.1:8011/openapi.json` 비교
- 필수 라우트 존재 확인:
  - `/api/images`, `/api/files`, `/api/system/open-path`, `/api/system/open-external`
- `POST /api/images`가 `400 There was an error parsing the body`면
  - 현재 붙은 백엔드가 구버전/충돌 가능성 높음
  - 백엔드 단일화(중복 프로세스 정리) 후 재기동 필요

### 프론트엔드 UX 정책
- 문서 생성 기본 제목은 `새메모`
- 생성 시 현재 선택 폴더가 있으면 자동 배치
- 검색 실행 시 범위는 항상 전체 문서
- 검색은 입력 즉시가 아닌 `검색 버튼`/`Enter`에서만 실행
- 이미지 삽입은 붙여넣기/드롭/파일선택/보관함 경로를 모두 지원
- URL/경로 붙여넣기는 에디터에 링크로 저장; 링크 클릭 시 각각 브라우저/탐색기 열기

### 데스크톱 앱
```bash
npm run build        # 프론트엔드 빌드
cd python
python desktop.py    # pywebview 앱 실행
# 또는
python desktop.py --dev  # Vite dev 서버 연동
```

## 작업 전 체크리스트 (에이전트용)
1. 이 파일(`AGENT_CONTEXT.md`)을 읽었는가?
2. `tasks/todo.md`에 계획을 작성했는가?
3. 변경이 `doc_service.py`의 데이터 모델/meta.json 정책에 영향을 주는가?
4. REST API 엔드포인트 변경 시 `apiAdapter.ts`도 함께 수정했는가?
5. 검증(테스트/API 호출/UI 흐름) 계획을 `tasks/todo.md`에 기술했는가?

## 데이터 무결성 우선 규칙
- `doc_service.py`의 함수는 항상 `_ensure_data_dir()` 호출 후 파일 접근
- 폴더 삭제 시 문서는 삭제하지 않고 `folder: null`로만 업데이트
- `meta.json` 쓰기는 항상 `save_meta()` 경유 (직접 파일 쓰기 금지)

## 기록 장소
- 작업 계획: `tasks/todo.md`
- 레슨/피드백: `tasks/lessons.md`
- 아키텍처 결정 메모: `docs/architecture.md` (필요 시 생성)

## 향후 작업 (tasks/todo.md 참조)
- 로컬 LLM (Ollama 등) API 연동 — 문서 자동 요약/키워드 추출
- ChromaDB + Sentence-Transformers 시맨틱 검색 고도화
- 문서 내보내기/가져오기 (Markdown, HTML, Excel 일괄)
- React Flow 그래프 뷰 고도화 (노드 가중치, 레이아웃)
