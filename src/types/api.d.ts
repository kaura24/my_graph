export interface DocItem {
  id: string;
  title: string;
  updatedAt: string;
  folder?: string | null;
}

export interface DocDetail {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

declare global {
  interface Window {
    api?: {
      docs: {
        list: (folder?: string) => Promise<DocItem[]>;
        get: (id: string) => Promise<DocDetail | null>;
        save: (id: string, payload: { title?: string; content?: string }) => Promise<string>;
        delete: (id: string) => Promise<void>;
      };
      tags: {
        getForDoc: (id: string) => Promise<string[]>;
        setForDoc: (id: string, tags: string[]) => Promise<void>;
        getAll: () => Promise<string[]>;
      };
    };
  }
}

export { };
