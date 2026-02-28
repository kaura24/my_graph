import { useEffect } from "react";
import { useStore } from "../store/useStore";

export function TagPanel() {
    const { tags, docs, docTags, loadDoc, loadAllTags, current } = useStore();

    useEffect(() => { loadAllTags(); }, [loadAllTags]);

    const getDocsForTag = (tag: string) =>
        docs.filter(d => (docTags[d.id] || []).includes(tag));

    return (
        <div className="side-panel">
            <div className="side-panel__header">태그</div>
            <div className="side-panel__body">
                {tags.length === 0 && (
                    <div style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: "var(--font-size)" }}>
                        태그가 없습니다.
                    </div>
                )}
                {tags.map(t => {
                    const tagDocs = getDocsForTag(t);
                    return (
                        <div key={t} className="tree-section">
                            <div className="tree-section__header">
                                <span className="tree-item__icon">🏷️</span>
                                <span>{t}</span>
                                <span style={{ marginLeft: "auto", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                                    {tagDocs.length}
                                </span>
                            </div>
                            {tagDocs.map(d => (
                                <div
                                    key={d.id}
                                    className={`tree-item tree-item--nested ${current?.id === d.id ? "active" : ""}`}
                                    onClick={() => loadDoc(d.id)}
                                >
                                    <span className="tree-item__icon">📄</span>
                                    <span className="tree-item__label">
                                        {(current?.id === d.id ? current.title : null) || d.title || d.id}
                                    </span>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
