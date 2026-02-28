import { create } from "zustand";
import * as vectorAdapter from "../adapters/vectorAdapter";
import api from "../adapters/apiAdapter";
import type { DocItem, DocDetail } from "../types/api";

export type PanelView = "explorer" | "search" | "tags" | "graph" | "settings";

export type AppSettings = {
  theme: "dark" | "light" | "solarized";
  fontSize: number;
  accentColor: string;
  autoTagFromHashtags: boolean;
  /** 자동 태그 방식: 로컬(NLP) vs AI(OpenAI) */
  autoTagMode: "local" | "ai";
};

export type ImageAsset = {
  id: number;
  docId: string | null;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  source: string;
  url: string;
  createdAt: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  fontSize: 13,
  accentColor: "#007acc",
  autoTagFromHashtags: true,
  autoTagMode: "local",
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem("my-graph-settings");
    const parsed = raw ? JSON.parse(raw) : {};
    // 마이그레이션: 구 설정 → autoTagMode
    if ("autoTagFromAI" in parsed && parsed.autoTagFromAI) {
      parsed.autoTagMode = "ai";
    } else if ("autoTagFromNLP" in parsed || "autoTagMode" in parsed) {
      parsed.autoTagMode = parsed.autoTagMode ?? (parsed.autoTagFromNLP !== false ? "local" : "ai");
    }
    delete parsed.autoTagFromNLP;
    delete parsed.autoTagFromAI;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function persistSettings(s: AppSettings) {
  localStorage.setItem("my-graph-settings", JSON.stringify(s));
}

type Store = {
  docs: DocItem[];
  current: DocDetail | null;
  tags: string[];
  docTags: Record<string, string[]>;
  loading: boolean;
  error: string | null;

  // Panel
  activePanel: PanelView;
  setActivePanel: (v: PanelView) => void;

  // Folders
  folders: string[];
  selectedFolder: string | null;
  expandedFolders: Set<string>;
  toggleFolderExpand: (f: string) => void;

  // Settings
  settings: AppSettings;

  // AI/Network status (인터넷 연결 시 AI 토글 표시용)
  aiStatus: {
    connected: boolean;
    hasKey: boolean;
    available: boolean;
    models: string[];
    activeModel: string;
  } | null;
  loadAIStatus: () => Promise<void>;

  // Setters
  setDocs: (docs: DocItem[]) => void;
  setCurrent: (doc: DocDetail | null) => void;
  setTags: (tags: string[]) => void;
  setDocTags: (id: string, tags: string[]) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;

  // Doc actions
  loadDocs: (folder?: string | null) => Promise<void>;
  loadDoc: (id: string) => Promise<void>;
  saveDoc: (id: string, title: string, content: string) => Promise<string>;
  renameDoc: (id: string, nextTitle: string) => Promise<void>;
  deleteDoc: (id: string) => Promise<void>;
  loadTagsForDoc: (id: string) => Promise<void>;
  saveTagsForDoc: (id: string, tags: string[]) => Promise<void>;
  loadAllTags: () => Promise<void>;

  // Folder actions
  loadFolders: () => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  deleteFolder: (name: string) => Promise<void>;
  renameFolder: (oldName: string, newName: string) => Promise<void>;
  setSelectedFolder: (folder: string | null) => void;
  setDocFolder: (docId: string, folder: string | null) => Promise<void>;

  // Trash
  trashItems: { id: string; title: string; folder: string | null; tags: string[]; deletedAt: string }[];
  loadTrash: () => Promise<void>;
  restoreFromTrash: (docId: string) => Promise<void>;
  deleteFromTrashPermanently: (docId: string) => Promise<void>;

  // Image
  uploadImage: (
    file: File,
    options?: { docId?: string; source?: "paste" | "drop" | "picker" | "library" | "upload" }
  ) => Promise<string>;
  uploadFile: (file: File) => Promise<string>;
  listImageAssets: (docId?: string) => Promise<ImageAsset[]>;

  // Settings
  updateSettings: (partial: Partial<AppSettings>) => void;
};

export const useStore = create<Store>((set, get) => ({
  docs: [],
  current: null,
  tags: [],
  docTags: {},
  loading: false,
  error: null,
  folders: [],
  selectedFolder: null,
  expandedFolders: new Set<string>(),
  trashItems: [],
  settings: loadSettings(),
  aiStatus: null,

  loadAIStatus: async () => {
    try {
      const status = await api.ai.getStatus();
      set({
        aiStatus:
          status ?? {
            connected: false,
            hasKey: false,
            available: false,
            models: [],
            activeModel: "",
          },
      });
    } catch {
      set({
        aiStatus: {
          connected: false,
          hasKey: false,
          available: false,
          models: [],
          activeModel: "",
        },
      });
    }
  },

  // Panel
  activePanel: "explorer" as PanelView,
  setActivePanel: (v) => set({ activePanel: v }),

  toggleFolderExpand: (f) => {
    const next = new Set(get().expandedFolders);
    if (next.has(f)) next.delete(f); else next.add(f);
    set({ expandedFolders: next });
  },

  setDocs: (docs) => set({ docs }),
  setCurrent: (current) => set({ current }),
  setTags: (tags) => set({ tags }),
  setDocTags: (id, tags) =>
    set((s) => ({ docTags: { ...s.docTags, [id]: tags } })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  // ── Doc actions ────────────────────────────────
  loadDocs: async (folder?: string | null) => {
    set({ loading: true, error: null });
    try {
      const f = folder !== undefined ? folder : get().selectedFolder;
      const docs = await api.docs.list(f ?? undefined);
      const list = docs ?? [];
      set({ docs: list });
      // list_docs 응답에 포함된 태그로 docTags 갱신 (태그 검색이 동작하도록)
      const nextDocTags = { ...get().docTags };
      for (const d of list) {
        if (Array.isArray(d.tags)) {
          nextDocTags[d.id] = d.tags;
        }
      }
      set({ docTags: nextDocTags });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  loadDoc: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const doc = await api.docs.get(id);
      set({ current: doc ?? null });
      if (doc) await get().loadTagsForDoc(doc.id);
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  saveDoc: async (id: string, title: string, content: string) => {
    set({ loading: true, error: null });
    let savedId = id;
    const { autoTagFromHashtags, autoTagMode } = get().settings;
    const useNlp = autoTagMode === "local";
    const useAi = autoTagMode === "ai" && get().aiStatus?.available;
    // 빈 제목으로 저장 시 기존 제목 유지 (백엔드가 title||id로 덮어써 ID가 표시되는 현상 방지)
    const effectiveTitle =
      title.trim() ||
      (get().current?.id === id ? (get().current?.title || "").trim() : "") ||
      id;
    try {
      const newId = await api.docs.save(id, {
        title: effectiveTitle,
        content,
        autoTag: autoTagFromHashtags,
        autoTagNlp: useNlp,
        autoTagAi: useAi,
      });
      savedId = newId;
      await get().loadDocs();
      if (autoTagFromHashtags || useNlp || useAi) await get().loadAllTags();
      if (newId !== id) await get().loadDoc(newId);
      else {
        if (get().current?.id === id)
          set({ current: { ...get().current!, title: effectiveTitle, content } });
        await get().loadTagsForDoc(newId);
      }
      try {
        await vectorAdapter.upsertDocument("my_graph_collection", savedId, content, { title: effectiveTitle });
      } catch (e) {
        console.warn("vector upsert failed", e);
      }
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ loading: false });
    }
    return savedId;
  },

  renameDoc: async (id: string, nextTitle: string) => {
    const title = nextTitle.trim();
    if (!title) return;
    set({ loading: true, error: null });
    try {
      const current = get().current;
      const detail = current?.id === id ? current : await api.docs.get(id);
      if (!detail) return;
      await api.docs.save(id, { title, content: detail.content });
      await get().loadDocs();
      if (get().current?.id === id) {
        set({ current: { ...get().current!, title } });
      }
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  deleteDoc: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await api.docs.delete(id);
      if (get().current?.id === id) set({ current: null });
      await get().loadDocs();
      await get().loadAllTags();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  loadTagsForDoc: async (id: string) => {
    try {
      const tags = await api.tags.getForDoc(id);
      set((s) => ({ docTags: { ...s.docTags, [id]: tags ?? [] } }));
    } catch {
      set((s) => ({ docTags: { ...s.docTags, [id]: [] } }));
    }
  },

  saveTagsForDoc: async (id: string, tags: string[]) => {
    try {
      await api.tags.setForDoc(id, tags);
      set((s) => ({ docTags: { ...s.docTags, [id]: tags } }));
      await get().loadAllTags();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  loadAllTags: async () => {
    try {
      const tags = await api.tags.getAll();
      set({ tags: tags ?? [] });
    } catch {
      set({ tags: [] });
    }
  },

  // ── Folder actions ─────────────────────────────
  loadFolders: async () => {
    try {
      const folders = await api.folders.list();
      set({ folders: folders ?? [] });
    } catch {
      set({ folders: [] });
    }
  },

  createFolder: async (name: string) => {
    try {
      await api.folders.create(name);
      await get().loadFolders();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteFolder: async (name: string) => {
    try {
      const docsInFolder = get().docs.filter((d) => d.folder === name).map((d) => d.id);
      await api.folders.delete(name);
      if (get().selectedFolder === name) {
        set({ selectedFolder: null });
      }
      await get().loadFolders();
      await get().loadDocs();
      if (get().current && docsInFolder.includes(get().current!.id)) {
        set({ current: null });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  renameFolder: async (oldName: string, newName: string) => {
    try {
      await api.folders.rename(oldName, newName);
      if (get().selectedFolder === oldName) {
        set({ selectedFolder: newName });
      }
      await get().loadFolders();
      await get().loadDocs();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setSelectedFolder: (folder: string | null) => {
    set({ selectedFolder: folder });
    if (folder === "__trash__") {
      void get().loadTrash();
    } else {
      get().loadDocs(folder);
    }
  },

  loadTrash: async () => {
    try {
      const items = await api.trash.list();
      set({ trashItems: items ?? [] });
    } catch (e) {
      set({ trashItems: [], error: String(e) });
    }
  },

  restoreFromTrash: async (docId: string) => {
    try {
      await api.trash.restore(docId);
      await get().loadTrash();
      await get().loadDocs();
      await get().loadFolders();
      await get().loadAllTags();
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  deleteFromTrashPermanently: async (docId: string) => {
    try {
      await api.trash.deletePermanently(docId);
      await get().loadTrash();
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  setDocFolder: async (docId: string, folder: string | null) => {
    try {
      await api.docs.setFolder(docId, folder);
      await get().loadDocs();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  // ── Image ──────────────────────────────────────
  uploadImage: async (file: File, options) => {
    const result = await api.images.upload(file, options);
    return api.images.getUrl(result.filename);
  },

  uploadFile: async (file: File) => {
    const result = await api.files.upload(file);
    return api.files.getUrl(result.filename);
  },

  listImageAssets: async (docId?: string) => {
    try {
      const rows = await api.images.list(docId);
      return rows ?? [];
    } catch (e) {
      set({ error: String(e) });
      return [];
    }
  },

  // ── Settings ───────────────────────────────────
  updateSettings: (partial: Partial<AppSettings>) => {
    const next = { ...get().settings, ...partial };
    persistSettings(next);
    set({ settings: next });
  },
}));
