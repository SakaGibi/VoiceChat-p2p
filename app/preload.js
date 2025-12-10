const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    getUserName: () => ipcRenderer.invoke("get-username")
});
