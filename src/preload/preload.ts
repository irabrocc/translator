import { contextBridge, ipcRenderer } from "electron"

const api = {
  screenshot: {
    submit: (rect: {
      x: number
      y: number
      width: number
      height: number
      displayId?: string
    }) => ipcRenderer.sendSync("screenshot:submit", rect),
    cancel: () => ipcRenderer.send("screenshot:cancel"),
    onReset: (cb: () => void) =>
      ipcRenderer.on("screenshot:reset", () => cb()),
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
    set: (patch: unknown) => ipcRenderer.invoke("settings:set", patch),
    reset: () => ipcRenderer.invoke("settings:reset"),
  },
  openExternal: () => ipcRenderer.send("open-external"),
  onOverlayResult: (
    cb: (r: {
      detected: string
      recognized: string
      translated: string
      sourceLabel: string
      targetLabel: string
      loading?: boolean
      error?: string
    }) => void,
  ) => ipcRenderer.on("overlay:result", (_e, r) => cb(r)),
}

contextBridge.exposeInMainWorld("bridge", api)
