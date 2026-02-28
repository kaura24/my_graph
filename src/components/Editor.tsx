import { useState, useEffect, useCallback, useRef, type ChangeEvent } from "react";
import { useStore, type ImageAsset } from "../store/useStore";
import api from "../adapters/apiAdapter";
import { useEditor, EditorContent } from "@tiptap/react";
import { Node as TiptapNode } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { FileImage, FileText, Paperclip } from "lucide-react";
import { feedback } from "../utils/feedback";

interface EditorProps {
  onCreateDoc?: () => Promise<void>;
}

const OBJECT_FILE_EXTENSIONS = new Set(["xml", "html", "htm"]);
const OBJECT_MIME_TYPES = new Set(["application/xml", "text/xml", "text/html"]);
const IMAGE_FILE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "heif", "tif", "tiff", "ico", "avif",
]);

const LinkPreview = TiptapNode.create({
  name: "linkPreview",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      url: { default: "" },
      title: { default: "" },
      description: { default: "" },
      image: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "div.link-preview", getAttrs: (el) => {
      const e = el as HTMLElement;
      const a = e.querySelector("a");
      const img = e.querySelector("img");
      const strong = e.querySelector(".link-preview__title");
      const span = e.querySelector(".link-preview__desc");
      return {
        url: a?.getAttribute("href") ?? "",
        title: strong?.textContent ?? "",
        description: span?.textContent ?? "",
        image: img?.getAttribute("src") ?? "",
      };
    } }];
  },
  renderHTML({ HTMLAttributes }) {
    const url = String(HTMLAttributes.url ?? "");
    const title = String(HTMLAttributes.title ?? url);
    const desc = String(HTMLAttributes.description ?? "");
    const img = String(HTMLAttributes.image ?? "");
    const inner: (string | unknown[])[] = [];
    if (img) inner.push(["img", { src: img, alt: "", class: "link-preview__img" }]);
    inner.push([
      "div",
      { class: "link-preview__body" },
      ["strong", { class: "link-preview__title" }, title],
      ...(desc ? [["span", { class: "link-preview__desc" }, desc]] : []),
    ]);
    return [
      "div",
      { class: "link-preview" },
      ["a", { href: url, target: "_blank", rel: "noopener noreferrer", class: "link-preview__a" }, ...inner],
    ];
  },
});

const EmbeddedObject = TiptapNode.create({
  name: "embeddedObject",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: "" },
      fileName: { default: "" },
      mimeType: { default: "text/html" },
    };
  },
  parseHTML() {
    return [{ tag: "object[data]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const src = String(HTMLAttributes.src ?? "");
    const fileName = String(HTMLAttributes.fileName ?? "첨부 파일");
    const mimeType = String(HTMLAttributes.mimeType ?? "text/html");
    return [
      "object",
      { data: src, type: mimeType, class: "embedded-object" },
      [
        "p",
        {},
        [
          "a",
          { href: src, target: "_blank", rel: "noopener noreferrer" },
          fileName,
        ],
      ],
    ];
  },
});

const DraggableImage = Image.extend({
  draggable: true,
  selectable: true,
});

function getFileExtension(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() ?? "" : "";
}

function isObjectFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return OBJECT_FILE_EXTENSIONS.has(ext) || OBJECT_MIME_TYPES.has(file.type);
}

function getObjectMimeType(file: File): string {
  if (file.type && OBJECT_MIME_TYPES.has(file.type)) return file.type;
  const ext = getFileExtension(file.name);
  if (ext === "xml") return "application/xml";
  return "text/html";
}

function isImageLikeFile(file: File): boolean {
  if (file.type?.startsWith("image/")) return true;
  const ext = getFileExtension(file.name || "");
  return !!ext && IMAGE_FILE_EXTENSIONS.has(ext);
}

function escapeHtml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function insertPlainTextAsParagraphs(editor: { chain: () => any }, rawText: string) {
  let text = rawText.replace(/\r\n/g, "\n");
  if (!text.trim()) return;
  // 일부 앱에서 이미지+텍스트 복사 시 문자 단위 개행이 들어오는 경우를 완화
  const linesForHeuristic = text.split("\n").map((x) => x.trim()).filter(Boolean);
  if (linesForHeuristic.length >= 8) {
    const shortLineCount = linesForHeuristic.filter((x) => x.length <= 2).length;
    if (shortLineCount / linesForHeuristic.length >= 0.7) {
      text = linesForHeuristic.join(" ");
    }
  }
  // 과도한 빈 줄 정리
  text = text.replace(/\n{3,}/g, "\n\n");
  const lines = text.split("\n");
  const html = lines
    .map((line) => (line === "" ? "<p><br /></p>" : `<p>${escapeHtml(line)}</p>`))
    .join("");
  editor.chain().focus().insertContent(html).run();
}

// Windows 경로 패턴: C:\..., C:/..., 드라이브+경로 (세그먼트: \ / : * ? " < > | 제외)
const WINDOWS_PATH_REGEX = /[a-zA-Z]:[\\/](?:[^\\/:*?"<>|\r\n]+[\\/])*[^\\/:*?"<>|\r\n]*/g;

function normalizeWindowsPath(rawText: string): string | null {
  const raw = rawText.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (!raw) return null;
  let candidate = raw.replace(/^["'`](.*)["'`]$/, "$1").trim();
  if (candidate.startsWith("file:///") || candidate.startsWith("file://")) {
    try {
      candidate = decodeURIComponent(candidate.replace(/^file:\/\/\/?/, "").replace(/^file:\/\//, ""));
    } catch {
      candidate = candidate.replace(/^file:\/\/\/?/, "").replace(/^file:\/\//, "").replace(/%2F/gi, "/");
    }
    candidate = candidate.replace(/\//g, "\\");
  }
  if (/^[a-zA-Z]:\\\\/.test(candidate)) {
    candidate = candidate.replace(/\\\\/g, "\\");
  }
  const isDrive = /^[a-zA-Z]:[\\/]/.test(candidate);
  const isUnc = /^\\\\/.test(candidate);
  if (isDrive || isUnc) {
    return candidate.replace(/\//g, "\\").trim();
  }
  return null;
}

/** 경로 문자열 정제: 마지막 세그먼트 뒤 불필요한 단어 제거 (예: "path for details" → "path") */
function trimPathOvermatch(path: string): string {
  const trimmed = path.trim();
  const spaceIdx = trimmed.lastIndexOf(" ");
  if (spaceIdx <= 0) return trimmed;
  const afterSpace = trimmed.slice(spaceIdx + 1).toLowerCase();
  const commonWords = ["for", "the", "and", "or", "in", "on", "at", "to", "details", "more", "info"];
  if (commonWords.includes(afterSpace)) {
    return trimPathOvermatch(trimmed.slice(0, spaceIdx));
  }
  return trimmed;
}

function findWindowsPathInText(rawText: string): string | null {
  const text = (rawText ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (!text.trim()) return null;
  // 0) file:// URL 형식 선처리
  const fileUrlMatch = text.match(/file:\/\/\/?([^\s]+)/i);
  if (fileUrlMatch) {
    const parsed = normalizeWindowsPath("file:///" + fileUrlMatch[1]);
    if (parsed && parsed.length >= 4) return parsed;
  }
  // 1) 전체 텍스트에서 경로 패턴 검색
  const globalMatch = text.match(WINDOWS_PATH_REGEX);
  if (globalMatch) {
    for (const m of globalMatch) {
      const cleaned = trimPathOvermatch(m);
      const parsed = normalizeWindowsPath(cleaned);
      if (parsed && parsed.length >= 4) return parsed;
    }
  }
  // 2) 라인 단위로 검색 (한 줄이 경로만 있는 경우)
  const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  for (const line of lines) {
    const parsed = normalizeWindowsPath(line);
    if (parsed && parsed.length >= 4) return parsed;
    const m = line.match(WINDOWS_PATH_REGEX);
    if (m) {
      const cleaned = trimPathOvermatch(m[0]);
      const parsedFromMatch = normalizeWindowsPath(cleaned);
      if (parsedFromMatch && parsedFromMatch.length >= 4) return parsedFromMatch;
    }
  }
  return null;
}

function normalizeHttpUrl(rawText: string): string | null {
  const candidate = rawText.trim().replace(/^"(.*)"$/, "$1").trim();
  if (!candidate) return null;
  if (/^https?:\/\/\S+$/i.test(candidate)) return candidate;
  return null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Failed to read file as data URL"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}

async function dataUrlToFile(dataUrl: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const mime = blob.type || "image/png";
  const ext = mime.split("/")[1] || "png";
  return new File([blob], `image.${ext}`, { type: mime });
}

// URL에 ?debug=image 있으면 콘솔에 이미지 업로드 단계별 로그 출력
const DEBUG_IMAGE_UPLOAD =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "image";

async function uploadEmbeddedBase64Images(
  html: string,
  uploadImage: (file: File, opts?: { docId?: string; source?: string }) => Promise<string>,
  docId?: string
): Promise<string> {
  const base64Regex = /src="(data:image\/[^"]+)"/g;
  const matches = [...html.matchAll(base64Regex)];
  const seen = new Set<string>();
  let result = html;
  if (matches.length > 0 && DEBUG_IMAGE_UPLOAD) {
    console.log("[ImageUpload] 저장 시 base64 이미지 발견:", matches.length, "개");
  }
  for (const m of matches) {
    const dataUrl = m[1];
    if (seen.has(dataUrl)) continue;
    seen.add(dataUrl);
    try {
      const file = await dataUrlToFile(dataUrl);
      if (DEBUG_IMAGE_UPLOAD) console.log("[ImageUpload] base64 → 업로드 시도 중...");
      const url = await uploadImage(file, { docId, source: "library" });
      result = result.split(dataUrl).join(url);
      if (DEBUG_IMAGE_UPLOAD) console.log("[ImageUpload] base64 업로드 성공 → URL로 교체");
    } catch (e) {
      if (DEBUG_IMAGE_UPLOAD) console.warn("[ImageUpload] base64 업로드 실패, base64 유지:", e);
      else console.warn("Failed to upload embedded base64 image to backend:", e);
    }
  }
  return result;
}

function stripLegacyUploadPlaceholders(html: string): string {
  if (!html) return html;
  // Legacy placeholder markup cleanup (old versions inserted visible img-* marker text)
  let cleaned = html.replace(
    /<p[^>]*class="[^"]*image-upload-placeholder[^"]*"[^>]*>[\s\S]*?<\/p>/gi,
    ""
  );
  // Fallback: plain text remnants that may survive markup normalization
  cleaned = cleaned.replace(/이미지 업로드 중…\s*img-\d+/gi, "");
  return cleaned;
}

export function Editor({ onCreateDoc }: EditorProps) {
  const {
    current,
    docTags,
    saveDoc,
    saveTagsForDoc,
    deleteDoc,
    uploadImage,
    uploadFile,
    listImageAssets,
  } = useStore();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [imageLibrary, setImageLibrary] = useState<ImageAsset[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [canDeleteSelectedImage, setCanDeleteSelectedImage] = useState(false);
  const [imageCtxMenu, setImageCtxMenu] = useState<{ x: number; y: number; pos: number } | null>(null);
  const titleRef = useRef("");
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "내용을 입력하세요…" }),
      Link.configure({ openOnClick: false }),
      DraggableImage.configure({ inline: false, allowBase64: true }),
      LinkPreview,
      EmbeddedObject,
    ],
    content: "",
    editorProps: {
      handleClick: (view, pos, event) => {
        const anchor = (event.target as HTMLElement)?.closest?.("a");
        if (!anchor || !anchor.href) return false;
        const href = anchor.getAttribute("href") ?? "";
        if (/^https?:\/\//i.test(href)) {
          event.preventDefault();
          void api.system.openExternal(href).catch((e) => {
            console.error("URL open failed:", e);
            feedback.error("URL을 열지 못했습니다.");
          });
          return true;
        }
        if (/^file:\/\//i.test(href)) {
          event.preventDefault();
          let path = decodeURIComponent(href);
          if (path.startsWith("file:///")) {
            path = path.slice(8).replace(/\//g, "\\");
          } else if (path.startsWith("file://")) {
            path = "\\\\" + path.slice(7).replace(/\//g, "\\");
          }
          void api.system.openPath(path).catch((e) => {
            console.error("Path open failed:", e);
            feedback.error("경로를 열지 못했습니다.");
          });
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        const text = event.clipboardData?.getData("text/plain") ?? "";

        const pastedFiles = Array.from(event.clipboardData?.files ?? []);
        if (pastedFiles.length > 0) {
          event.preventDefault();
          const imageFile = pastedFiles.find(isImageLikeFile);
          if (imageFile) {
            // 이미지+텍스트 동시 클립보드에서 텍스트가 유실되지 않도록 함께 삽입
            if (editor && text.trim()) {
              insertPlainTextAsParagraphs(editor, text);
            }
            void handleImageUpload(imageFile, "paste");
          } else {
            void handleFileUpload(pastedFiles[0]!);
          }
          return true;
        }

        for (const item of items) {
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (!file) continue;
            event.preventDefault();
            if (isImageLikeFile(file)) {
              if (editor && text.trim()) {
                insertPlainTextAsParagraphs(editor, text);
              }
              void handleImageUpload(file, "paste");
            } else {
              void handleFileUpload(file);
            }
            return true;
          }
        }

        const firstLine = text.split(/\r?\n/)[0] ?? "";
        const url = normalizeHttpUrl(firstLine);
        if (url) {
          event.preventDefault();
          void (async () => {
            try {
              const meta = await api.urlMeta.fetch(url);
              editor?.chain().focus().insertContent({
                type: "linkPreview",
                attrs: {
                  url: meta.url,
                  title: escapeHtml((meta.title || url).slice(0, 200)),
                  description: escapeHtml((meta.description || "").slice(0, 300)),
                  image: meta.image || "",
                },
              }).run();
            } catch {
              editor?.chain().focus().insertContent(`<p><a href="${url}" class="link-open-external">${url}</a></p>`).run();
            }
            void persistCurrentContent();
          })();
          return true;
        }
        const path = findWindowsPathInText(text);
        if (path) {
          event.preventDefault();
          const fileHref = "file:///" + encodeURI(path.replace(/\\/g, "/"));
          editor?.chain().focus().insertContent(`<p><a href="${fileHref}" class="link-open-external">${path}</a></p>`).run();
          void persistCurrentContent();
          return true;
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        // moved: true = 에디터 내부에서 노드 드래그(이미지 위치 이동) → ProseMirror가 처리
        if (moved) return false;
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        event.preventDefault();
        const droppedFiles = Array.from(files);
        const imageFile = droppedFiles.find(isImageLikeFile);
        if (imageFile) {
          void handleImageUpload(imageFile, "drop");
        } else {
          void handleFileUpload(droppedFiles[0]!);
        }
        return true;
      },
      handleDOMEvents: {
        contextmenu: (view, event) => {
          const target = (event.target as HTMLElement | null)?.closest?.("img");
          if (!target) return false;
          event.preventDefault();
          const pos = view.posAtDOM(target, 0);
          const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos));
          view.dispatch(tr);
          setImageCtxMenu({
            x: (event as MouseEvent).clientX,
            y: (event as MouseEvent).clientY,
            pos,
          });
          return true;
        },
      },
    },
  });

  const persistCurrentContent = useCallback(async () => {
    if (!current || !editor) return;
    let content = editor.getHTML();
    const stripped = stripLegacyUploadPlaceholders(content);
    if (stripped !== content) {
      content = stripped;
      editor.commands.setContent(content, false);
    }
    content = await uploadEmbeddedBase64Images(content, uploadImage, current.id);
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
    await saveDoc(current.id, title, content);
  }, [current, editor, saveDoc, title, uploadImage]);

  const insertImageAndParagraph = useCallback((src: string) => {
    if (!editor) return;
    // 이미지 위·아래에 빈 문단을 넣어 Word처럼 위아래 모두 텍스트 입력 가능하게 함
    editor.chain().focus().insertContent(`<p></p><p><img src="${src}" alt="" /></p><p></p>`).run();
  }, [editor]);

  const updateCanDeleteSelectedImage = useCallback(() => {
    if (!editor) {
      setCanDeleteSelectedImage(false);
      return;
    }
    const selectionNode = (editor.state.selection as { node?: { type?: { name?: string } } })?.node;
    setCanDeleteSelectedImage(selectionNode?.type?.name === "image");
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    updateCanDeleteSelectedImage();
    editor.on("selectionUpdate", updateCanDeleteSelectedImage);
    editor.on("transaction", updateCanDeleteSelectedImage);
    return () => {
      editor.off("selectionUpdate", updateCanDeleteSelectedImage);
      editor.off("transaction", updateCanDeleteSelectedImage);
    };
  }, [editor, updateCanDeleteSelectedImage]);

  const handleImageUpload = useCallback(async (
    file: File,
    source: "paste" | "drop" | "picker" | "library" | "upload" = "upload",
  ) => {
    try {
      setUploadingImage(true);
      if (DEBUG_IMAGE_UPLOAD) console.log("[ImageUpload] 붙여넣기/드롭 → 백엔드 업로드 시도");
      const url = await uploadImage(file, { docId: current?.id, source });
      if (editor && url) {
        if (DEBUG_IMAGE_UPLOAD) console.log("[ImageUpload] 업로드 성공 → URL로 삽입");
        insertImageAndParagraph(url);
        await persistCurrentContent();
      }
    } catch (e) {
      if (DEBUG_IMAGE_UPLOAD) console.log("[ImageUpload] 1단계 업로드 실패 → 업로드 재시도");
      console.error("Image upload failed, retrying:", e);
      if (!editor || !current?.id) return;
      const dataUrl = await fileToDataUrl(file).catch(() => null);
      if (!dataUrl) {
        feedback.error("이미지 업로드에 실패했습니다.");
        return;
      }
      insertImageAndParagraph(dataUrl);
      try {
        await persistCurrentContent();
        feedback.info("업로드 실패: 문서에는 임시 저장했습니다.");
      } catch (saveErr) {
        console.error("문서 저장 실패:", saveErr);
        feedback.error("저장에 실패했습니다. 백엔드 연결을 확인해 주세요.");
        return;
      }
      // 저장 신뢰성을 우선하고, 백엔드가 복구되면 백그라운드에서 URL로 치환 재시도
      const retryDelays = [3000, 8000, 18000];
      void (async () => {
        for (const delayMs of retryDelays) {
          await new Promise((r) => setTimeout(r, delayMs));
          const state = useStore.getState();
          if (state.current?.id !== current.id || !editor) return;
          try {
            let content = editor.getHTML();
            if (!/src="data:image\//.test(content)) return;
            content = await uploadEmbeddedBase64Images(content, state.uploadImage, current.id);
            if (content !== editor.getHTML()) {
              editor.commands.setContent(content, false);
              await state.saveDoc(current.id, state.current.title, content);
              feedback.success("이미지를 서버 업로드로 전환했습니다.");
              return;
            }
          } catch {
            // 다음 delay로 재시도
          }
        }
      })();
    } finally {
      setUploadingImage(false);
    }
  }, [editor, uploadImage, persistCurrentContent, current?.id, insertImageAndParagraph]);

  const loadImageLibrary = useCallback(async () => {
    if (!current) return;
    setLoadingLibrary(true);
    const rows = await listImageAssets(current.id);
    setImageLibrary(rows);
    setLoadingLibrary(false);
  }, [current, listImageAssets]);

  const handleFileUpload = useCallback(async (file: File) => {
    try {
      setUploadingFile(true);
      const url = await uploadFile(file);
      if (editor && url) {
        if (isObjectFile(file)) {
          editor.chain().focus().insertContent({
            type: "embeddedObject",
            attrs: {
              src: url,
              fileName: file.name,
              mimeType: getObjectMimeType(file),
            },
          }).run();
        } else {
          editor
            .chain()
            .focus()
            .insertContent(
              `<p><a href="${url}" target="_blank" rel="noopener noreferrer">${file.name}</a></p>`
            )
            .run();
        }
        await persistCurrentContent();
      }
    } catch (e) {
      console.error("File upload failed:", e);
      feedback.error("파일 업로드에 실패했습니다.");
    } finally {
      setUploadingFile(false);
    }
  }, [editor, uploadFile, persistCurrentContent]);

  const handleInsertFromClipboard = useCallback(async () => {
    if (!navigator.clipboard?.read) {
      feedback.info("클립보드 API 미지원 환경입니다. Ctrl+V를 사용하세요.");
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith("image/"));
        if (!imgType) continue;
        const blob = await item.getType(imgType);
        const file = new File([blob], `clipboard.${imgType.split("/")[1] || "png"}`, { type: imgType });
        await handleImageUpload(file, "paste");
        setShowImageMenu(false);
        return;
      }
      feedback.info("클립보드에 이미지가 없습니다.");
    } catch (e) {
      console.error("Clipboard image read failed:", e);
      feedback.error("클립보드 이미지 읽기에 실패했습니다.");
    }
  }, [handleImageUpload]);

  const handleOpenImageLibrary = useCallback(async () => {
    setShowImageLibrary(true);
    setShowImageMenu(false);
    await loadImageLibrary();
  }, [loadImageLibrary]);

  const handleInsertLibraryImage = useCallback(async (asset: ImageAsset) => {
    if (!editor) return;
    const url = asset.url.startsWith("http") ? asset.url : `${window.location.origin}${asset.url}`;
    insertImageAndParagraph(url);
    await persistCurrentContent();
  }, [editor, persistCurrentContent, insertImageAndParagraph]);

  const handleDeleteSelectedImage = useCallback(async () => {
    if (!editor) return;
    const selectionNode = (editor.state.selection as { node?: { type?: { name?: string } } })?.node;
    if (selectionNode?.type?.name !== "image") {
      feedback.info("삭제할 이미지를 먼저 선택하세요.");
      return;
    }
    editor.chain().focus().deleteSelection().run();
    try {
      await persistCurrentContent();
      feedback.success("이미지를 삭제했습니다.");
    } catch (e) {
      console.error("이미지 삭제 저장 실패:", e);
      feedback.error("이미지 삭제 저장에 실패했습니다.");
    }
  }, [editor, persistCurrentContent]);

  const openImagePicker = () => {
    setShowImageMenu(false);
    imageInputRef.current?.click();
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleImagePicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isImageLikeFile(file)) {
      void handleImageUpload(file, "picker");
    }
    e.target.value = "";
  };

  const handleFilePicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (isImageLikeFile(file)) {
        void handleImageUpload(file, "picker");
      } else {
        void handleFileUpload(file);
      }
    }
    e.target.value = "";
  };

  useEffect(() => {
    if (current) {
      // 문서 전환 시점에만 제목/본문을 동기화해 사용자의 제목 입력이 중간에 덮어쓰이지 않도록 함.
      setTitle(current.title);
      if (editor && editor.getHTML() !== current.content) {
        editor.commands.setContent(current.content, false);
      }
    } else {
      setTitle("");
      editor?.commands.setContent("", false);
      setShowImageLibrary(false);
      setImageLibrary([]);
    }
    return () => {
      if (current && editor) {
        const html = editor.getHTML();
        const docTitle = titleRef.current;
        const contentChanged = html !== current.content && html.trim() !== "" && html !== "<p></p>";
        const titleChanged = docTitle.trim() !== (current.title || "").trim();
        if (contentChanged || titleChanged) {
          const docId = current.id;
          void saveDoc(docId, docTitle, html).catch((e) =>
            console.warn("문서 전환 시 자동 저장 실패:", e)
          );
        }
      }
    };
  }, [current?.id, editor, saveDoc]);

  useEffect(() => {
    if (!showImageMenu) return;
    const close = (event: MouseEvent) => {
      if (imageMenuRef.current && event.target instanceof globalThis.Node && imageMenuRef.current.contains(event.target)) return;
      setShowImageMenu(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [showImageMenu]);

  useEffect(() => {
    if (!imageCtxMenu) return;
    const closeIfOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(".image-context-menu")) return;
      setImageCtxMenu(null);
    };
    const closeOnEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImageCtxMenu(null);
    };
    window.addEventListener("mousedown", closeIfOutside);
    window.addEventListener("keydown", closeOnEsc);
    return () => {
      window.removeEventListener("mousedown", closeIfOutside);
      window.removeEventListener("keydown", closeOnEsc);
    };
  }, [imageCtxMenu]);

  const tags = (current && docTags[current.id]) || [];

  const handleSave = useCallback(async () => {
    if (!current || !editor) return;
    setSaving(true);
    try {
      let content = editor.getHTML();
      const stripped = stripLegacyUploadPlaceholders(content);
      if (stripped !== content) {
        content = stripped;
        editor.commands.setContent(content, false);
      }
      if (DEBUG_IMAGE_UPLOAD && /src="data:image\//.test(content)) {
        console.log("[ImageUpload] 저장 버튼 클릭 → base64 이미지 있음, 업로드 시도");
      }
      content = await uploadEmbeddedBase64Images(content, uploadImage, current.id);
      if (content !== editor.getHTML()) {
        editor.commands.setContent(content, false);
      }
      await saveDoc(current.id, title, content);
      feedback.success("저장되었습니다.");
    } catch (e) {
      console.error("저장 실패:", e);
      feedback.error("저장에 실패했습니다. 백엔드 연결을 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  }, [current, title, editor, saveDoc, uploadImage]);

  const handleAddTag = () => {
    const t = tagInput.trim();
    if (!t || !current) return;
    if (tags.includes(t)) { setTagInput(""); return; }
    saveTagsForDoc(current.id, [...tags, t]);
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    if (!current) return;
    saveTagsForDoc(current.id, tags.filter((x) => x !== tag));
  };

  const handleDelete = async () => {
    if (!current) return;
    if (confirm(`"${current.title}"을(를) 삭제할까요?`)) {
      await deleteDoc(current.id);
    }
  };

  if (!current) {
    return (
      <div className="editor-area">
        <div className="editor-empty">
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 16, opacity: 0.3 }}>
              <FileText size={48} />
            </div>
            <p>왼쪽 패널에서 문서를 선택하거나</p>
            <p>새 문서를 추가하세요.</p>
            <button
              className="btn btn--primary"
              style={{ marginTop: 12 }}
              onClick={() => void onCreateDoc?.()}
            >
              새 문서 만들기 (Ctrl+N)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-area">
      {/* Header */}
      <div className="editor-header">
        <input
          className="editor-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (!current || !editor) return;
            const next = title.trim();
            const prev = (current.title || "").trim();
            if (next && next !== prev) {
              void handleSave();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSave();
            }
          }}
          placeholder="제목"
        />
        <div className="editor-actions">
          <div className="editor-image-menu" ref={imageMenuRef}>
            <button
              className="btn"
              onClick={openImagePicker}
              disabled={uploadingImage}
              title="파일에서 이미지 불러오기"
            >
              <FileImage size={14} />
              {uploadingImage ? "업로드 중…" : "이미지 불러오기"}
            </button>
            <button
              className="btn btn--dropdown"
              onClick={() => setShowImageMenu((v) => !v)}
              disabled={uploadingImage}
              title="더보기"
              aria-label="이미지 메뉴"
            >
              ▼
            </button>
            {showImageMenu && (
              <div className="context-menu editor-image-menu__panel">
                <button className="context-menu__item" onClick={handleInsertFromClipboard}>
                  클립보드 이미지 붙여넣기
                </button>
                <button className="context-menu__item" onClick={() => void handleOpenImageLibrary()}>
                  이미지 보관함에서 삽입
                </button>
              </div>
            )}
          </div>
          <button
            className="btn"
            onClick={() => void handleDeleteSelectedImage()}
            disabled={!canDeleteSelectedImage}
            title="선택한 이미지 삭제"
          >
            이미지 삭제
          </button>
          <button className="btn" onClick={openFilePicker} disabled={uploadingFile}>
            <Paperclip size={14} />
            {uploadingFile ? "첨부 중…" : "파일"}
          </button>
          <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </button>
          <button className="btn btn--danger" onClick={handleDelete}>
            삭제
          </button>
        </div>
      </div>

      {/* Tags */}
      <div className="editor-tags">
        {tags.map((t) => (
          <span key={t} className="tag">
            {t}
            <button type="button" aria-label="태그 제거" onClick={() => handleRemoveTag(t)}>×</button>
          </span>
        ))}
        <input
          type="text"
          placeholder="태그 추가"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
        />
      </div>

      {showImageLibrary && (
        <div className="image-library">
          <div className="image-library__header">
            <strong>이미지 보관함</strong>
            <button className="btn" onClick={() => setShowImageLibrary(false)}>닫기</button>
          </div>
          <div className="image-library__body">
            {loadingLibrary && <div className="image-library__empty">불러오는 중...</div>}
            {!loadingLibrary && imageLibrary.length === 0 && (
              <div className="image-library__empty">저장된 이미지가 없습니다.</div>
            )}
            {!loadingLibrary && imageLibrary.map((asset) => {
              const src = asset.url.startsWith("http") ? asset.url : `${window.location.origin}${asset.url}`;
              return (
                <button
                  key={asset.id}
                  className="image-library__item"
                  onClick={() => void handleInsertLibraryImage(asset)}
                  title={`${asset.originalName} (${asset.source})`}
                >
                  <img src={src} alt={asset.originalName} />
                  <span>{asset.originalName}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Editor body */}
      <div className="editor-body">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleImagePicked}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.html,.htm,text/xml,application/xml,text/html,*/*"
          style={{ display: "none" }}
          onChange={handleFilePicked}
        />
        <EditorContent editor={editor} />
      </div>

      {imageCtxMenu && (
        <div
          className="context-menu image-context-menu"
          style={{ left: imageCtxMenu.x, top: imageCtxMenu.y }}
        >
          <button
            className="context-menu__item"
            onClick={() => {
              if (editor) {
                const tr = editor.state.tr.setSelection(
                  NodeSelection.create(editor.state.doc, imageCtxMenu.pos)
                );
                editor.view.dispatch(tr);
              }
              void handleDeleteSelectedImage();
              setImageCtxMenu(null);
            }}
          >
            이미지 삭제
          </button>
        </div>
      )}
    </div>
  );
}
