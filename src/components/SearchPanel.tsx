import { useState, useMemo } from "react";
import { useStore } from "../store/useStore";

export function SearchPanel() {
    const { docs, docTags, loadDoc, current } = useStore();
    const [query, setQuery] = useState("");

    const results = useMemo(() => {
        const q = query.toLowerCase().trim();
        if (!q) return [];
        return docs.filter(d => {
            const displayTitle = (current?.id === d.id ? current.title : null) || d.title || d.id;
            const titleMatch = displayTitle.toLowerCase().includes(q);
            const tagsMatch = (docTags[d.id] || []).some(t => t.toLowerCase().includes(q));
            return titleMatch || tagsMatch;
        });
    }, [docs, docTags, current, query]);

    return (
        <div className="side-panel">
            <div className="side-panel__header">검색</div>
            <div className="side-panel__search">
                <input
                    type="search"
                    placeholder="제목이나 태그로 검색..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    autoFocus
                />
            </div>
            <div className="side-panel__body">
                {query.trim() && results.length === 0 && (
                    <div style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: "var(--font-size)" }}>
                        검색 결과가 없습니다.
                    </div>
                )}
                {results.map(d => (
                    <div
                        key={d.id}
                        className={`tree-item ${current?.id === d.id ? "active" : ""}`}
                        onClick={() => loadDoc(d.id)}
                    >
                        <span className="tree-item__icon">📄</span>
                        <span className="tree-item__label">
                        {(current?.id === d.id ? current.title : null) || d.title || d.id}
                    </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
