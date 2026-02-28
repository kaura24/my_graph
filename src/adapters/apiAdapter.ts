/**
 * apiAdapter.ts
 * Python FastAPI REST 호출 어댑터.
 */

const CANONICAL_BASE = "http://127.0.0.1:8000";
const ENV_BASE = import.meta.env.VITE_API_URL as string | undefined;
const FALLBACK_BASE = "http://127.0.0.1:8011";
const API_BASE_CANDIDATES = Array.from(
    new Set([CANONICAL_BASE, ...(ENV_BASE ? [ENV_BASE] : []), FALLBACK_BASE])
);
const SESSION_BASE_KEY = "my_graph_api_base";

let resolvedBase: string | null = null;

async function isAlive(base: string, timeoutMs = 3000): Promise<boolean> {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(`${base}/api/docs`, { signal: ctrl.signal });
        clearTimeout(timer);
        return res.ok;
    } catch {
        return false;
    }
}

async function resolveBase(): Promise<string> {
    if (typeof window !== "undefined") {
        const pinned = sessionStorage.getItem(SESSION_BASE_KEY);
        if (pinned && (await isAlive(pinned))) {
            resolvedBase = pinned;
            return pinned;
        }
        if (pinned) sessionStorage.removeItem(SESSION_BASE_KEY);
    }

    for (const candidate of API_BASE_CANDIDATES) {
        if (await isAlive(candidate)) {
            resolvedBase = candidate;
            if (typeof window !== "undefined") {
                sessionStorage.setItem(SESSION_BASE_KEY, candidate);
            }
            return candidate;
        }
    }
    resolvedBase = CANONICAL_BASE;
    return CANONICAL_BASE;
}

let resolvePromise: Promise<string> | null = null;

async function getBase(): Promise<string> {
    if (resolvedBase) return resolvedBase;
    if (!resolvePromise) resolvePromise = resolveBase();
    return resolvePromise;
}

export function invalidateBase() {
    resolvedBase = null;
    resolvePromise = null;
    if (typeof window !== "undefined") {
        sessionStorage.removeItem(SESSION_BASE_KEY);
    }
}

export { isAlive, getBase, CANONICAL_BASE };

async function req<T>(
    method: string,
    path: string,
    body?: unknown,
    _retry = 0,
): Promise<T | undefined> {
    const base = await getBase();
    try {
        const res = await fetch(`${base}${path}`, {
            method,
            headers: body !== undefined ? { "Content-Type": "application/json" } : {},
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
            throw new Error(`API error ${res.status}: ${path}`);
        }
        const text = await res.text();
        return text ? (JSON.parse(text) as T) : undefined;
    } catch (err) {
        if (_retry < 2 && err instanceof TypeError) {
            invalidateBase();
            await new Promise((r) => setTimeout(r, 1000 * (_retry + 1)));
            return req<T>(method, path, body, _retry + 1);
        }
        throw err;
    }
}

// ─── 문서 ───────────────────────────────────────
export const docs = {
    list: (folder?: string) => {
        const qs = folder ? `?folder=${encodeURIComponent(folder)}` : "";
        return req<{ id: string; title: string; updatedAt: string; folder?: string | null; tags?: string[] }[]>(
            "GET",
            `/api/docs${qs}`
        );
    },

    get: (id: string) =>
        req<{ id: string; title: string; content: string; updatedAt: string } | null>(
            "GET",
            `/api/docs/${encodeURIComponent(id)}`
        ).catch((e: Error) => {
            if (e.message.includes("404")) return null;
            throw e;
        }),

    save: async (id: string, payload: { title?: string; content?: string; autoTag?: boolean; autoTagNlp?: boolean; autoTagAi?: boolean }) => {
        const qs = id ? `?id=${encodeURIComponent(id)}` : "";
        const result = await req<{ id: string }>("POST", `/api/docs${qs}`, {
            title: payload.title ?? "",
            content: payload.content ?? "",
            auto_tag: payload.autoTag ?? false,
            auto_tag_nlp: payload.autoTagNlp ?? false,
            auto_tag_ai: payload.autoTagAi ?? false,
        });
        return result!.id;
    },

    delete: (id: string) =>
        req<void>("DELETE", `/api/docs/${encodeURIComponent(id)}`),

    setFolder: (docId: string, folder: string | null) =>
        req<void>("PUT", `/api/docs/${encodeURIComponent(docId)}/folder`, { folder }),
};

// ─── 태그 ───────────────────────────────────────
export const tags = {
    getForDoc: (id: string) =>
        req<string[]>("GET", `/api/docs/${encodeURIComponent(id)}/tags`),

    setForDoc: (id: string, tagList: string[]) =>
        req<void>("PUT", `/api/docs/${encodeURIComponent(id)}/tags`, {
            tags: tagList,
        }),

    getAll: () => req<string[]>("GET", "/api/tags"),
};

// ─── 휴지통 ───────────────────────────────────────
export const trash = {
    list: () =>
        req<{ id: string; title: string; folder: string | null; tags: string[]; deletedAt: string }[]>(
            "GET",
            "/api/trash"
        ),
    restore: (docId: string) =>
        req<void>("POST", `/api/trash/${encodeURIComponent(docId)}/restore`),
    deletePermanently: (docId: string) =>
        req<void>("DELETE", `/api/trash/${encodeURIComponent(docId)}`),
};

// ─── 폴더 ───────────────────────────────────────
export const folders = {
    list: () => req<string[]>("GET", "/api/folders"),

    create: (name: string) =>
        req<string[]>("POST", "/api/folders", { name }),

    rename: (oldName: string, newName: string) =>
        req<string[]>("PUT", `/api/folders/${encodeURIComponent(oldName)}`, {
            newName,
        }),

    delete: (name: string) =>
        req<string[]>("DELETE", `/api/folders/${encodeURIComponent(name)}`),
};

// ─── 이미지 ─────────────────────────────────────
export const images = {
    upload: async (
        file: File,
        options?: { docId?: string; source?: "paste" | "drop" | "picker" | "library" | "upload" }
    ): Promise<{ url: string; filename: string }> => {
        const base = await getBase();
        const formData = new FormData();
        formData.append("file", file);
        if (options?.docId) formData.append("docId", options.docId);
        if (options?.source) formData.append("source", options.source);
        const res = await fetch(`${base}/api/images`, {
            method: "POST",
            body: formData,
        });
        if (!res.ok) throw new Error(`Image upload failed: ${res.status}`);
        return res.json();
    },

    getUrl: async (filename: string) => `${await getBase()}/api/images/${filename}`,
    list: (docId?: string, limit: number = 100) => {
        const qs = new URLSearchParams();
        if (docId) qs.set("docId", docId);
        qs.set("limit", String(limit));
        return req<Array<{
            id: number;
            docId: string | null;
            originalName: string;
            storedName: string;
            mimeType: string;
            size: number;
            source: string;
            url: string;
            createdAt: string;
        }>>("GET", `/api/images/library?${qs.toString()}`);
    },
};

// ─── 파일 ───────────────────────────────────────
export const files = {
    upload: async (file: File): Promise<{ url: string; filename: string }> => {
        const base = await getBase();
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`${base}/api/files`, {
            method: "POST",
            body: formData,
        });
        if (!res.ok) throw new Error(`File upload failed: ${res.status}`);
        return res.json();
    },

    getUrl: async (filename: string) => `${await getBase()}/api/files/${filename}`,
};

// ─── 백업/복구 ───────────────────────────────────
export const backup = {
    download: async (): Promise<Blob> => {
        const base = await getBase();
        const res = await fetch(`${base}/api/backup/download`);
        if (!res.ok) throw new Error(`Backup download failed: ${res.status}`);
        return res.blob();
    },
    restore: async (file: File): Promise<void> => {
        const base = await getBase();
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${base}/api/backup/restore`, {
            method: "POST",
            body: form,
        });
        if (!res.ok) throw new Error(`Backup restore failed: ${res.status}`);
    },
};

// ─── 네트워크 / AI 상태 ───────────────────────────
export const network = {
    getStatus: () => req<{ connected: boolean }>("GET", "/api/network/status"),
};

export const ai = {
    getStatus: () =>
        req<{
            connected: boolean;
            hasKey: boolean;
            available: boolean;
            models: string[];
            activeModel: string;
        }>("GET", "/api/ai/status"),
};

// ─── 그래프(거리 기반 엣지) ───────────────────────
export const graph = {
    getEdges: (options?: { edgeType?: string; minWeight?: number; limit?: number }) => {
        const qs = new URLSearchParams();
        if (options?.edgeType) qs.set("edge_type", options.edgeType);
        if (options?.minWeight !== undefined) qs.set("min_weight", String(options.minWeight));
        if (options?.limit !== undefined) qs.set("limit", String(options.limit));
        const q = qs.toString();
        return req<{
            edgeType: string;
            count: number;
            edges: Array<{
                sourceDocId: string;
                targetDocId: string;
                edgeType: string;
                weight: number;
                distance: number;
                evidence: Array<
                    | { tagA: string; tagB: string; similarity: number }
                    | { sharedTags: string[] }
                >;
            }>;
        }>("GET", `/api/graph/edges${q ? `?${q}` : ""}`);
    },
    rebuildSemantic: (options?: { engine?: string; topN?: number; kPerNode?: number; minDocs?: number }) => {
        const qs = new URLSearchParams();
        if (options?.engine) qs.set("engine", options.engine);
        if (options?.topN !== undefined) qs.set("top_n", String(options.topN));
        if (options?.kPerNode !== undefined) qs.set("k_per_node", String(options.kPerNode));
        if (options?.minDocs !== undefined) qs.set("min_docs", String(options.minDocs));
        const q = qs.toString();
        return req<{
            ok?: boolean;
            context?: string;
            status: string;
            reason?: string;
            engine?: string;
            tagCount?: number;
            edgeCount?: number;
            threshold?: number;
            topN?: number;
            kPerNode?: number;
        }>("POST", `/api/graph/rebuild-semantic${q ? `?${q}` : ""}`);
    },
};

// ─── 시스템 ───────────────────────────────────────
export const system = {
    openPath: (path: string) => req<void>("POST", "/api/system/open-path", { path }),
    openExternal: (url: string) => req<void>("POST", "/api/system/open-external", { url }),
};

// ─── URL 메타 (링크 프리뷰) ─────────────────────────
export const urlMeta = {
    fetch: (url: string) =>
        req<{ title: string; description: string; image: string; url: string }>(
            "GET",
            `/api/url-meta?url=${encodeURIComponent(url)}`
        ),
};

// ─── URL 분석 (스크래핑 + AI 요약) ───────────────────
export const urlAnalyze = {
    analyze: (url: string) =>
        req<{
            url: string;
            meta: { title: string; description: string; image: string; url: string };
            title: string;
            summary: string;
            tags: string[];
            image: string;
            folder: string;
            folderCreated: boolean;
        }>("POST", "/api/url/analyze", { url }),
};

// ─── window.api 호환 래퍼 ──
const api = { docs, tags, folders, trash, images, files, backup, system, urlMeta, urlAnalyze, network, ai, graph };
export default api;

