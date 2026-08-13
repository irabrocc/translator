import {
  BrowserWindow,
  desktopCapturer,
  screen,
  ipcMain,
  app,
} from "electron"
import path from "node:path"

export type CaptureMode = "translate" | "math"

export interface CaptureRect {
  x: number
  y: number
  width: number
  height: number
  displayId?: string
}

let selectorWindow: BrowserWindow | null = null
let currentMode: CaptureMode = "translate"
let captureInProgress = false

export function initScreenshotModule(
  onCaptured: (
    base64: string,
    rect: CaptureRect,
    mode: CaptureMode,
  ) => void,
  onCaptureError?: (
    error: Error,
    rect: CaptureRect | null,
    mode: CaptureMode,
  ) => void,
) {
  ipcMain.on("screenshot:submit", async (event, value: unknown) => {
    if (!isSelectorSender(event.sender)) return
    if (captureInProgress) return
    captureInProgress = true
    const mode = currentMode
    const rect = parseCaptureRect(value)
    console.log("[selector] submit rect:", JSON.stringify(rect), "mode:", currentMode)
    try {
      if (!rect) throw new Error("无效的截图区域")
      // Hide the selector overlay BEFORE capturing so it is not included
      // in the screenshot (otherwise the capture is a black/overlay image).
      selectorWindow?.hide()
      // Give the OS a moment to repaint the desktop after the overlay hides.
      await new Promise((r) => setTimeout(r, 200))
      const base64 = await captureRegion(rect)
      console.log("[selector] captured base64 len:", base64.length)
      onCaptured(base64, rect, mode)
    } catch (error: unknown) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      selectorWindow?.hide()
      console.error("[selector] capture failed:", normalized)
      onCaptureError?.(normalized, rect, mode)
    } finally {
      captureInProgress = false
    }
  })

  ipcMain.on("screenshot:cancel", (event) => {
    if (!isSelectorSender(event.sender)) return
    console.log("[selector] cancel")
    selectorWindow?.hide()
  })
}

export async function startSelection(mode?: CaptureMode): Promise<void> {
  if (captureInProgress) return
  if (mode) currentMode = mode
  console.log("[selector] startSelection called, mode:", currentMode)
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const bounds = display.bounds
  if (selectorWindow && !selectorWindow.isDestroyed()) {
    console.log("[selector] reusing existing window")
    selectorWindow.setBounds(bounds)
    selectorWindow.webContents.send("screenshot:reset")
    selectorWindow.show()
    selectorWindow.focus()
    return
  }

  console.log("[selector] display bounds:", JSON.stringify(bounds))

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
      sandbox: true,
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

  const file = path.join(__dirname, "..", "renderer", "selector", "index.html")
  console.log("[selector] loading file:", file)
  try {
    await selectorWindow.loadFile(file)
  } catch (error: unknown) {
    console.error(
      "[selector] loadFile failed:",
      error instanceof Error ? error.message : String(error),
    )
  }
  console.log("[selector] loaded, showing window")

  selectorWindow.show()
  selectorWindow.focus()
  console.log("[selector] window shown, isVisible:", selectorWindow.isVisible(), "bounds:", JSON.stringify(selectorWindow.getBounds()))

  selectorWindow.on("closed", () => {
    selectorWindow = null
  })
}

async function captureRegion(rect: CaptureRect): Promise<string> {
  const displays = screen.getAllDisplays()
  const display = rect.displayId
    ? displays.find((candidate) => String(candidate.id) === rect.displayId)
      ?? screen.getDisplayMatching(rect)
    : screen.getDisplayMatching(rect)
  const targetSize = {
    width: Math.max(1, Math.round(display.size.width * display.scaleFactor)),
    height: Math.max(1, Math.round(display.size.height * display.scaleFactor)),
  }
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: targetSize,
    fetchWindowIcons: false,
  })

  const displayIndex = displays.findIndex((candidate) => candidate.id === display.id)
  const source = sources.find((candidate) => candidate.display_id === String(display.id))
    ?? sources[displayIndex]
    ?? sources[0]
  if (!source) throw new Error("no screen source")

  const img = source.thumbnail
  if (!img || img.isEmpty()) throw new Error("captured thumbnail is empty")

  // Screen coordinates are DIP-based and may be negative on secondary
  // displays. Convert them to coordinates local to the selected thumbnail.
  const imageSize = img.getSize()
  const scaleX = imageSize.width / display.bounds.width
  const scaleY = imageSize.height / display.bounds.height
  const localLeft = rect.x - display.bounds.x
  const localTop = rect.y - display.bounds.y
  const cropX = clamp(Math.floor(localLeft * scaleX), 0, imageSize.width - 1)
  const cropY = clamp(Math.floor(localTop * scaleY), 0, imageSize.height - 1)
  const cropRight = clamp(
    Math.ceil((localLeft + rect.width) * scaleX),
    cropX + 1,
    imageSize.width,
  )
  const cropBottom = clamp(
    Math.ceil((localTop + rect.height) * scaleY),
    cropY + 1,
    imageSize.height,
  )

  const cropped = img.crop({
    x: cropX,
    y: cropY,
    width: cropRight - cropX,
    height: cropBottom - cropY,
  })
  return cropped.toPNG().toString("base64")
}

function parseCaptureRect(value: unknown): CaptureRect | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<Record<keyof CaptureRect, unknown>>
  const numbers = [candidate.x, candidate.y, candidate.width, candidate.height]
  if (!numbers.every((number) => typeof number === "number" && Number.isFinite(number))) {
    return null
  }
  if ((candidate.width as number) <= 0 || (candidate.height as number) <= 0) {
    return null
  }
  return {
    x: candidate.x as number,
    y: candidate.y as number,
    width: candidate.width as number,
    height: candidate.height as number,
    displayId: typeof candidate.displayId === "string" ? candidate.displayId : undefined,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function isSelectorSender(sender: Electron.WebContents): boolean {
  return Boolean(
    selectorWindow
      && !selectorWindow.isDestroyed()
      && sender === selectorWindow.webContents,
  )
}

export function closeSelection(): void {
  if (selectorWindow && !selectorWindow.isDestroyed()) {
    selectorWindow.close()
    selectorWindow = null
  }
}

// allow app to clean up
app.on("before-quit", () => closeSelection())
