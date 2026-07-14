import { contextBridge, ipcRenderer } from "electron"

const api = {
  screenshot: {
    start: () => ipcRenderer.send("screenshot:start"),
    submit: (rect: {
      x: number
      y: number
      width: number
      height: number
      displayId: string
    }) => ipcRenderer.send("screenshot:submit", rect),
    cancel: () => ipcRenderer.send("screenshot:cancel"),
  },
  overlay: {
    close: () => ipcRenderer.send("overlay:close"),
    copy: (text: string) => ipcRenderer.send("overlay:copy", text),
  },
  math: {
    close: () => ipcRenderer.send("math:close"),
    copy: (text: string) => ipcRenderer.send("math:copy", text),
    save: (content: string, format: string) =>
      ipcRenderer.invoke("math:save", content, format),
    setFormat: (format: string) => ipcRenderer.send("math:set-format", format),
    onResult: (
      cb: (r: {
        markdown: string
        latex: string
        loading?: boolean
        error?: string
        defaultFormat?: string
      }) => void,
    ) => ipcRenderer.on("math:result", (_e, r) => cb(r)),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (patch: any) => ipcRenderer.invoke("settings:set", patch),
    reset: () => ipcRenderer.invoke("settings:reset"),
  },
  tray: {
    onUpdate: (cb: (info: { source: string; target: string }) => void) =>
      ipcRenderer.on("tray:update", (_e, info) => cb(info)),
  },
  openExternal: (url: string) => ipcRenderer.send("open-external", url),
  onOverlayResult: (
    cb: (r: {
      detected: string
      recognized: string
      translated: string
      sourceLabel: string
      targetLabel: string
      error?: string
    }) => void,
  ) => ipcRenderer.on("overlay:result", (_e, r) => cb(r)),
  status: {
    onUpdate: (cb: (info: { model: string; quick: boolean }) => void) =>
      ipcRenderer.on("status:update", (_e, info) => cb(info)),
    get: () => ipcRenderer.invoke("status:get"),
  },
}

contextBridge.exposeInMainWorld("bridge", api)
