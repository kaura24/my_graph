import { useEffect, useCallback, useState, useRef } from "react";
import { FileText, Network, Plus, Settings, Tag, Globe, ChevronDown } from "lucide-react";
import { FolderPanel } from "./components/FolderPanel";
import { FilePanel } from "./components/FilePanel";
import { Editor } from "./components/Editor";
import { GraphView } from "./components/GraphView";
import { SettingsPanel } from "./components/SettingsPanel";
import { TagSettingsPanel } from "./components/TagSettingsPanel";
import { UrlSavePanel } from "./components/UrlSavePanel";
import { FeedbackToasts } from "./components/FeedbackToasts";
import { useStore } from "./store/useStore";
import { isAlive, getBase, invalidateBase } from "./adapters/apiAdapter";

/** 탭바 등 좁은 공간용 모델명 축약 (예: gpt-4o-mini-search-preview → gpt-4o-mini) */
function shortModelName(model: string): string {
  const parts = model.split("-");
  return parts.length >= 3 ? parts.slice(0, 3).join("-") : model;
}

export default function App() {
  const { settings, loadDoc, saveDoc, selectedFolder, setDocFolder, aiStatus, loadAIStatus } =
    useStore();
  const [backendStatus, setBackendStatus] = useState<"checking" | "ok" | "retrying" | "failed">("checking");
  const [retryCount, setRetryCount] = useState(0);
  const [mainTab, setMainTab] = useState<"editor" | "graph" | "tags" | "url" | "settings">("editor");
  const [showNewDocMenu, setShowNewDocMenu] = useState(false);
  const newDocMenuRef = useRef<HTMLDivElement | null>(null);

  // Backend health check with retry + runtime recovery
  useEffect(() => {
    let cancelled = false;
    let retries = 0;
    const MAX_RETRIES = 30;
    const POLL_OK_INTERVAL = 15000;

    const check = async () => {
      const base = await getBase();
      const ok = await isAlive(base);
      if (cancelled) return;

      if (ok) {
        setBackendStatus("ok");
        setRetryCount(0);
        setTimeout(check, POLL_OK_INTERVAL);
        return;
      }

      invalidateBase();
      retries++;
      setRetryCount(retries);

      if (retries >= MAX_RETRIES) {
        setBackendStatus("failed");
        return;
      }

      setBackendStatus("retrying");
      const delay = Math.min(2000 + retries * 500, 8000);
      setTimeout(check, delay);
    };
    void check();
    return () => { cancelled = true; };
  }, []);

  const backendOk = backendStatus === "ok";

  // OpenAI AI 상태 (연결 확인 + 모델 목록)
  useEffect(() => {
    if (backendOk) void loadAIStatus();
  }, [backendOk, loadAIStatus]);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
    document.documentElement.style.setProperty("--font-size", `${settings.fontSize}px`);
    document.documentElement.style.setProperty("--accent", settings.accentColor);
    document.documentElement.style.setProperty("--border-focus", settings.accentColor);
  }, [settings.theme, settings.fontSize, settings.accentColor]);

  // PyQt-style: 문서 선택 시 단일 에디터에 바로 로드
  const handleOpenDoc = useCallback((docId: string) => {
    loadDoc(docId);
  }, [loadDoc]);

  const handleCreateDoc = useCallback(async (type: "normal" | "markdown" = "normal") => {
    const title = "새메모";
    const seed = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const newDocId = `memo_${seed}`;
    // 마크다운 문서는 에디터가 모드를 감지하는 마커를 초기 콘텐츠로 삽입
    const initialContent = type === "markdown" ? "<!--markdown-->" : "";
    const newId = await saveDoc(newDocId, title, initialContent);
    if (!newId) return;
    if (selectedFolder) {
      await setDocFolder(newId, selectedFolder);
    }
    handleOpenDoc(newId);
    setMainTab("editor");
  }, [saveDoc, selectedFolder, setDocFolder, handleOpenDoc]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void handleCreateDoc("normal");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCreateDoc]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (newDocMenuRef.current && !newDocMenuRef.current.contains(e.target as Node)) {
        setShowNewDocMenu(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const showBanner = backendStatus !== "ok";
  return (
    <div className={`app${showBanner ? " has-top-banner" : ""}`}>
      {backendStatus === "checking" && (
        <div className="banner banner--info" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100 }}>
          백엔드 연결 확인 중…
        </div>
      )}
      {backendStatus === "retrying" && (
        <div className="banner banner--warn" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100 }}>
          백엔드 연결 대기 중 (모델 로딩 ~60초) — 재시도 {retryCount}회
        </div>
      )}
      {backendStatus === "failed" && (
        <div className="banner banner--error" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100 }}>
          백엔드 연결 실패 — <code>npm run dev</code> 로 서버를 시작하세요
        </div>
      )}

      <div className="workspace-layout">
        <FolderPanel
          onCreateDoc={() => handleCreateDoc("normal")}
          onOpenSettings={() => setMainTab("settings")}
          onOpenTagSettings={() => setMainTab("tags")}
        />
        <FilePanel onOpenDoc={handleOpenDoc} onCreateDoc={() => handleCreateDoc("normal")} />

        <div className="editor-area">
          <div className="tab-bar">
            <div className="tab-bar__tabs">
              <button
                className={`tab-item ${mainTab === "editor" ? "active" : ""}`}
                onClick={() => setMainTab("editor")}
                title="에디터"
              >
                <FileText size={16} strokeWidth={2} />
                에디터
              </button>
              <button
                className={`tab-item ${mainTab === "graph" ? "active" : ""}`}
                onClick={() => setMainTab("graph")}
                title="그래프"
              >
                <Network size={16} strokeWidth={2} />
                그래프
              </button>
              <button
                className={`tab-item ${mainTab === "tags" ? "active" : ""}`}
                onClick={() => setMainTab("tags")}
                title="태그 설정"
              >
                <Tag size={16} strokeWidth={2} />
                태그 설정
              </button>
              <button
                className={`tab-item ${mainTab === "url" ? "active" : ""}`}
                onClick={() => setMainTab("url")}
                title="URL 저장"
              >
                <Globe size={16} strokeWidth={2} />
                URL 저장
              </button>
              <button
                className={`tab-item ${mainTab === "settings" ? "active" : ""}`}
                onClick={() => setMainTab("settings")}
                title="설정"
              >
                <Settings size={16} strokeWidth={2} />
                설정
              </button>
            </div>
            <div className="tab-bar__actions">
              <span
                className={`tab-bar__ai-status ${aiStatus?.available ? "connected" : ""}`}
                title={
                  aiStatus?.available
                    ? `OpenAI 연결됨 (${aiStatus.activeModel})`
                    : aiStatus?.hasKey
                      ? aiStatus.activeModel
                        ? `AI 연결 실패 (모델: ${aiStatus.activeModel})`
                        : "AI 연결 실패"
                      : "AI 미연결"
                }
              >
                <span className="tab-bar__ai-dot" />
                {aiStatus?.available && aiStatus.activeModel
                  ? `AI (${shortModelName(aiStatus.activeModel)})`
                  : "AI"}
              </span>
              <div className="new-doc-dropdown" ref={newDocMenuRef}>
                <button
                  className="tab-item new-doc-dropdown__main"
                  onClick={() => void handleCreateDoc("normal")}
                  title="일반 문서 (Ctrl+N)"
                >
                  <Plus size={16} strokeWidth={2} />
                  새 문서
                </button>
                <button
                  className="tab-item new-doc-dropdown__arrow"
                  onClick={() => setShowNewDocMenu((v) => !v)}
                  title="문서 유형 선택"
                >
                  <ChevronDown size={12} strokeWidth={2} />
                </button>
                {showNewDocMenu && (
                  <div className="new-doc-dropdown__menu">
                    <button
                      className="new-doc-dropdown__item"
                      onClick={() => { void handleCreateDoc("normal"); setShowNewDocMenu(false); }}
                    >
                      <FileText size={14} />
                      일반 문서
                    </button>
                    <button
                      className="new-doc-dropdown__item new-doc-dropdown__item--md"
                      onClick={() => { void handleCreateDoc("markdown"); setShowNewDocMenu(false); }}
                    >
                      <span className="new-doc-dropdown__md-icon">M↓</span>
                      마크다운 문서
                    </button>
                  </div>
                )}
              </div>
              <span className="version-badge" title="버전 1.0">V 1.0</span>
            </div>
          </div>
          {mainTab === "editor" && <Editor onCreateDoc={() => handleCreateDoc("normal")} />}
          {mainTab === "graph" && <GraphView />}
          {mainTab === "tags" && <TagSettingsPanel />}
          {mainTab === "url" && <UrlSavePanel />}
          {mainTab === "settings" && <SettingsPanel />}
        </div>
      </div>
      <FeedbackToasts />
    </div>
  );
}
