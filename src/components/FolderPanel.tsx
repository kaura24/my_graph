import { useEffect, useState, useRef, type ChangeEvent } from "react";
import { FilePlus2, Folder, FolderOpen, FolderPlus, Settings, Download, Upload, Trash2 } from "lucide-react";
import { useStore } from "../store/useStore";
import api from "../adapters/apiAdapter";
import { feedback } from "../utils/feedback";

interface FolderPanelProps {
    onCreateDoc: () => Promise<void>;
    onOpenSettings: () => void;
}

export function FolderPanel({ onCreateDoc, onOpenSettings }: FolderPanelProps) {
    const {
        folders, selectedFolder, docs, trashItems,
        loadFolders, loadTrash, setSelectedFolder, createFolder, deleteFolder, renameFolder,
    } = useStore();

    const [newFolderName, setNewFolderName] = useState("");
    const [showNewInput, setShowNewInput] = useState(false);
    const [editingFolder, setEditingFolder] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; folder: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const restoreInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { loadFolders(); }, [loadFolders]);
    useEffect(() => {
        if (selectedFolder === "__trash__") {
            void loadTrash();
        }
    }, [selectedFolder, loadTrash]);
    useEffect(() => {
        void loadTrash();
    }, [loadTrash]);
    useEffect(() => { if (showNewInput && inputRef.current) inputRef.current.focus(); }, [showNewInput]);

    // Close context menu on click outside
    useEffect(() => {
        if (!ctxMenu) return;
        const handler = () => setCtxMenu(null);
        window.addEventListener("click", handler);
        return () => window.removeEventListener("click", handler);
    }, [ctxMenu]);

    const handleCreate = async () => {
        const name = newFolderName.trim();
        if (!name) return;
        await createFolder(name);
        feedback.success(`폴더를 만들었습니다: ${name}`);
        setNewFolderName("");
        setShowNewInput(false);
    };

    const handleRename = async (oldName: string) => {
        const name = editName.trim();
        if (!name || name === oldName) { setEditingFolder(null); return; }
        await renameFolder(oldName, name);
        feedback.success(`폴더 이름을 변경했습니다: ${name}`);
        setEditingFolder(null);
    };

    const handleDelete = async (name: string) => {
        const count = countDocsInFolder(name);
        const msg = count > 0
            ? `"${name}" 폴더와 안의 문서 ${count}개를 모두 삭제할까요?`
            : `"${name}" 폴더를 삭제할까요?`;
        if (!confirm(msg)) return;
        await deleteFolder(name);
        feedback.success(count > 0 ? `폴더와 문서 ${count}개를 삭제했습니다.` : `폴더를 삭제했습니다: ${name}`);
    };

    const countDocsInFolder = (folder: string | null) =>
        docs.filter((d) => (folder === null ? true : d.folder === folder)).length;

    const handleBackup = async () => {
        try {
            const blob = await api.backup.download();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `my-graph-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            feedback.success("백업 파일 다운로드가 완료되었습니다.");
        } catch (e) {
            feedback.error(`백업 실패: ${String(e)}`);
        }
    };

    const handleRestorePick = () => restoreInputRef.current?.click();

    const handleRestoreFile = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const ok = confirm("백업을 복구하면 현재 데이터가 교체됩니다. 계속할까요?");
        if (!ok) {
            e.target.value = "";
            return;
        }
        try {
            await api.backup.restore(file);
            feedback.success("복구 완료. 문서/폴더 목록을 새로 고칩니다.");
            await loadFolders();
            await useStore.getState().loadDocs();
        } catch (err) {
            feedback.error(`복구 실패: ${String(err)}`);
        } finally {
            e.target.value = "";
        }
    };

    return (
        <div className="side-panel folder-panel">
            <div className="side-panel__header">
                <span>폴더</span>
                <div className="side-panel__header-actions">
                    <button title="새 문서" aria-label="새 문서" onClick={() => void onCreateDoc()}>
                        <FilePlus2 size={16} />
                    </button>
                    <button title="새 폴더" aria-label="새 폴더" onClick={() => setShowNewInput(true)}>
                        <FolderPlus size={16} />
                    </button>
                </div>
            </div>

            <div className="side-panel__body">
                {/* All Documents */}
                <div className="tree-section">
                    <div
                        className={`tree-item tree-item--folder ${selectedFolder === null ? "active" : ""}`}
                        onClick={() => setSelectedFolder(null)}
                    >
                        <span className="tree-item__icon"><FolderOpen size={14} /></span>
                        <span className="tree-item__label">전체 문서</span>
                        <span style={{ marginLeft: "auto", fontSize: "var(--font-size-xs)", opacity: 0.6 }}>
                            {countDocsInFolder(null)}
                        </span>
                    </div>
                </div>

                {/* 휴지통 */}
                <div className="tree-section">
                    <div
                        className={`tree-item tree-item--folder ${selectedFolder === "__trash__" ? "active" : ""}`}
                        onClick={() => setSelectedFolder("__trash__")}
                    >
                        <span className="tree-item__icon"><Trash2 size={14} /></span>
                        <span className="tree-item__label">휴지통</span>
                        <span style={{ marginLeft: "auto", fontSize: "var(--font-size-xs)", opacity: 0.6 }}>
                            {trashItems.length}
                        </span>
                    </div>
                </div>

                {/* Folder list */}
                {folders.map((f) => (
                    <div className="tree-section" key={f}>
                        {editingFolder === f ? (
                            <div className="inline-input">
                                <input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleRename(f);
                                        if (e.key === "Escape") setEditingFolder(null);
                                    }}
                                    onBlur={() => handleRename(f)}
                                    autoFocus
                                />
                            </div>
                        ) : (
                            <div
                                className={`tree-item tree-item--folder ${selectedFolder === f ? "active" : ""}`}
                                onClick={() => setSelectedFolder(f)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setCtxMenu({ x: e.clientX, y: e.clientY, folder: f });
                                }}
                            >
                                <span className="tree-item__icon"><Folder size={14} /></span>
                                <span className="tree-item__label">{f}</span>
                                <span style={{ marginLeft: "auto", fontSize: "var(--font-size-xs)", opacity: 0.6 }}>
                                    {countDocsInFolder(f)}
                                </span>
                            </div>
                        )}
                    </div>
                ))}

                {/* New folder input */}
                {showNewInput && (
                    <div className="inline-input">
                        <input
                            ref={inputRef}
                            value={newFolderName}
                            placeholder="폴더 이름"
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreate();
                                if (e.key === "Escape") { setShowNewInput(false); setNewFolderName(""); }
                            }}
                            onBlur={handleCreate}
                        />
                    </div>
                )}
            </div>

            {/* Context menu */}
            {ctxMenu && (
                <div className="context-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
                    <button
                        className="context-menu__item"
                        onClick={() => {
                            setEditingFolder(ctxMenu.folder);
                            setEditName(ctxMenu.folder);
                            setCtxMenu(null);
                        }}
                    >
                        이름 변경
                    </button>
                    <div className="context-menu__separator" />
                    <button
                        className="context-menu__item"
                        onClick={() => { handleDelete(ctxMenu.folder); setCtxMenu(null); }}
                    >
                        삭제
                    </button>
                </div>
            )}

            <div className="side-panel__footer">
                <button className="side-panel__footer-btn" onClick={handleBackup} title="백업">
                    <Download size={14} />
                    백업
                </button>
                <button className="side-panel__footer-btn" onClick={handleRestorePick} title="복구">
                    <Upload size={14} />
                    복구
                </button>
                <button className="side-panel__footer-btn" onClick={onOpenSettings} title="설정">
                    <Settings size={14} />
                    설정
                </button>
                <input
                    ref={restoreInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    style={{ display: "none" }}
                    onChange={handleRestoreFile}
                />
            </div>
        </div>
    );
}
