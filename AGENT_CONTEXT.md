# Agent Context — 핵심 컨텍스트 (항상 읽을 것)

이 파일은 에이전트가 작업을 시작하기 전에 반드시 읽어야 하는 프로젝트 핵심 컨텍스트입니다.

## 현재 아키텍처 (v0.2 — Python 리팩토링 완료)
- **데스크톱 셸**: pywebview (`python/desktop.py`) — Electron 완전 제거
- **백엔드**: FastAPI (`python/app.py`) — REST API (:8000)
- **서비스 계층**: `doc_service.py`, `db_service.py`, `graph_service.py`
- **프론트엔드**: React + Vite (Electron IPC 제거 → REST fetch 방식)
- **API 어댑터**: `src/adapters/apiAdapter.ts` — window.api 대신 REST 호출

## Git 저장소 (2026-02-28)
- 저장소 초기화 및 첫 커밋 완료
- 원격: `origin` → `https://github.com/kaura24/my_graph.git`
- 브랜치: `master` (origin/master 추적)
- 작성자: `my_graph <kaura24@gmail.com>`
- `.gitignore`: `node_modules/`, `dist/`, `python/.venv/`, `python/build/`, `python/chroma_db/`, 디버그 산출물 등

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
- NLP 명사 추출: kiwipiepy 형태소 분석으로 명사/고유명사 추출 (`extract_keywords_nlp`)
- AI 태그 추출: OpenAI API로 키워드 추출 (인터넷 + `.env`의 `OPENAI_API_KEY` 필요)
- 저장 시 `auto_tag` / `auto_tag_nlp` / `auto_tag_ai` true이면 추출된 태그를 기존 태그와 병합
- 설정: `autoTagFromHashtags`, `autoTagFromNLP`, `autoTagFromAI` (AI는 인터넷 연결 시에만 토글 표시)

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

## API 연결 아키텍처 (필수 규칙 — 2026-02-28 확정)

> **이 연결 방식은 모든 프론트-백 통신의 기준이며, 변경 시 반드시 이 섹션을 갱신할 것.**

### 핵심 원칙
1. **단일 진입점**: 모든 REST 호출은 `apiAdapter.ts`의 `getBase()`를 경유한다.
2. **8000 항상 최우선**: `.env` 값에 무관하게 `CANONICAL_BASE=http://127.0.0.1:8000`이 후보 1순위다.
3. **경량 헬스체크**: `/api/docs`에 3초 타임아웃 ping (`isAlive()`). openapi.json 사용 금지.
4. **재시도 폴링**: `App.tsx`에서 최대 20회, 2~8초 백오프로 연결 재시도.
5. **캐시 무효화 가능**: 연결 실패 시 `invalidateBase()`로 캐시를 날리고 다시 후보를 순회.

### 후보 순회 순서
```
[8000 (CANONICAL)] → [.env VITE_API_URL 값] → [8011 (FALLBACK)]
```
- `.env`에 8000을 적어도, 중복 없이 1번만 시도됨 (`new Set` 사용)

### 관련 파일 및 역할

| 파일 | 역할 |
|------|------|
| `.env` → `VITE_API_URL` | 환경별 기본 백엔드 주소. **반드시 실제 백엔드 포트와 일치시킬 것** |
| `src/adapters/apiAdapter.ts` | `getBase()`, `isAlive()`, `invalidateBase()` export. 모든 `req()` 호출이 `getBase()` 사용 |
| `src/App.tsx` | 마운트 시 `isAlive()` + 재시도 폴링 → `backendOk` 상태 관리 |

### 연결 흐름 다이어그램
```
App.tsx mount
  → getBase() → isAlive(8000) → OK? → backendOk=true, 사용
                              → FAIL → isAlive(.env값) → isAlive(8011) → 최종 fallback
  → backendOk=false → 2s후 재시도 → 4s → 8s … (최대 20회)
  → 각 재시도 시 invalidateBase() 호출 → 후보 재순회
```

### 에이전트 필수 체크리스트 (API 관련 작업 시)
- [ ] `.env`의 `VITE_API_URL` 포트가 실제 백엔드 포트와 일치하는가?
- [ ] 백엔드 재시작 시 기존 프로세스를 모두 정리했는가? (`netstat -ano | grep :8000`)
- [ ] `apiAdapter.ts`의 `CANONICAL_BASE`가 8000인가?
- [ ] 새 API 엔드포인트 추가 시 `apiAdapter.ts`에 래퍼를 만들었는가?
- [ ] 프론트에서 직접 `fetch()`를 쓰지 않고 `req()`/`getBase()`를 경유하는가?

### 과거 문제 기록 (재발 방지)
- `.env`에 `VITE_API_URL=8002`(테스트용) 잔존 → 프론트 전체 API 실패 (2026-02-28)
- 구버전 백엔드 다수 중복 실행 → 요청이 구버전으로 라우팅 (2026-02-28)
- openapi.json 기반 헬스체크 → 모델 로딩 60초간 타임아웃 (2026-02-28)
- App.tsx 헬스체크 1회성 → 백엔드 느린 시작 시 영구 에러 배너 (2026-02-28)

---

## 현재 확인 포인트 (중요)
- `python/app.py`에 백업 API 추가됨:
  - `GET /api/backup/download` (zip 다운로드)
  - `POST /api/backup/restore` (zip 복구)
- `src/adapters/apiAdapter.ts` 및 `FolderPanel`에서 백업/복구 버튼 연동 완료
- 최근 API 추가 목록(핵심):
  - `GET /api/trash`, `POST /api/trash/{id}/restore`, `DELETE /api/trash/{id}`
  - `GET /api/url-meta?url=...` (URL og:meta 조회)
  - `POST /api/files`, `GET /api/files/{filename}`
  - `GET /api/images/library`
  - `POST /api/system/open-path`
  - `POST /api/system/open-external`
  - `GET /api/graph/edges`, `POST /api/graph/rebuild-semantic`

### 백엔드 프로세스 표준 조치
1. 기존 프로세스 전체 정리: `taskkill //IM python.exe //F //T`
2. 포트 확인: `netstat -ano | grep ":8000 " | grep LISTEN`
3. 단일 백엔드 기동: `cd python && .venv/Scripts/python.exe -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload`
4. 모델 로딩 완료까지 ~60초 대기 후 `Application startup complete` 로그 확인

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

## 실행 방법 (서버 안정화 설계 — 2026-02-28 확정)

> **`npm run dev` 한 줄이 표준 시작 명령이다.** 에이전트는 항상 이것만 사용한다.

### 개발 (권장 — 통합 시작)
```bash
npm run dev
```
자동 수행 순서 (`scripts/start-backend.js`):
1. **포트 정리**: 8000, 8011 기존 프로세스 전부 kill
2. **백엔드 시작**: uvicorn --reload (모델 로딩 ~60초)
3. **헬스체크 대기**: `/api/docs` 2초 간격 폴링, 최대 120초
4. **프론트엔드 시작**: Vite dev server (:5173)

### 개별 실행 (디버그 시에만)
```bash
# 백엔드만
npm run dev:backend

# 프론트엔드만
npm run dev:frontend
```

### 데스크톱 앱 (배포)
```bash
run_mygraph.bat
```
동일한 포트 정리 → 헬스체크 → desktop.py 순서로 실행.

### 에이전트 서버 시작 규칙 (필수)
1. **`npm run dev` 한 줄만 실행**한다. 터미널 2개 따로 열지 않는다.
2. 수동으로 uvicorn을 직접 실행하지 않는다 (포트 중복 원인).
3. 서버 재시작 필요 시: 기존 `npm run dev` 프로세스 종료 → 다시 `npm run dev`.
4. 백엔드만 재시작해야 한다면: `npm run dev:backend` (프론트는 이미 떠 있을 때).

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

## NLP/시맨틱 검색 기술 스택 (2026-02-28)
- **권장**: scikit-learn + kiwipiepy — 설치/품질/유지보수 밸런스가 가장 좋음
- **추가 순서**: 단순하게 시작하려면 scikit-learn 단독으로 먼저 붙이고, 한국어 품질 이슈가 보이면 kiwipiepy를 추가하는 순서가 안전함

---

## 그래프 유사도 재점검 — 최종 설계 (2026-02-28)

### 배경 및 의사결정 히스토리

| 단계 | 문제 | 변경 내용 |
|------|------|-----------|
| 1차 | 그래프 진입 시 연결선 전혀 없음 | GraphView에서 전체 문서 로드, 수동 rebuild 버튼 추가 |
| 2차 | 모든 문서가 점선으로 완전 연결됨 | 공통 태그 fallback 엣지 제거, 임계값 강화 |
| 3차 | 임베딩 거리 기반으로 변경 요청 | 직접 문서 임베딩 비교로 전환 |
| 4차 | 동일 내용 문서 연결 안 됨 | 다시 tag centroid 방식으로 복귀 |
| 5차 | 같은 태그인데 연결 안 됨 | same-tag 규칙 추가 (공통 태그 있으면 무조건 연결) |
| 6차 | 8개 동일 태그도 연결 안 됨 | too_common 필터 제거, 태그 정규화(_normalize_tag) 추가, 관찰성 강화 |

**최종 결정**: 본문 직접 비교 ❌ → **태그 centroid 임베딩 유사도** + **same-tag 무조건 연결** 혼합

---

### 핵심 상수 (`python/app.py`)

```python
AUTO_TAG_LIMIT     = 8      # 문서당 최대 태그 수
TAG_EDGE_TYPE      = "tag_semantic"
TAG_EDGE_THRESHOLD = 0.15   # AI 유사도 기반 (0.0~1.0)
TAG_EDGE_TOP_N     = 3      # 상위 N개 태그쌍 평균으로 doc 유사도 계산
TAG_EDGE_K         = 8      # 노드당 최대 엣지 수 (k_per_node)
AI_SIM_MODEL       = "gpt-4o-mini"  # 태그 유사도 계산 전용 모델
EMBED_MODEL_NAME   = "all-MiniLM-L6-v2"  # fallback용
```

---

### 그래프 엣지 생성 알고리즘 (2026-02-28 AI 기반 재설계)

**핵심 원칙: 공통 태그 0개 = 유사도 0 = 연결 없음**

**단계 1 — 태그 정규화 + 노이즈 필터**
- `_normalize_tag(tag)`: NFC 유니코드, 공백 1칸화, casefold
- `_normalize_tag_list(tags)`: 중복 제거 + 노이즈 태그 필터 (`_NOISE_TAGS`, 2자 미만, 짧은 영문 변수명)

**단계 2 — 공통 태그 게이트**
- 문서 A, B의 공통 태그가 0개 → 유사도 0, 연결 대상에서 완전 제외
- 공통 태그 ≥1 → 유사도 계산 대상

**단계 3 — AI 태그 유사도 계산 (`_compute_tag_similarities_ai`)**
- 공통 태그가 있는 문서쌍에 필요한 태그 쌍만 수집 (전수 조합 아님)
- GPT-4o-mini에게 태그 쌍의 의미적 연관도(0.0~1.0) 판단 요청
- SQLite `tag_similarity_cache`에 캐시 → 태그 변경 시만 증분 재계산
- AI 키 없으면 centroid fallback (threshold 0.75)

**단계 4 — 엣지 가중치 = AI cross-tag 유사도 (`_build_doc_edges_ai`)**
- 각 문서쌍의 모든 태그 조합에 대해 AI 유사도 조회
- 상위 `top_n`개 쌍의 평균 = doc_sim (weight)
- `weight < threshold`이면 k 제한 적용, 이상이면 무조건 연결

**단계 5 — k 제한**
- threshold 이상: 항상 연결
- threshold 미만: 노드당 `k_per_node=8` 제한

---

### 관련 함수 구조 (`python/app.py`)

| 함수 | 역할 |
|------|------|
| `_normalize_tag(tag)` | 단일 태그 정규화 |
| `_normalize_tag_list(tags)` | 태그 정규화 + 중복/노이즈 제거 |
| `_is_noise_tag(tag)` | 노이즈 태그 판별 (para, var 등) |
| `_compute_tag_similarities_ai(needed_pairs)` | GPT에게 태그 쌍 연관도 계산 (캐시 활용) |
| `_fetch_ai_similarities(pairs, cache)` | OpenAI API 실제 호출 + 결과 파싱/캐시 저장 |
| `_build_doc_edges_ai(tag_sims, ...)` | 공통 태그 게이트 + AI 유사도 가중치 엣지 생성 |
| `_rebuild_semantic_graph_edges(...)` | AI 유사도 계산 + 엣지 생성 + DB 저장 |
| `_safe_rebuild_semantic_graph_edges(...)` | 예외를 잡아 안전한 반환 |

---

### API 엔드포인트

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/graph/edges?edge_type=tag_semantic&min_weight=0.15` | 현재 엣지 조회 |
| `POST /api/graph/rebuild-semantic` | 수동 rebuild |

**rebuild 응답 예시**:
```json
{
  "ok": true,
  "context": "rebuild_api",
  "status": "ok",
  "engine": "ai",
  "tagCount": 70,
  "edgeCount": 10,
  "threshold": 0.15,
  "topN": 3,
  "kPerNode": 8
}
```

---

### 자동 rebuild 트리거

다음 API 호출 완료 시 `_safe_rebuild_semantic_graph_edges`가 자동 실행됨:
- `POST /api/docs/{id}` (문서 저장)
- `DELETE /api/docs/{id}` (문서 삭제)
- `POST /api/trash/{id}/restore` (휴지통 복구)
- `PUT /api/docs/{id}/tags` (태그 수동 설정)

각 응답에 `rebuild` 필드로 위 통계 포함.

---

### 프론트엔드 진단 UI (`src/components/GraphView.tsx`)

- `edgeCount`: 로드된 엣지 수 표시 (0이면 경고 메시지)
- `graphLoadReason`: 엣지 없음 원인 표시
- `rebuildSummary`: 마지막 rebuild 결과 (`edge=N, sameTag=N, centroid=N`)
- "시맨틱 그래프 업데이트" 버튼: 수동 rebuild 실행

**GraphView의 엣지 로드 파라미터**:
```ts
api.graph.edges({ minWeight: 0.58, edgeType: "tag_semantic", limit: 2000 })
```

---

### 타입 (`src/adapters/apiAdapter.ts`)

```ts
graph.rebuildSemantic() → {
  ok: boolean;
  context?: string;
  status?: string;
  reason?: string;
  tagCount?: number;
  edgeCount?: number;
  sameTagEdgeCount?: number;
  centroidEdgeCount?: number;
  threshold?: number;
  topN?: number;
  kPerNode?: number;
}

edges[].evidence → { tagA: string; tagB: string; similarity: number }[]
                 | { sharedTags: string[] }[]
```

---

### 알려진 이슈 및 주의사항

1. **embed_model이 None이면 엣지 0개**: `CHROMA_AVAILABLE=False` 상태에서는 임베딩 불가 → centroid 엣지 0 (same-tag 엣지도 생성 안 됨). 백엔드 시작 로그에서 `chromadb` 초기화 여부 확인 필요.
2. **태그가 없는 문서는 연결 제외**: `doc_tag_map_raw`에 등록되려면 태그 1개 이상 필요.
3. **k_per_node 제한**: same-tag(weight=1.0)도 `< NEAR_DUP(0.98)` 체크에서 걸리지 않아야 하지만, 현재 same-tag는 weight=1.0이므로 `>= NEAR_DUP` 경로로 처리 → k 제한 없이 항상 연결됨.
4. **rebuild는 동기 실행**: 문서 수가 많으면 저장/삭제 API 응답이 느릴 수 있음. 추후 비동기화 필요.

---

### 향후 개선 제안 (미구현)

- UI에서 `threshold` / `top_n` / `k_per_node` 실시간 조절 슬라이더
- rebuild 비동기화 (백그라운드 태스크)
- 태그가 없는 문서도 본문 임베딩 직접 비교로 연결 옵션

---

## 향후 작업 (tasks/todo.md 참조)
- 로컬 LLM (Ollama 등) API 연동 — 문서 자동 요약/키워드 추출
- ChromaDB + Sentence-Transformers 시맨틱 검색 고도화
- 문서 내보내기/가져오기 (Markdown, HTML, Excel 일괄)
- React Flow 그래프 뷰 고도화 (노드 가중치, 레이아웃)
- **그래프 파라미터 UI 튜닝** (threshold/top_n/k_per_node 실시간 조절)

---

## 오늘 작업 마감 기록 (2026-02-28)

### 1) 문서 생성 타입 선택 기능
- 목표: 새 문서 생성 시 **일반 문서/마크다운 문서**를 명시적으로 선택
- 변경:
  - 상단 `새 문서` 버튼을 드롭다운으로 확장
  - 생성 옵션:
    - `일반 문서` (기본, Ctrl+N 포함)
    - `마크다운 문서`
- 동작 규칙:
  - 마크다운 문서 생성 시 콘텐츠 선두에 `<!--markdown-->` 마커를 저장
  - 에디터는 문서 로드 시 마커를 감지하면 자동으로 마크다운 모드 진입
  - 마크다운 모드 저장/자동저장은 마커 + 원본 MD 텍스트를 유지해 모드 일관성 보장

### 2) URL 저장 AI 폴더 분류 체계 재정의
- 사용자 요구: 일반 10개 + AI 세부 10개 + 코드 세부 10개 중, **AI 생성용은 20개만 사용**
- 최종 정책:
  - AI 자동 분류 표준 체계(`_FOLDER_TAXONOMY`)는 **AI 세부 10 + 코드 세부 10 = 20개**
  - 일반 10개(`AI`, `코드`, `여행`, `경제/금융`, `건강/의료`, `과학/기술`, `사회/문화`, `역사`, `비즈니스`, `기타`)는
    - 사용자 기존 폴더 선택
    - 비-AI/비-코드 주제 fallback 안내
    - 유효성 검사 허용 목록
    에서 사용
- 우선순위:
  1. 사용자 생성 폴더
  2. 표준 20개(AI/코드 세부)
  3. 일반 10개
  4. 최종 `기타`

### 3) 오늘 최종 적용 파일
- `src/App.tsx`
  - 새 문서 드롭다운 UI
  - 문서 타입 파라미터 기반 생성 핸들러
- `src/components/Editor.tsx`
  - 마커 기반 마크다운 문서 자동 판별/모드 진입
  - 마크다운 문서 저장/자동저장 일관성 보강
- `src/styles.css`
  - 새 문서 드롭다운 스타일
- `python/app.py`
  - URL 자동 분류 taxonomy 20개로 재정의
  - 일반 카테고리 fallback/유효성 검증 보강

### 4) 마감 체크
- 문서화: 완료 (`AGENT_CONTEXT.md`, `tasks/todo.md`)
- 남은 운영 작업:
  - 백엔드 재시작 후 URL 분석 분류 동작 재확인 권장
  - 최종 배포 전 `npm run dev` 기준 수동 시나리오 점검

### 내일 바로 시작 체크리스트 (5줄)
- [ ] `npm run dev` 실행 후 백엔드/프론트 연결 상태 배너 정상 확인
- [ ] 새 문서 드롭다운에서 일반/마크다운 생성 각각 1회씩 생성·저장 검증
- [ ] URL 저장하기 1건 테스트로 AI 분류 우선순위(사용자 폴더 → 표준20 → 일반10 → 기타) 확인
- [ ] 그래프 리빌드 1회 실행 후 엣지 생성 수와 시각화 강도(점선/굵기/농도) 점검
- [ ] 변경 발생 시 `tasks/todo.md` 진행상태와 `tasks/lessons.md` 레슨 즉시 갱신
