import { useState, useCallback } from "react";
import { Globe, Loader, ExternalLink, Save, RefreshCw, FolderOpen } from "lucide-react";
import api from "../adapters/apiAdapter";
import { useStore } from "../store/useStore";

export function UrlSavePanel() {
  const { saveDoc, loadDocs, loadDoc, loadAllTags, setDocFolder, loadFolders } = useStore();

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [image, setImage] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [folder, setFolder] = useState("");
  const [folderCreated, setFolderCreated] = useState(false);

  const [phase, setPhase] = useState<"idle" | "analyzing" | "done" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleStart = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      setError("http:// 또는 https://로 시작하는 URL을 입력하세요");
      return;
    }

    setPhase("analyzing");
    setError(null);

    try {
      const data = await api.urlAnalyze.analyze(trimmed);
      if (!data) throw new Error("응답 없음");

      setTitle(data.title);
      setSummary(data.summary);
      setTags(data.tags);
      setImage(data.image);
      setSourceUrl(data.url);
      setFolder(data.folder || "");
      setFolderCreated(!!data.folderCreated);
      setPhase("done");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("503")) setError("AI 미연결 — OpenAI API 키를 설정하세요.");
      else if (msg.includes("502")) setError("페이지를 가져올 수 없습니다. URL을 확인하세요.");
      else setError(`분석 실패: ${msg}`);
      setPhase("idle");
    }
  }, [url]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) return;
    setPhase("saving");
    setError(null);
    try {
      const header = `<p>🔗 <strong>원본 링크</strong><br/><a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">${sourceUrl}</a></p><hr/>`;
      const content = `${header}<h2>${title}</h2><p>${summary}</p>`;
      const seed = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const newId = await saveDoc(`url_${seed}`, title, content);
      if (!newId) throw new Error("문서 저장 실패");
      if (folder) await setDocFolder(newId, folder);
      if (tags.length > 0) await api.tags.setForDoc(newId, tags);
      await loadFolders();
      await loadDocs();
      await loadAllTags();
      await loadDoc(newId);
      setPhase("saved");
    } catch (e: unknown) {
      setError(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
      setPhase("done");
    }
  }, [title, summary, tags, sourceUrl, folder, saveDoc, setDocFolder, loadFolders, loadDocs, loadAllTags, loadDoc]);

  const handleReset = () => {
    setUrl(""); setTitle(""); setSummary(""); setTags([]);
    setImage(""); setSourceUrl(""); setFolder(""); setFolderCreated(false);
    setPhase("idle"); setError(null);
  };

  const handleTagRemove = (idx: number) => setTags((p) => p.filter((_, i) => i !== idx));

  const handleTagAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const val = (e.target as HTMLInputElement).value.trim();
    if (!val || tags.includes(val) || tags.length >= 8) return;
    setTags((p) => [...p, val]);
    (e.target as HTMLInputElement).value = "";
  };

  const analyzing = phase === "analyzing";
  const filled = phase === "done" || phase === "saving" || phase === "saved";
  const showReset = filled;

  return (
    <div className="url-save-panel">
      <div className="url-save-panel__scroll">

        {/* URL 입력 + 시작 */}
        <section className="url-save-section">
          <h3 className="url-save-section__title"><Globe size={16} /> URL</h3>
          <div className="url-save__input-row">
            <input
              type="url"
              className="input"
              placeholder="https://example.com/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !analyzing && handleStart()}
              disabled={analyzing || phase === "saving"}
            />
            <button
              className="btn btn--primary"
              onClick={filled ? handleSave : handleStart}
              disabled={analyzing || phase === "saving" || !url.trim()}
              style={{ whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, padding: "10px 24px", flexShrink: 0 }}
            >
              {analyzing && <Loader size={14} className="spin" />}
              {phase === "saving" && <Loader size={14} className="spin" />}
              {!analyzing && phase !== "saving" && (filled ? <Save size={14} /> : <Globe size={14} />)}
              {analyzing ? "분석 중…" : phase === "saving" ? "저장 중…" : filled ? "문서 저장" : "시작"}
            </button>
            {showReset && (
              <button className="btn url-save__reset-btn" onClick={handleReset} title="초기화">
                <RefreshCw size={14} />
              </button>
            )}
          </div>
          {analyzing && (
            <div className="url-save__progress">
              <Loader size={14} className="spin" />
              <span>페이지 수집 → AI 분석 → 폴더 분류 중… (10~30초)</span>
            </div>
          )}
          {error && <div className="url-save__error"><span>{error}</span></div>}
        </section>

        {/* 원본 링크 */}
        {sourceUrl && (
          <section className="url-save-section">
            <div className="url-save__source">
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={13} /> {sourceUrl}
              </a>
            </div>
            {image && (
              <div className="url-save__image">
                <img src={image} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
              </div>
            )}
          </section>
        )}

        {/* 폴더 */}
        <section className="url-save-section">
          <h3 className="url-save-section__title"><FolderOpen size={16} /> 폴더</h3>
          <div className="url-save__folder-row">
            <input
              className="input url-save__title-input"
              placeholder={analyzing ? "AI가 분류 중…" : "AI가 자동으로 분류합니다"}
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              disabled={analyzing || phase === "saving"}
            />
            {folderCreated && folder && (
              <span className="url-save__folder-badge">새 폴더</span>
            )}
          </div>
        </section>

        {/* 제목 */}
        <section className="url-save-section">
          <h3 className="url-save-section__title">제목</h3>
          <input
            className="input url-save__title-input"
            placeholder={analyzing ? "AI가 생성 중…" : "AI가 자동으로 채웁니다"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={analyzing || phase === "saving"}
          />
        </section>

        {/* 요약 */}
        <section className="url-save-section">
          <h3 className="url-save-section__title">요약</h3>
          <div className="url-save__summary-wrap">
            <textarea
              className="url-save__summary-textarea"
              placeholder={analyzing ? "AI가 생성 중…" : "AI가 자동으로 채웁니다"}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={analyzing || phase === "saving"}
            />
          </div>
        </section>

        {/* 태그 */}
        <section className="url-save-section">
          <h3 className="url-save-section__title">태그</h3>
          <div className="url-save__tags">
            {tags.map((t, i) => (
              <span key={i} className="url-save__tag">
                {t}
                <button onClick={() => handleTagRemove(i)} title="삭제">×</button>
              </span>
            ))}
            {!analyzing && tags.length < 8 && (
              <input
                className="url-save__tag-input"
                placeholder={tags.length === 0 ? "AI가 자동 생성 · 직접 추가 가능 (Enter)" : "추가 (Enter)"}
                onKeyDown={handleTagAdd}
              />
            )}
            {analyzing && tags.length === 0 && (
              <span style={{ fontSize: "var(--font-size-s)", color: "var(--text-tertiary)" }}>AI가 생성 중…</span>
            )}
          </div>
        </section>

        {/* 저장 완료 메시지 */}
        {phase === "saved" && (
          <section className="url-save-section">
            <div className="url-save__saved-banner">
              ✅ <strong>{title}</strong> → 📁 {folder || "미분류"} · 태그 {tags.length}개로 저장 완료
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
