/**
 * apiAdapter.ts
 * Python FastAPI REST 호출 어댑터.
 */

const DEFAULT_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";
const FALLBACK_BASE = "http://127.0.0.1:8011";
const API_BASE_CANDIDATES = Array.from(new Set([DEFAULT_BASE, FALLBACK_BASE]));
const SESSION_BASE_KEY = "my_graph_api_base";

let resolvedBasePromise: Promise<string> | null = null;

async function hasRequiredRoutes(base: string): Promise<boolean> {
    try {
        const res = await fetch(`${base}/openapi.json`);
        if (!res.ok) return false;
        const json = await res.json();
        const paths = json?.paths ?? {};
        return Boolean(
            paths["/api/docs"] &&
            paths["/api/images"] &&
            paths["/api/files"] &&
            paths["/api/system/open-path"] &&
            paths["/api/system/open-external"]
        );
    } catch {
        return false;
    }
}

async function resolveBase(): Promise<string> {
    // 앱(브라우저 탭/pywebview 세션) 생명주기 동안 동일 백엔드에 고정
    if (typeof window !== "undefined") {
        const pinned = sessionStorage.getItem(SESSION_BASE_KEY);
        if (pinned) return pinned;
    }

    for (const candidate of API_BASE_CANDIDATES) {
        if (await hasRequiredRoutes(candidate)) {
            if (typeof window !== "undefined") {
                sessionStorage.setItem(SESSION_BASE_KEY, candidate);
            }
            return candidate;
        }
    }
    // 어떤 이유로도 탐지 실패하면 기존 기본값 유지
    if (typeof window !== "undefined") {
        sessionStorage.setItem(SESSION_BASE_KEY, DEFAULT_BASE);
    }
    return DEFAULT_BASE;
}

async function getBase(): Promise<string> {
    if (!resolvedBasePromise) {
        resolvedBasePromise = resolveBase();
    }
    return resolvedBasePromise;
}

async function req<T>(
    method: string,
    path: string,
    body?: unknown
): Promise<T | undefined> {
    const base = await getBase();
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

    save: async (id: string, payload: { title?: string; content?: string; autoTag?: boolean }) => {
        const qs = id ? `?id=${encodeURIComponent(id)}` : "";
        const result = await req<{ id: string }>("POST", `/api/docs${qs}`, {
            title: payload.title ?? "",
            content: payload.content ?? "",
            auto_tag: payload.autoTag ?? false,
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

// ─── window.api 호환 래퍼 ──
const api = { docs, tags, folders, trash, images, files, backup, system, urlMeta };
export default api;

