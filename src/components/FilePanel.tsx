import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { FilePlus2, FileText, Search, Trash2, Square, CheckSquare, RotateCcw, Trash } from "lucide-react";
import { useStore } from "../store/useStore";
import { feedback } from "../utils/feedback";

interface FilePanelProps {
    onOpenDoc: (docId: string) => void;
    onCreateDoc: () => Promise<void>;
}

export function FilePanel({ onOpenDoc, onCreateDoc }: FilePanelProps) {
    const {
        docs, current, docTags, selectedFolder,
        folders, loadDocs, loadFolders,
        renameDoc, deleteDoc, setDocFolder,
        trashItems, loadTrash, restoreFromTrash, deleteFromTrashPermanently,
    } = useStore();

    const [searchInput, setSearchInput] = useState("");
    const [appliedSearch, setAppliedSearch] = useState("");
    const [selectedDate, setSelectedDate] = useState("");
    const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; docId: string } | null>(null);
    const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
    const [renameInput, setRenameInput] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const menuRef = useRef<HTMLDivElement | null>(null);
    const renameInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        loadDocs();
        loadFolders();
    }, [loadDocs, loadFolders]);

    useEffect(() => {
        if (selectedFolder === "__trash__") {
            setSelectedIds(new Set());
            void loadTrash();
            return;
        }
        if (appliedSearch) {
            void loadDocs(null);
            return;
        }
        void loadDocs(selectedFolder);
    }, [appliedSearch, selectedFolder, loadDocs, loadTrash]);

    const executeSearch = () => {
        setAppliedSearch(searchInput.trim());
    };

    useEffect(() => {
        if (!ctxMenu) return;

        const closeIfOutside = (event: MouseEvent) => {
            if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) return;
            setCtxMenu(null);
        };
        const closeOnEsc = (event: KeyboardEvent) => {
            if (event.key === "Escape") setCtxMenu(null);
        };
        const closeOnScroll = () => setCtxMenu(null);

        window.addEventListener("mousedown", closeIfOutside);
        window.addEventListener("keydown", closeOnEsc);
        window.addEventListener("scroll", closeOnScroll, true);
        window.addEventListener("wheel", closeOnScroll, { passive: true });
        return () => {
            window.removeEventListener("mousedown", closeIfOutside);
            window.removeEventListener("keydown", closeOnEsc);
            window.removeEventListener("scroll", closeOnScroll, true);
            window.removeEventListener("wheel", closeOnScroll);
        };
    }, [ctxMenu]);

    useEffect(() => {
        if (!renamingDocId) return;
        const t = window.setTimeout(() => renameInputRef.current?.focus(), 0);
        return () => window.clearTimeout(t);
    }, [renamingDocId]);

    const toDateKey = (dateStr: string) => {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return "";
        const year = d.getFullYear();
        const month = `${d.getMonth() + 1}`.padStart(2, "0");
        const day = `${d.getDate()}`.padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    const filteredDocs = useMemo(() => {
        const q = appliedSearch.trim().toLowerCase();
        let items = docs.filter((d) => {
            if (q) {
                const displayTitle = (current?.id === d.id ? current.title : null) || d.title || d.id;
                const titleMatch = displayTitle.toLowerCase().includes(q);
                const tagsMatch = (docTags[d.id] || []).some((t) => t.toLowerCase().includes(q));
                if (!titleMatch && !tagsMatch) return false;
            }
            if (selectedDate) {
                return toDateKey(d.updatedAt) === selectedDate;
            }
            return true;
        });

        items = [...items].sort((a, b) => {
            const ta = new Date(a.updatedAt || 0).getTime();
            const tb = new Date(b.updatedAt || 0).getTime();
            return sortOrder === "newest" ? tb - ta : ta - tb;
        });
        return items;
    }, [docs, docTags, current, appliedSearch, selectedDate, sortOrder]);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return "";
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
        } catch {
            return dateStr.slice(0, 10);
        }
    };

    /** 삭제일별로 휴지통 항목 그룹화. 날짜 키: YYYY-MM-DD, 최신순 */
    const trashByDate = useMemo(() => {
        const map = new Map<string, typeof trashItems>();
        for (const t of trashItems) {
            const key = t.deletedAt ? t.deletedAt.slice(0, 10) : "unknown";
            const list = map.get(key) ?? [];
            list.push(t);
            map.set(key, list);
        }
        return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    }, [trashItems]);

    const formatDateHeader = (dateKey: string) => {
        if (dateKey === "unknown") return "날짜 없음";
        try {
            const today = new Date();
            const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
            if (dateKey === todayKey) return "오늘";
            const [y, m, d] = dateKey.split("-").map(Number);
            const date = new Date(y, m - 1, d);
            const diff = Math.floor((today.getTime() - date.getTime()) / 86400000);
            if (diff === 1) return "어제";
            if (diff === 2) return "그제";
            if (diff > 0 && diff < 7) return `${diff}일 전`;
            return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
        } catch {
            return dateKey;
        }
    };

    const docsById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);

    const handleStartRenameDoc = (docId: string) => {
        const doc = docsById.get(docId);
        if (!doc) return;
        setRenamingDocId(docId);
        const displayTitle = (current?.id === docId ? current.title : null) || doc.title || doc.id;
        setRenameInput(displayTitle);
    };

    const handleCommitRenameDoc = async () => {
        if (!renamingDocId) return;
        const doc = docsById.get(renamingDocId);
        const trimmed = renameInput.trim();
        setRenamingDocId(null);
        const prevTitle = (current?.id === renamingDocId ? current.title : null) || doc?.title || "";
        if (!doc || !trimmed || trimmed === prevTitle.trim()) return;
        try {
            await renameDoc(renamingDocId, trimmed);
            feedback.success("문서 제목을 변경했습니다.");
        } catch (e) {
            feedback.error(`제목 변경 실패: ${String(e)}`);
        }
    };

    const handleDeleteDoc = async (docId: string) => {
        const doc = docsById.get(docId);
        if (!doc) return;
        const displayTitle = (current?.id === docId ? current.title : null) || doc.title || doc.id;
        if (!confirm(`"${displayTitle}" 메모를 삭제할까요?`)) return;
        await deleteDoc(docId);
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(docId);
            return next;
        });
        feedback.success("문서를 삭제했습니다.");
    };

    const toggleSelect = useCallback((docId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId);
            else next.add(docId);
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(filteredDocs.map((d) => d.id)));
    }, [filteredDocs]);

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    const handleBulkDelete = useCallback(async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        const count = ids.length;
        if (!confirm(`선택한 ${count}개 문서를 삭제할까요?`)) return;
        try {
            for (const id of ids) {
                await deleteDoc(id);
            }
            setSelectedIds(new Set());
            feedback.success(`${count}개 문서를 삭제했습니다.`);
        } catch (e) {
            feedback.error(`삭제 실패: ${String(e)}`);
        }
    }, [selectedIds, deleteDoc]);

    return (
        <div className="side-panel memo-panel">
            <div className="side-panel__header">
                <span>
                    {selectedFolder === "__trash__" ? "휴지통" : appliedSearch ? "검색 결과(전체 문서)" : (selectedFolder ?? "전체 문서")}
                </span>
                <div className="side-panel__header-actions">
                    <button title="새 문서" aria-label="새 문서" onClick={() => void onCreateDoc()}>
                        <FilePlus2 size={16} />
                    </button>
                </div>
            </div>

            {selectedFolder !== "__trash__" && (
            <div className="side-panel__search">
                <div className="side-panel__search-row">
                    <input
                        type="text"
                        placeholder="제목·태그로 검색"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") executeSearch();
                        }}
                    />
                    <button className="btn side-panel__search-btn" onClick={executeSearch}>
                        <Search size={14} />
                        검색
                    </button>
                </div>
                <div className="side-panel__filter-row">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        title="날짜 필터"
                    />
                    <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
                        title="정렬 기준"
                    >
                        <option value="newest">최신순</option>
                        <option value="oldest">오래된순</option>
                    </select>
                    {selectedDate && (
                        <button
                            className="btn side-panel__search-btn"
                            onClick={() => setSelectedDate("")}
                            title="날짜 필터 초기화"
                        >
                            날짜 초기화
                        </button>
                    )}
                </div>
            </div>
            )}

            {selectedFolder !== "__trash__" && selectedIds.size > 0 && (
                <div className="side-panel__selection-bar">
                    <span className="side-panel__selection-count">{selectedIds.size}개 선택</span>
                    <button
                        type="button"
                        className="btn btn--sm"
                        onClick={selectAll}
                        title="전체 선택"
                    >
                        전체 선택
                    </button>
                    <button
                        type="button"
                        className="btn btn--sm"
                        onClick={clearSelection}
                        title="선택 해제"
                    >
                        해제
                    </button>
                    <button
                        type="button"
                        className="btn btn--sm btn--danger"
                        onClick={() => void handleBulkDelete()}
                        title="선택 삭제"
                    >
                        <Trash2 size={12} />
                        선택 삭제
                    </button>
                </div>
            )}
            <div className="side-panel__body">
                {selectedFolder === "__trash__" ? (
                    <>
                        {trashByDate.map(([dateKey, items]) => (
                            <div key={dateKey} className="trash-date-group">
                                <div className="trash-date-header">{formatDateHeader(dateKey)}</div>
                                {items.map((t) => (
                                    <div key={t.id} className="tree-item tree-item--trash">
                                        <span className="tree-item__icon"><FileText size={14} /></span>
                                        <span className="tree-item__label" style={{ flex: 1 }}>{t.title || t.id}</span>
                                        <span style={{ fontSize: "var(--font-size-xs)", opacity: 0.5, marginRight: 4 }}>
                                            {formatDate(t.deletedAt)}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn btn--sm"
                                            title="복원"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void restoreFromTrash(t.id)
                                                    .then(() => feedback.success("복원했습니다."))
                                                    .catch(() => feedback.error("복원에 실패했습니다."));
                                            }}
                                        >
                                            <RotateCcw size={12} />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn--sm btn--danger"
                                            title="완전 삭제"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (confirm(`"${t.title || t.id}"을(를) 완전히 삭제할까요?`)) {
                                                    void deleteFromTrashPermanently(t.id)
                                                        .then(() => feedback.success("완전 삭제했습니다."))
                                                        .catch(() => feedback.error("삭제에 실패했습니다."));
                                                }
                                            }}
                                        >
                                            <Trash size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ))}
                        {trashItems.length === 0 && (
                            <div style={{ padding: "12px 20px", color: "var(--text-secondary)", fontSize: "var(--font-size-s)" }}>
                                휴지통이 비어 있습니다.
                            </div>
                        )}
                    </>
                ) : (
                <>
                {filteredDocs.map((d) => (
                    <div
                        key={d.id}
                        className={`tree-item ${current?.id === d.id ? "active" : ""} ${ctxMenu?.docId === d.id ? "tree-item--context-target" : ""} ${selectedIds.has(d.id) ? "tree-item--selected" : ""}`}
                        onClick={() => {
                            if (renamingDocId === d.id) return;
                            onOpenDoc(d.id);
                        }}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            setCtxMenu({ x: e.clientX, y: e.clientY, docId: d.id });
                        }}
                    >
                        <span
                            className="tree-item__checkbox"
                            onClick={(e) => toggleSelect(d.id, e)}
                            title={selectedIds.has(d.id) ? "선택 해제" : "선택"}
                        >
                            {selectedIds.has(d.id) ? (
                                <CheckSquare size={14} className="tree-item__checkbox--checked" />
                            ) : (
                                <Square size={14} className="tree-item__checkbox--unchecked" />
                            )}
                        </span>
                        <span className="tree-item__icon"><FileText size={14} /></span>
                        {renamingDocId === d.id ? (
                            <input
                                ref={renameInputRef}
                                className="inline-rename-input"
                                value={renameInput}
                                onChange={(e) => setRenameInput(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        void handleCommitRenameDoc();
                                    } else if (e.key === "Escape") {
                                        e.preventDefault();
                                        setRenamingDocId(null);
                                    }
                                }}
                                onBlur={() => void handleCommitRenameDoc()}
                            />
                        ) : (
                            <span className="tree-item__label">
                                {(current?.id === d.id ? current.title : null) || d.title || d.id}
                            </span>
                        )}
                        <span style={{ marginLeft: "auto", fontSize: "var(--font-size-xs)", opacity: 0.5 }}>
                            {formatDate(d.updatedAt)}
                        </span>
                    </div>
                ))}
                {filteredDocs.length === 0 && (
                    <div style={{ padding: "12px 20px", color: "var(--text-secondary)", fontSize: "var(--font-size-s)" }}>
                        {appliedSearch ? "검색 결과가 없습니다." : "문서가 없습니다."}
                    </div>
                )}
                </>
                )}
            </div>

            {ctxMenu &&
                createPortal(
                    <div ref={menuRef} className="context-menu context-menu--portal" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
                    <button
                        className="context-menu__item"
                        onClick={() => {
                            setCtxMenu(null);
                            void onCreateDoc();
                        }}
                    >
                        새 메모 만들기
                    </button>
                    <button
                        className="context-menu__item"
                        onClick={() => {
                            onOpenDoc(ctxMenu.docId);
                            setCtxMenu(null);
                        }}
                    >
                        열기
                    </button>
                    <button
                        className="context-menu__item"
                        onClick={() => {
                            setCtxMenu(null);
                            setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(ctxMenu.docId)) next.delete(ctxMenu.docId);
                                else next.add(ctxMenu.docId);
                                return next;
                            });
                        }}
                    >
                        {selectedIds.has(ctxMenu.docId) ? "선택 해제" : "선택에 추가"}
                    </button>
                    <button
                        className="context-menu__item"
                        onClick={() => {
                            setCtxMenu(null);
                            handleStartRenameDoc(ctxMenu.docId);
                        }}
                    >
                        제목 변경
                    </button>
                    <div className="context-menu__separator" />
                    <button
                        className="context-menu__item"
                        onClick={() => {
                            setCtxMenu(null);
                            void handleDeleteDoc(ctxMenu.docId);
                        }}
                    >
                        삭제
                    </button>
                    <div className="context-menu__separator" />
                    <button
                        className="context-menu__item"
                        onClick={() => {
                            setCtxMenu(null);
                            void (async () => {
                                await setDocFolder(ctxMenu.docId, null);
                                feedback.info("문서를 미분류로 이동했습니다.");
                            })();
                        }}
                    >
                        미분류로 이동
                    </button>
                    {folders.map((folder) => (
                        <button
                            key={folder}
                            className="context-menu__item"
                            onClick={() => {
                                setCtxMenu(null);
                                void (async () => {
                                    await setDocFolder(ctxMenu.docId, folder);
                                    feedback.info(`문서를 '${folder}' 폴더로 이동했습니다.`);
                                })();
                            }}
                        >
                            폴더 이동: {folder}
                        </button>
                    ))}
                    </div>,
                    document.body
                )}

        </div>
    );
}
