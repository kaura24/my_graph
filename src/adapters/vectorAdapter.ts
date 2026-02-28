import axios from "axios";

const BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export async function upsertDocument(
    collection: string,
    id: string,
    text: string,
    metadata?: Record<string, unknown>
) {
    const payload = {
        collection,
        ids: [id],
        documents: [text],
        metadatas: [metadata ?? {}],
    };
    const res = await axios.post(`${BASE}/upsert`, payload, { timeout: 30000 });
    return res.data;
}

export async function queryCollection(
    collection: string,
    query: string,
    top_k = 5
) {
    const res = await axios.post(
        `${BASE}/query`,
        { collection, query, top_k },
        { timeout: 30000 }
    );
    return res.data;
}
