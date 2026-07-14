import {
  BrowserWindow,
  desktopCapturer,
  screen,
  ipcMain,
  app,
} from "electron"
import path from "node:path"

export type CaptureMode = "translate" | "math"

let selectorWindow: BrowserWindow | null = null
let currentMode: CaptureMode = "translate"

export function initScreenshotModule(
  onCaptured: (
    base64: string,
    rect: { x: number; y: number; width: number; height: number },
    mode: CaptureMode,
  ) => void,
) {
  ipcMain.on("screenshot:submit", async (_e, rect) => {
    console.log("[selector] submit rect:", JSON.stringify(rect), "mode:", currentMode)
    try {
      // Hide the selector overlay BEFORE capturing so it is not included
      // in the screenshot (otherwise the capture is a black/overlay image).
      selectorWindow?.hide()
      // Give the OS a moment to repaint the desktop after the overlay hides.
      await new Promise((r) => setTimeout(r, 200))
      const base64 = await captureRegion(rect)
      console.log("[selector] captured base64 len:", base64.length)
      onCaptured(base64, rect, currentMode)
    } catch (err) {
      console.error("[selector] capture failed:", err)
    }
  })

  ipcMain.on("screenshot:cancel", () => {
    console.log("[selector] cancel")
    selectorWindow?.hide()
  })
}

export async function startSelection(mode?: CaptureMode): Promise<void> {
  if (mode) currentMode = mode
  console.log("[selector] startSelection called, mode:", currentMode)
  if (selectorWindow && !selectorWindow.isDestroyed()) {
    console.log("[selector] reusing existing window")
    selectorWindow.show()
    selectorWindow.focus()
    return
  }

  const primary = screen.getPrimaryDisplay()
  const bounds = primary.bounds
  console.log("[selector] primary display bounds:", JSON.stringify(bounds))

  selectorWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    movable: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    show: false,
    fullscreen: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  selectorWindow.setAlwaysOnTop(true, "screen-saver")

  // Register listeners BEFORE loading so we catch all events
  selectorWindow.webContents.on("did-finish-load", () => {
    console.log("[selector] renderer did-finish-load")
  })
  selectorWindow.webContents.on("console-message", (_e, _level, message) => {
    console.log("[selector:renderer]", message)
  })

  const url = `file://${path.join(__dirname, "..", "renderer", "selector", "index.html")}`
  console.log("[selector] loading URL:", url)
  try {
    await selectorWindow.loadURL(url)
  } catch (e) {
    console.error("[selector] loadURL failed:", e)
  }
  console.log("[selector] loaded, showing window")

  selectorWindow.show()
  selectorWindow.focus()
  console.log("[selector] window shown, isVisible:", selectorWindow.isVisible(), "bounds:", JSON.stringify(selectorWindow.getBounds()))

  selectorWindow.on("closed", () => {
    selectorWindow = null
  })
}

async function captureRegion(rect: {
  x: number
  y: number
  width: number
  height: number
  displayId?: string
}): Promise<string> {
  const primary = screen.getPrimaryDisplay()
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: primary.size.width,
      height: primary.size.height,
    },
    fetchWindowIcons: false,
  })

  // Match display by id when provided; otherwise take the first (primary) source
  let source = rect.displayId
    ? sources.find((s) => s.display_id === String(rect.displayId))
    : undefined
  if (!source) {
    source = sources.find((s) => s.display_id === String(primary.id)) ?? sources[0]
  }
  if (!source) throw new Error("no screen source")

  const img = source.thumbnail
  if (!img || img.isEmpty()) throw new Error("captured thumbnail is empty")

  // thumbnail is already cropped to the display; crop further to the rect
  const scale = img.getSize().width / primary.size.width
  const cropX = Math.round(rect.x * scale)
  const cropY = Math.round(rect.y * scale)
  const cropW = Math.round(rect.width * scale)
  const cropH = Math.round(rect.height * scale)

  const cropped = img.crop({
    x: Math.max(0, cropX),
    y: Math.max(0, cropY),
    width: Math.max(1, cropW),
    height: Math.max(1, cropH),
  })
  return cropped.toPNG().toString("base64")
}

export function closeSelection(): void {
  if (selectorWindow && !selectorWindow.isDestroyed()) {
    selectorWindow.close()
    selectorWindow = null
  }
}

// allow app to clean up
app.on("before-quit", () => closeSelection())
