import {
  BrowserWindow,
  desktopCapturer,
  screen,
  ipcMain,
  app,
  nativeImage,
} from "electron"
import path from "node:path"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"

export type CaptureMode = "translate" | "math"

export interface CaptureRect {
  x: number
  y: number
  width: number
  height: number
  displayId?: string
}

let selectorWindow: BrowserWindow | null = null
let selectorWindowReady: Promise<void> | null = null
let currentMode: CaptureMode = "translate"
let captureInProgress = false
let selectionPreparing = false
let selectionSnapshot: {
  displayId: number
  image: Electron.NativeImage
} | null = null
const CAPTURE_TIMEOUT_MS = 15_000

const WINDOWS_CAPTURE_HELPER_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ScreenshotTranslatorDpi {
    [DllImport("user32.dll")]
    public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
}
'@
[void][ScreenshotTranslatorDpi]::SetProcessDpiAwarenessContext([IntPtr](-4))
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::WriteLine("READY")

while (($line = [Console]::ReadLine()) -ne $null) {
  $bitmap = $null
  $graphics = $null
  $stream = $null
  try {
    $request = $line.Split('|')
    $id = [int]$request[0]
    $width = [int]$request[3]
    $height = [int]$request[4]
    if ($width -le 0 -or $height -le 0) { throw "invalid capture size" }
    $bitmap = New-Object Drawing.Bitmap($width, $height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen([int]$request[1], [int]$request[2], 0, 0, $bitmap.Size, [Drawing.CopyPixelOperation]::SourceCopy)
    $graphics.Dispose()
    $graphics = $null
    $stream = New-Object IO.MemoryStream
    $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
    $response = "OK|$id|$([Convert]::ToBase64String($stream.ToArray()))"
  } catch {
    $errorBytes = [Text.Encoding]::UTF8.GetBytes($_.Exception.Message)
    $response = "ERR|$id|$([Convert]::ToBase64String($errorBytes))"
  } finally {
    if ($graphics) { $graphics.Dispose() }
    if ($stream) { $stream.Dispose() }
    if ($bitmap) { $bitmap.Dispose() }
  }
  [Console]::WriteLine($response)
}
`

interface PendingHelperCapture {
  resolve: (image: Electron.NativeImage) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let captureHelper: ChildProcessWithoutNullStreams | null = null
let captureHelperReady = false
let captureHelperStart: Promise<void> | null = null
let captureHelperOutput = ""
let captureHelperRequestId = 0
const pendingHelperCaptures = new Map<number, PendingHelperCapture>()

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
  if (process.platform === "win32") {
    void ensureWindowsCaptureHelper().catch((error: unknown) => {
      console.error("[capture-helper] warmup failed:", errorMessage(error))
    })
  }
  void prepareSelectorWindow().catch((error: unknown) => {
    console.error("[selector] warmup failed:", errorMessage(error))
  })

  const finishCapture = async (
    rect: CaptureRect,
    mode: CaptureMode,
    snapshot: { displayId: number; image: Electron.NativeImage } | null,
  ) => {
    console.log("[selector] submit rect:", JSON.stringify(rect), "mode:", currentMode)
    try {
      const base64 = await captureRegion(rect, snapshot)
      console.log("[selector] captured base64 len:", base64.length)
      onCaptured(base64, rect, mode)
    } catch (error: unknown) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      selectorWindow?.hide()
      console.error("[selector] capture failed:", normalized)
      onCaptureError?.(normalized, rect, mode)
    } finally {
      if (selectorWindow && !selectorWindow.isDestroyed()) {
        selectorWindow.hide()
      }
      captureInProgress = false
    }
  }

  ipcMain.on("screenshot:submit", (event, value: unknown) => {
    if (!isSelectorSender(event.sender) || captureInProgress) {
      event.returnValue = false
      return
    }
    const mode = currentMode
    const rect = parseCaptureRect(value)
    if (!rect) {
      selectorWindow?.hide()
      event.returnValue = false
      setImmediate(() => onCaptureError?.(new Error("无效的截图区域"), null, mode))
      return
    }

    captureInProgress = true
    const snapshot = selectionSnapshot
    selectionSnapshot = null
    // This synchronous hide is the only work done before replying to the
    // renderer. Cropping and OCR remain asynchronous, while the underlying
    // page can receive the very next mouse-wheel/middle-button event.
    selectorWindow?.hide()
    event.returnValue = true
    setImmediate(() => void finishCapture(rect, mode, snapshot))
  })

  ipcMain.on("screenshot:cancel", (event) => {
    if (!isSelectorSender(event.sender)) return
    console.log("[selector] cancel")
    selectionSnapshot = null
    selectorWindow?.hide()
  })
}

export async function startSelection(mode?: CaptureMode): Promise<void> {
  if (captureInProgress || selectionPreparing) return
  if (mode) currentMode = mode
  console.log("[selector] startSelection called, mode:", currentMode)
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const bounds = display.bounds

  if (selectorWindow && !selectorWindow.isDestroyed() && selectorWindow.isVisible()) {
    selectorWindow.webContents.send("screenshot:reset")
    selectorWindow.focus()
    return
  }

  selectionPreparing = true
  selectionSnapshot = null
  try {
    const started = Date.now()
    selectionSnapshot = {
      displayId: display.id,
      image: await captureDisplay(display),
    }
    console.log("[selector] desktop frozen in", Date.now() - started, "ms")
  } finally {
    selectionPreparing = false
  }

  if (selectorWindow && !selectorWindow.isDestroyed()) {
    await selectorWindowReady
  } else {
    await prepareSelectorWindow(bounds)
  }
  const win = selectorWindow
  if (!win || win.isDestroyed()) throw new Error("截图选择窗口不可用")
  console.log("[selector] showing prepared window")
  win.setBounds(bounds)
  win.webContents.send("screenshot:reset")
  win.show()
  win.focus()
  console.log("[selector] window shown, isVisible:", win.isVisible(), "bounds:", JSON.stringify(win.getBounds()))
}

function prepareSelectorWindow(bounds = screen.getPrimaryDisplay().bounds): Promise<void> {
  if (selectorWindow && !selectorWindow.isDestroyed() && selectorWindowReady) {
    return selectorWindowReady
  }

  console.log("[selector] preparing window, bounds:", JSON.stringify(bounds))
  const win = new BrowserWindow({
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
  selectorWindow = win
  win.setAlwaysOnTop(true, "screen-saver")

  // Register listeners BEFORE loading so we catch all events
  win.webContents.on("did-finish-load", () => {
    console.log("[selector] renderer did-finish-load")
  })
  win.webContents.on("console-message", (_e, _level, message) => {
    console.log("[selector:renderer]", message)
  })

  const file = path.join(__dirname, "..", "renderer", "selector", "index.html")
  console.log("[selector] loading file:", file)
  selectorWindowReady = win.loadFile(file).then(() => {
    console.log("[selector] prepared")
  }).catch((error: unknown) => {
    console.error("[selector] loadFile failed:", errorMessage(error))
    throw error
  })

  win.on("closed", () => {
    if (selectorWindow === win) {
      selectorWindow = null
      selectorWindowReady = null
    }
  })
  return selectorWindowReady
}

async function captureDisplay(display: Electron.Display): Promise<Electron.NativeImage> {
  if (process.platform === "win32") {
    try {
      return await captureWindowsDisplay(display)
    } catch (error: unknown) {
      console.error("[capture-helper] capture failed, using Electron fallback:", errorMessage(error))
    }
  }

  return captureDisplayWithElectron(display)
}

async function captureDisplayWithElectron(display: Electron.Display): Promise<Electron.NativeImage> {
  const displays = screen.getAllDisplays()
  const targetSize = {
    width: Math.max(1, Math.round(display.size.width * display.scaleFactor)),
    height: Math.max(1, Math.round(display.size.height * display.scaleFactor)),
  }
  const sources = await withTimeout(
    desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: targetSize,
      fetchWindowIcons: false,
    }),
    CAPTURE_TIMEOUT_MS,
    "屏幕捕获超时，请重试",
  )
  const displayIndex = displays.findIndex((candidate) => candidate.id === display.id)
  const source = sources.find((candidate) => candidate.display_id === String(display.id))
    ?? sources[displayIndex]
    ?? sources[0]
  if (!source) throw new Error("no screen source")
  if (!source.thumbnail || source.thumbnail.isEmpty()) {
    throw new Error("captured thumbnail is empty")
  }
  return source.thumbnail
}

async function captureRegion(
  rect: CaptureRect,
  snapshot?: { displayId: number; image: Electron.NativeImage } | null,
): Promise<string> {
  const displays = screen.getAllDisplays()
  const display = rect.displayId
    ? displays.find((candidate) => String(candidate.id) === rect.displayId)
      ?? screen.getDisplayMatching(rect)
    : screen.getDisplayMatching(rect)
  const img = snapshot?.displayId === display.id
    ? snapshot.image
    : await captureDisplay(display)
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function ensureWindowsCaptureHelper(): Promise<void> {
  if (captureHelper && captureHelperReady && !captureHelper.killed) {
    return Promise.resolve()
  }
  if (captureHelperStart) return captureHelperStart

  captureHelperStart = new Promise<void>((resolve, reject) => {
    const encodedScript = Buffer.from(WINDOWS_CAPTURE_HELPER_SCRIPT, "utf16le").toString("base64")
    const child = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-OutputFormat",
        "Text",
        "-EncodedCommand",
        encodedScript,
      ],
      { windowsHide: true },
    )
    captureHelper = child
    captureHelperOutput = ""
    let startSettled = false

    const failStart = (error: Error) => {
      if (startSettled) return
      startSettled = true
      captureHelperStart = null
      reject(error)
    }

    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      captureHelperOutput += chunk
      let newline = captureHelperOutput.indexOf("\n")
      while (newline >= 0) {
        const line = captureHelperOutput.slice(0, newline).trim()
        captureHelperOutput = captureHelperOutput.slice(newline + 1)
        if (line === "READY") {
          captureHelperReady = true
          if (!startSettled) {
            startSettled = true
            resolve()
          }
        } else if (line) {
          handleCaptureHelperResponse(line)
        }
        newline = captureHelperOutput.indexOf("\n")
      }
    })
    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => {
      const message = chunk.trim()
      if (message && message !== "#< CLIXML") {
        console.error("[capture-helper]", message)
      }
    })
    child.once("error", (error) => {
      failStart(error)
      rejectAllHelperCaptures(error)
    })
    child.once("exit", (code) => {
      const error = new Error(`Windows capture helper exited (${code ?? "unknown"})`)
      captureHelper = null
      captureHelperReady = false
      captureHelperStart = null
      failStart(error)
      rejectAllHelperCaptures(error)
    })
  })
  return captureHelperStart
}

async function captureWindowsDisplay(display: Electron.Display): Promise<Electron.NativeImage> {
  await ensureWindowsCaptureHelper()
  const helper = captureHelper
  if (!helper || !captureHelperReady || helper.killed) {
    throw new Error("Windows capture helper is unavailable")
  }

  const origin = screen.dipToScreenPoint({ x: display.bounds.x, y: display.bounds.y })
  const id = ++captureHelperRequestId
  const width = Math.max(1, Math.round(display.bounds.width * display.scaleFactor))
  const height = Math.max(1, Math.round(display.bounds.height * display.scaleFactor))

  return new Promise<Electron.NativeImage>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingHelperCaptures.delete(id)
      reject(new Error("Windows 屏幕捕获超时"))
    }, CAPTURE_TIMEOUT_MS)
    pendingHelperCaptures.set(id, { resolve, reject, timer })
    helper.stdin.write(`${id}|${origin.x}|${origin.y}|${width}|${height}\n`, "utf8", (error) => {
      if (!error) return
      const pending = pendingHelperCaptures.get(id)
      if (!pending) return
      clearTimeout(pending.timer)
      pendingHelperCaptures.delete(id)
      pending.reject(error)
    })
  })
}

function handleCaptureHelperResponse(line: string): void {
  const firstSeparator = line.indexOf("|")
  const secondSeparator = line.indexOf("|", firstSeparator + 1)
  if (firstSeparator <= 0 || secondSeparator <= firstSeparator) {
    console.error("[capture-helper] invalid response header")
    return
  }
  const status = line.slice(0, firstSeparator)
  const id = Number(line.slice(firstSeparator + 1, secondSeparator))
  const payload = line.slice(secondSeparator + 1)
  const pending = pendingHelperCaptures.get(id)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingHelperCaptures.delete(id)
  if (status !== "OK" || !payload) {
    const message = payload
      ? Buffer.from(payload, "base64").toString("utf8")
      : "Windows 屏幕捕获失败"
    pending.reject(new Error(message))
    return
  }
  const image = nativeImage.createFromBuffer(Buffer.from(payload, "base64"))
  if (image.isEmpty()) {
    pending.reject(new Error("Windows 屏幕捕获返回空图像"))
    return
  }
  pending.resolve(image)
}

function rejectAllHelperCaptures(error: Error): void {
  for (const pending of pendingHelperCaptures.values()) {
    clearTimeout(pending.timer)
    pending.reject(error)
  }
  pendingHelperCaptures.clear()
}

function stopWindowsCaptureHelper(): void {
  const error = new Error("Windows capture helper stopped")
  rejectAllHelperCaptures(error)
  captureHelperReady = false
  captureHelperStart = null
  captureHelper?.kill()
  captureHelper = null
}

function isSelectorSender(sender: Electron.WebContents): boolean {
  return Boolean(
    selectorWindow
      && !selectorWindow.isDestroyed()
      && sender === selectorWindow.webContents,
  )
}

export function closeSelection(): void {
  selectionSnapshot = null
  if (selectorWindow && !selectorWindow.isDestroyed()) {
    selectorWindow.close()
    selectorWindow = null
    selectorWindowReady = null
  }
}

// allow app to clean up
app.on("before-quit", () => {
  closeSelection()
  stopWindowsCaptureHelper()
})

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
