const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appInfo", {
  name: "my-graph"
});

contextBridge.exposeInMainWorld("api", {
  docs: {
    list: () => ipcRenderer.invoke("docs:list"),
    get: (id) => ipcRenderer.invoke("docs:get", id),
    save: (id, payload) => ipcRenderer.invoke("docs:save", id, payload),
    delete: (id) => ipcRenderer.invoke("docs:delete", id)
  },
  folders: {
    list: () => ipcRenderer.invoke("folders:list"),
    create: (name) => ipcRenderer.invoke("folders:create", name),
    rename: (oldName, newName) => ipcRenderer.invoke("folders:rename", oldName, newName),
    delete: (name) => ipcRenderer.invoke("folders:delete", name)
  },
  tags: {
    getForDoc: (id) => ipcRenderer.invoke("tags:getForDoc", id),
    setForDoc: (id, tags) => ipcRenderer.invoke("tags:setForDoc", id, tags),
    getAll: () => ipcRenderer.invoke("tags:getAll")
  }
});

