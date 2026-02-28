import { useEffect, useCallback, useState } from "react";
import { FileText, Network, Plus, Settings } from "lucide-react";
import { FolderPanel } from "./components/FolderPanel";
import { FilePanel } from "./components/FilePanel";
import { Editor } from "./components/Editor";
import { GraphView } from "./components/GraphView";
import { SettingsPanel } from "./components/SettingsPanel";
import { FeedbackToasts } from "./components/FeedbackToasts";
import { useStore } from "./store/useStore";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export default function App() {
  const { settings, loadDoc, saveDoc, selectedFolder, setDocFolder } = useStore();
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [mainTab, setMainTab] = useState<"editor" | "graph" | "settings">("editor");

  // Backend health check
  useEffect(() => {
    fetch(`${API_BASE}/api/docs`)
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));
  }, []);

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

  const handleCreateDoc = useCallback(async () => {
    // 파일 생성 규칙: 기본 제목 '새메모', 현재 선택 폴더 자동 배치
    const title = "새메모";
    const seed = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const newDocId = `memo_${seed}`;
    const newId = await saveDoc(newDocId, title, "");
    if (!newId) return;
    if (selectedFolder) {
      await setDocFolder(newId, selectedFolder);
    }
    handleOpenDoc(newId);
  }, [saveDoc, selectedFolder, setDocFolder, handleOpenDoc]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void handleCreateDoc();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCreateDoc]);

  return (
    <div className="app">
      {/* Banner */}
      {backendOk === false && (
        <div className="banner" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100 }}>
          Python 백엔드 연결 실패 — <code>cd python && uvicorn app:app --port 8000</code>
        </div>
      )}

      <div className="workspace-layout">
        <FolderPanel onCreateDoc={handleCreateDoc} onOpenSettings={() => setMainTab("settings")} />
        <FilePanel onOpenDoc={handleOpenDoc} onCreateDoc={handleCreateDoc} />

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
                className={`tab-item ${mainTab === "settings" ? "active" : ""}`}
                onClick={() => setMainTab("settings")}
                title="설정"
              >
                <Settings size={16} strokeWidth={2} />
                설정
              </button>
            </div>
            <div className="tab-bar__actions">
              <button className="tab-item" onClick={() => void handleCreateDoc()} title="새 문서 (Ctrl+N)">
                <Plus size={16} strokeWidth={2} />
                새 문서
              </button>
              <span className="version-badge" title="버전 1.0">V 1.0</span>
            </div>
          </div>
          {mainTab === "editor" && <Editor onCreateDoc={handleCreateDoc} />}
          {mainTab === "graph" && <GraphView />}
          {mainTab === "settings" && <SettingsPanel />}
        </div>
      </div>
      <FeedbackToasts />
    </div>
  );
}
