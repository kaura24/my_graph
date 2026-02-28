const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fse = require("fs-extra");

const DATA_DIR = path.join(app.getPath("userData"), "my-graph-data");
const DOCS_DIR = path.join(DATA_DIR, "docs");
const META_PATH = path.join(DATA_DIR, "meta.json");

function ensureDataDir() {
  fse.ensureDirSync(DOCS_DIR);
  if (!fse.existsSync(META_PATH)) {
    fse.writeJsonSync(META_PATH, { documents: {}, documentTags: {}, folders: [], documentFolders: {} });
  }
}

function getMeta() {
  ensureDataDir();
  return fse.readJsonSync(META_PATH);
}

function saveMeta(meta) {
  fse.writeJsonSync(META_PATH, meta, { spaces: 2 });
}

ipcMain.handle("docs:list", async (_, folder) => {
  ensureDataDir();
  const meta = getMeta();
  const ids = fse.readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.basename(f, ".md"));
  let items = ids.map((id) => {
    const d = meta.documents[id] || {};
    const docFolder = (meta.documentFolders && meta.documentFolders[id]) || null;
    return { id, title: d.title || id, updatedAt: d.updatedAt || "", folder: docFolder };
  }).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  if (typeof folder === "string" && folder.length > 0) {
    items = items.filter((it) => it.folder === folder);
  }
  return items;
});

ipcMain.handle("docs:get", async (_, id) => {
  ensureDataDir();
  const safeId = path.basename(id, ".md").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = path.join(DOCS_DIR, `${safeId}.md`);
  if (!fse.existsSync(filePath)) return null;
  const content = await fse.readFile(filePath, "utf-8");
  const meta = getMeta();
  const d = meta.documents[safeId] || {};
  return { id: safeId, title: d.title || safeId, content, updatedAt: d.updatedAt };
});

ipcMain.handle("docs:save", async (_, id, { title, content }) => {
  ensureDataDir();
  const safeId = (id || title || "untitled").replace(/[^a-zA-Z0-9가-힣_\-\s]/g, "").trim().replace(/\s+/g, "_") || "untitled";
  const filePath = path.join(DOCS_DIR, `${safeId}.md`);
  await fse.writeFile(filePath, content ?? "", "utf-8");
  const meta = getMeta();
  meta.documents[safeId] = { title: title || safeId, updatedAt: new Date().toISOString() };
  if (!meta.documentFolders) meta.documentFolders = {};
  if (!Object.prototype.hasOwnProperty.call(meta.documentFolders, safeId)) meta.documentFolders[safeId] = null;
  if (!meta.documentTags[safeId]) meta.documentTags[safeId] = [];
  saveMeta(meta);
  return safeId;
});

ipcMain.handle("docs:delete", async (_, id) => {
  ensureDataDir();
  const safeId = path.basename(id, ".md").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = path.join(DOCS_DIR, `${safeId}.md`);
  if (fse.existsSync(filePath)) fse.removeSync(filePath);
  const meta = getMeta();
  delete meta.documents[safeId];
  delete meta.documentTags[safeId];
  if (meta.documentFolders) delete meta.documentFolders[safeId];
  saveMeta(meta);
});

ipcMain.handle("tags:getForDoc", async (_, id) => {
  const meta = getMeta();
  return meta.documentTags[id] || [];
});

ipcMain.handle("tags:setForDoc", async (_, id, tags) => {
  ensureDataDir();
  const meta = getMeta();
  meta.documentTags[id] = Array.isArray(tags) ? tags : [];
  saveMeta(meta);
});

ipcMain.handle("tags:getAll", async () => {
  const meta = getMeta();
  const set = new Set();
  Object.values(meta.documentTags || {}).flat().forEach((t) => set.add(t));
  return Array.from(set).sort();
});

// Folders API (meta.json-backed)
ipcMain.handle("folders:list", async () => {
  ensureDataDir();
  const meta = getMeta();
  return meta.folders || [];
});

ipcMain.handle("folders:create", async (_, name) => {
  ensureDataDir();
  const meta = getMeta();
  meta.folders = meta.folders || [];
  if (!meta.folders.includes(name)) meta.folders.push(name);
  saveMeta(meta);
  return meta.folders;
});

ipcMain.handle("folders:rename", async (_, oldName, newName) => {
  ensureDataDir();
  const meta = getMeta();
  meta.folders = meta.folders || [];
  const idx = meta.folders.indexOf(oldName);
  if (idx >= 0) meta.folders[idx] = newName;
  // update documentFolders map
  meta.documentFolders = meta.documentFolders || {};
  Object.keys(meta.documentFolders).forEach((k) => {
    if (meta.documentFolders[k] === oldName) meta.documentFolders[k] = newName;
  });
  saveMeta(meta);
  return meta.folders;
});

ipcMain.handle("folders:delete", async (_, name) => {
  ensureDataDir();
  const meta = getMeta();
  meta.folders = (meta.folders || []).filter((f) => f !== name);
  meta.documentFolders = meta.documentFolders || {};
  Object.keys(meta.documentFolders).forEach((k) => {
    if (meta.documentFolders[k] === name) meta.documentFolders[k] = null;
  });
  saveMeta(meta);
  return meta.folders;
});

ipcMain.handle("docs:setFolder", async (_, id, folder) => {
  ensureDataDir();
  const meta = getMeta();
  meta.documentFolders = meta.documentFolders || {};
  meta.documentFolders[id] = folder;
  saveMeta(meta);
  return true;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  if (!app.isPackaged) {
    win.loadURL("http://127.0.0.1:5173");
    return;
  }

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

