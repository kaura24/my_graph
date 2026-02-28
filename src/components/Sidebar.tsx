import { useEffect, useState, useMemo } from "react";
import { useStore } from "../store/useStore";

export function Sidebar() {
  const { docs, current, tags, docTags, loadDocs, loadDoc, loadAllTags, saveDoc } = useStore();
  const [newTitle, setNewTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadDocs();
    loadAllTags();
  }, [loadDocs, loadAllTags]);

  const handleNewDoc = async () => {
    if (!newTitle.trim()) return;
    const newId = await saveDoc("", newTitle.trim(), "");
    if (newId) {
      setNewTitle("");
      loadDocs();
      loadDoc(newId);
    }
  };

  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return docs;
    const q = searchQuery.toLowerCase();
    return docs.filter(d => {
      const displayTitle = (current?.id === d.id ? current.title : null) || d.title || d.id;
      const titleMatch = displayTitle.toLowerCase().includes(q);
      const tagsMatch = (docTags[d.id] || []).some(t => t.toLowerCase().includes(q));
      return titleMatch || tagsMatch;
    });
  }, [docs, docTags, current, searchQuery]);

  return (
    <aside className="sidebar">
      <section className="sidebar-section">
        <h3>검색</h3>
        <input
          type="search"
          placeholder="제목이나 태그로 문서 검색..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ width: "100%", padding: "6px", marginBottom: "16px", borderRadius: "4px", border: "1px solid #ccc" }}
        />
      </section>
      <section className="sidebar-section">
        <h3>문서</h3>
        <div className="new-doc">
          <input
            type="text"
            placeholder="새 문서 제목"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNewDoc()}
          />
          <button type="button" onClick={handleNewDoc} disabled={!newTitle.trim()}>
            추가
          </button>
        </div>
        <ul className="doc-list">
          {filteredDocs.map((d) => (
            <li
              key={d.id}
              className={current?.id === d.id ? "active" : ""}
              onClick={() => loadDoc(d.id)}
            >
              {(current?.id === d.id ? current.title : null) || d.title || d.id}
            </li>
          ))}
          {filteredDocs.length === 0 && <li style={{ color: "#888", fontSize: "var(--font-size-l)" }}>검색 결과가 없습니다.</li>}
        </ul>
      </section>
      <section className="sidebar-section">
        <h3>태그</h3>
        <ul className="tag-list">
          {tags.map((t) => (
            <li key={t} onClick={() => setSearchQuery(t)} style={{ cursor: "pointer" }}>{t}</li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
