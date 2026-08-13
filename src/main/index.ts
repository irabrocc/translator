import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
  ipcMain,
  shell,
  clipboard,
  screen,
  dialog,
  Notification,
} from "electron"
import path from "node:path"
import fs from "node:fs"
import {
  AVAILABLE_MODELS,
  getSettings,
  setSettings,
  resetSettings,
} from "./store"
import {
  cycleLanguage,
  findLanguage,
} from "./languages"
import { translateScreenshot, parseMath } from "./api"
import {
  initScreenshotModule,
  startSelection,
  closeSelection,
  CaptureMode,
  CaptureRect,
} from "./screenshot"

type CaptureBounds = Pick<CaptureRect, "x" | "y" | "width" | "height">

interface OverlayResultData {
  detected: string
  recognized: string
  translated: string
  sourceLabel: string
  targetLabel: string
  loading?: boolean
  error?: string
}

interface MathResultData {
  markdown: string
  latex: string
  loading?: boolean
  error?: string
  defaultFormat?: "md" | "tex"
}

const IS_LINUX = process.platform === "linux"

const MODE_TRAY_ICONS = {
  quick: {
    oneX: "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAADsSURBVDhPY2CgNtCf72qgO98pQXe+cwMqdkoAyaGrhwP9+fYCuguctustcP6PHzsd15lvr4Gun0FvgdN+ZIUWS3z+R2zORMFI8tfl59tzwDXrznexQLcJpAEEHn588n/vw8NgjCyvM98pAMkApwJcBrSdmIQiDsOgcEEywLkBXQHMgAVXVoLZvuviyTMA5oVJZ+eSZwDFXiDKAL35jhXoCkB+Bjk9b28thmYsBjh7oCsghEEpE24AKFHoLnC+j64ID/6uNd9eAm4ACEAT03MsitHxd735ThEommEAnB/mOxVgZiR4hirAsJlSAABJ1nfwF4U31wAAAABJRU5ErkJggg==",
    twoX: "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAFjSURBVFhH7ZctTANBEIUrkUgcSNJ095B1BzPgIEHWUQmuEllXj0GRWUGCwyBQBIFAoZEEhUQijww0zd27vZZrd5vmwks+0eybzrufvcy2WqusjqTbRqhvhIfzQf1EDnbwf6dqU9I143hkHX9Zx1kojOObtqQb2K8gTWsdv2JxQD4S4V3s+6Pxlb95ioJiHH9674RxfInmWBhH94XmevWhn/ksEkm3JgHGz75kiklH6HgSwAgN0BAb3aa5ADxEg4+j25Ps4f1pKurBOh9zBejdnWWzpB6s89GMAPob6V4flup8BAmA63VoRgDcARcvV6WaKoIEQGkIrKmiGQFwB/z1I6QECYDrdfgPsFoBrOydo8FHtAA6KKLBh37n8289rtdBR/ZcgHQdDbEpnReso0c0xUKn70JzlZ6CljWYVp4NrFAvdgidP7FvQb93gp6xMADVpyKfjOx3rdCpbpfFoEGtxsvWN46uM7mFtoOuAAAAAElFTkSuQmCC",
  },
  thinking: {
    oneX: "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAADVSURBVDhPY2CgNrhZwmpwvZw14WY5awMyBouVsBqgq4eD+/kMAjfLWbffLGf7TwAfv1HJpoGun+FmGdt+mKKHkyww8P1ubYQhZazX79czcMA1XytjsUC25fOVDWAMAyD26x21KC65UcoWADfgRhlbARanwjWji0MwawPcAEhAoSsYWQbcKGerwFQAiQ300MduQAm7B6YC/BiUMuEGgBLFzTLW++iKcOEbZWzfr5RwScANAAFIYmJ9jq4YHYM03yxjjUDRDAOg/ABJVKgZCYZBchg2UwoAEzSkNmGupwkAAAAASUVORK5CYII=",
    twoX: "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAFkSURBVFhHY2AYzOBGJZvG9XLWhJvlrA3kYLDeElYDdHPxgvv1DBw3y1jbb5Sxfb9ZzvafWvhGOdvyKyVcEuj2oQCQa2+WsV5H10w9zPr8ejm7A7q9YAD1+X1MTdTFN8rZ3mMNiZvlbNPRFdMOs25HsRzke2rHOSF8vZxdAeF7UNxjUURLfKOULQDugBtlbAXoCmiPWRsQIQDOt+gKUPHrHbX/P1/ZQDRG14+JSXQAyFBSALp+TDzUHHC/W/v/w0kWcPzuYB/csm/3j6DIgTC6fkxMogPQ8csNeXAHEBfn6HjUAaMOGHXAqAMGkwNulLNVYCrAj6nqAFBDEVMBfny3RQ5e7oPqCXR5QhjUZIc74H4+gwC6Appj9P7CzTK2/RiKaIXLWO+jWA4CoF4QvRqmOPsGN8tYI2jtCFD7E91eFAAKiZvlbMfRNVKO8fSKsIFrZSwW10tZMiBlBPkY5GOSLKY3AAAZAvwtBptmOAAAAABJRU5ErkJggg==",
  },
} as const

app.setName("Screenshot Translator")
if (process.platform === "win32") {
  app.setAppUserModelId("ai.opencode.screenshot-translator")
}
if (IS_LINUX) {
  // Electron 36+ defaults to GTK 4 on GNOME, while Ubuntu's Ayatana
  // AppIndicator integration currently uses GTK 3. Keep the native tray on
  // the GNOME top bar instead of falling back to an invisible GtkStatusIcon.
  app.commandLine.appendSwitch("gtk-version", "3")
}
if (IS_LINUX && process.env.XDG_SESSION_TYPE?.toLowerCase() === "x11") {
  // Electron normally auto-detects X11; pinning Ozone here avoids selecting a
  // Wayland backend when the app is launched from a desktop entry on X11.
  app.commandLine.appendSwitch("ozone-platform", "x11")
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (app.isReady()) openSettings()
  })
}

let tray: Tray | null = null
let overlayWindow: BrowserWindow | null = null
let mathWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let pendingOverlayData: OverlayResultData | null = null
let pendingMathData: MathResultData | null = null
let translationRequestId = 0
let mathRequestId = 0
let translationAbortController: AbortController | null = null
let mathAbortController: AbortController | null = null

// Captures start without reasoning; users can toggle thinking mode at runtime.
let quickMode = true

function getAsset(name: string): string {
  return path.join(__dirname, "..", "..", "assets", name)
}

function makeTrayIcon(): Electron.NativeImage {
  if (process.platform === "win32") {
    const iconData = quickMode ? MODE_TRAY_ICONS.quick : MODE_TRAY_ICONS.thinking
    const image = nativeImage.createFromDataURL(`data:image/png;base64,${iconData.oneX}`)
    image.addRepresentation({
      scaleFactor: 2,
      dataURL: `data:image/png;base64,${iconData.twoX}`,
    })
    if (!image.isEmpty()) return image
  }
  const preferred = IS_LINUX ? "tray-icon-linux.png" : "tray-icon.png"
  const image = nativeImage.createFromPath(getAsset(preferred))
  if (!image.isEmpty()) return image
  return nativeImage.createFromPath(getAsset("tray-icon.png"))
}

function loadRenderer(win: BrowserWindow, page: string): void {
  const file = path.join(__dirname, "..", "renderer", page, "index.html")
  void win.loadFile(file).catch((error: unknown) => {
    console.error(`[${page}] failed to load renderer:`, errorMessage(error))
  })
}

function showNotification(title: string, body: string, silent = false): void {
  if (!Notification.isSupported()) return
  new Notification({ title, body, silent }).show()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function cancelTranslationRequest(): void {
  translationRequestId++
  translationAbortController?.abort()
  translationAbortController = null
}

function cancelMathRequest(): void {
  mathRequestId++
  mathAbortController?.abort()
  mathAbortController = null
}

function isWindowSender(
  sender: Electron.WebContents,
  win: BrowserWindow | null,
): boolean {
  return Boolean(win && !win.isDestroyed() && sender === win.webContents)
}

function assertWindowSender(
  sender: Electron.WebContents,
  win: BrowserWindow | null,
): void {
  if (!isWindowSender(sender, win)) throw new Error("Unauthorized IPC sender")
}

function updateTrayMenu() {
  if (!tray) return
  const s = getSettings()
  const src = findLanguage(s.sourceLanguages, s.currentSourceId)
  const tgt = findLanguage(s.targetLanguages, s.currentTargetId)
  const menu = Menu.buildFromTemplate([
    { label: `源语言: ${src.name}`, enabled: false },
    { label: `目标语言: ${tgt.name}`, enabled: false },
    { type: "separator" },
    {
      label: "截图翻译",
      click: () => triggerScreenshot(),
    },
    {
      label: "数学解析 (MD/TeX)",
      click: () => triggerMathCapture(),
    },
    {
      label: `模式: ${quickMode ? "快速 (F)" : "思考 (T)"} — 点击切换`,
      click: () => toggleQuickMode(),
    },
    {
      label: `模型: ${s.model} — 点击切换`,
      click: () => cycleModel(),
    },
    {
      label: "切换源语言",
      click: () => cycleSource(),
    },
    {
      label: "切换目标语言",
      click: () => cycleTarget(),
    },
    { type: "separator" },
    {
      label: "设置...",
      click: () => openSettings(),
    },
    {
      label: "退出",
      click: () => app.quit(),
    },
  ])
  tray.setImage(makeTrayIcon())
  tray.setContextMenu(menu)
  tray.setToolTip(
    `截图翻译 · ${quickMode ? "快速" : "思考"} · ${s.model} · ${src.name} → ${tgt.name}`,
  )
}

function registerShortcuts() {
  const s = getSettings()
  globalShortcut.unregisterAll()
  const tryReg = (accel: string, fn: () => void): boolean => {
    if (!accel) return false
    let ok = false
    try {
      ok = globalShortcut.register(accel, fn)
    } catch (error: unknown) {
      console.error(`[shortcut] register ${accel} threw:`, errorMessage(error))
    }
    console.log(`[shortcut] register ${accel}: ${ok ? "OK" : "FAILED"}`)
    if (!ok) {
      showNotification(
        "快捷键注册失败",
        `无法注册: ${accel}，可能已被占用或格式无效。请在设置中修改。`,
      )
    }
    return ok
  }
  tryReg(s.shortcuts.screenshot, triggerScreenshot)
  if (s.shortcuts.quickScreenshot && s.shortcuts.quickScreenshot !== s.shortcuts.screenshot) {
    tryReg(s.shortcuts.quickScreenshot, toggleQuickMode)
  }
  if (s.shortcuts.math && s.shortcuts.math !== s.shortcuts.screenshot) {
    tryReg(s.shortcuts.math, triggerMathCapture)
  }
  tryReg(s.shortcuts.cycleModel, cycleModel)
  tryReg(s.shortcuts.cycleSource, cycleSource)
  tryReg(s.shortcuts.cycleTarget, cycleTarget)
}

function triggerScreenshot() {
  console.log("[screenshot] Alt+S triggered, quickMode:", quickMode)
  if (!getSettings().goApiKey) {
    console.log("[screenshot] no API key, opening settings")
    showNotification("未配置 API Key", "请先在设置中填入 OpenCode Go API Key。")
    openSettings()
    return
  }
  startSelection("translate").catch((error: unknown) => {
    const message = errorMessage(error)
    console.error("[screenshot] start selection failed", message)
    showNotification("截图启动失败", message)
  })
}

function triggerMathCapture() {
  console.log("[math] Alt+M triggered, quickMode:", quickMode)
  if (!getSettings().goApiKey) {
    console.log("[math] no API key, opening settings")
    showNotification("未配置 API Key", "请先在设置中填入 OpenCode Go API Key。")
    openSettings()
    return
  }
  startSelection("math").catch((error: unknown) => {
    const message = errorMessage(error)
    console.error("[math] start selection failed", message)
    showNotification("数学截图启动失败", message)
  })
}

function toggleQuickMode() {
  quickMode = !quickMode
  console.log("[mode] quickMode toggled to:", quickMode)
  updateTrayMenu()
  showNotification(
    quickMode ? "快速模式" : "思考模式",
    quickMode ? "已切换至快速模式（无思考）。" : "已切换至思考模式。",
    true,
  )
}

function cycleSource() {
  const s = getSettings()
  const cur = findLanguage(s.sourceLanguages, s.currentSourceId)
  const next = cycleLanguage(s.sourceLanguages, cur.id)
  setSettings({ currentSourceId: next.id })
  updateTrayMenu()
  notifyLangChange("源语言", next.name)
}

function cycleModel() {
  const current = getSettings().model
  const currentIndex = AVAILABLE_MODELS.indexOf(
    current as (typeof AVAILABLE_MODELS)[number],
  )
  const next = AVAILABLE_MODELS[(currentIndex + 1) % AVAILABLE_MODELS.length]
  setSettings({ model: next })
  console.log(`[model] switched from ${current} to ${next}`)
  updateTrayMenu()
  showNotification("模型已切换", next, true)
}

function cycleTarget() {
  const s = getSettings()
  const cur = findLanguage(s.targetLanguages, s.currentTargetId)
  const next = cycleLanguage(s.targetLanguages, cur.id)
  setSettings({ currentTargetId: next.id })
  updateTrayMenu()
  notifyLangChange("目标语言", next.name)
}

function notifyLangChange(kind: string, name: string) {
  showNotification(kind, name, true)
}

function positionResultWindow(
  win: BrowserWindow,
  near: CaptureBounds,
): void {
  const display = screen.getDisplayMatching(near)
  const workArea = display.workArea
  const margin = 8
  const [currentWidth, currentHeight] = win.getSize()
  const width = Math.min(currentWidth, Math.max(win.getMinimumSize()[0], workArea.width - margin * 2))
  const height = Math.min(currentHeight, Math.max(win.getMinimumSize()[1], workArea.height - margin * 2))

  let x = near.x + near.width + margin
  let y = near.y
  if (x + width > workArea.x + workArea.width - margin) {
    x = near.x - width - margin
  }
  x = Math.max(
    workArea.x + margin,
    Math.min(x, workArea.x + workArea.width - width - margin),
  )
  y = Math.max(
    workArea.y + margin,
    Math.min(y, workArea.y + workArea.height - height - margin),
  )

  win.setBounds({ x, y, width, height })
}

function ensureOverlay(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow
  overlayWindow = new BrowserWindow({
    width: 360,
    height: 220,
    frame: false,
    transparent: false,
    resizable: true,
    minWidth: 280,
    minHeight: 180,
    skipTaskbar: IS_LINUX,
    show: false,
    title: "翻译结果",
    backgroundColor: "#1e1e2e",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  loadRenderer(overlayWindow, "overlay")
  overlayWindow.webContents.once("did-finish-load", () => {
    console.log("[overlay] renderer did-finish-load")
    overlayWindow?.webContents.on("console-message", (_e, _level, msg) => {
      console.log("[overlay:renderer]", msg)
    })
    if (pendingOverlayData) {
      console.log("[overlay] sending pending data after load")
      overlayWindow?.webContents.send("overlay:result", pendingOverlayData)
      pendingOverlayData = null
    }
  })
  overlayWindow.on("closed", () => {
    overlayWindow = null
  })
  return overlayWindow
}

function sendToOverlay(data: OverlayResultData): void {
  const win = ensureOverlay()
  if (win.webContents.isLoading()) {
    pendingOverlayData = data
  } else {
    win.webContents.send("overlay:result", data)
  }
}

function showOverlayLoading(near: CaptureBounds): void {
  console.log("[overlay] showOverlayLoading near:", JSON.stringify(near))
  const win = ensureOverlay()
  positionResultWindow(win, near)
  win.show()
  win.focus()
  win.moveTop()
  console.log("[overlay] window shown, isVisible:", win.isVisible(), "bounds:", JSON.stringify(win.getBounds()))
  sendToOverlay({
    detected: "",
    recognized: "",
    translated: "",
    sourceLabel: "",
    targetLabel: "",
    loading: true,
  })
}

function showOverlayResult(r: OverlayResultData): void {
  console.log("[overlay] showOverlayResult, recognized len:", r.recognized.length, "translated len:", r.translated.length, "error:", r.error ?? "none")
  const win = ensureOverlay()
  if (!win.isVisible()) {
    win.show()
    win.focus()
    win.moveTop()
  }
  sendToOverlay({ ...r, loading: false })
}

function ensureMathWindow(): BrowserWindow {
  if (mathWindow && !mathWindow.isDestroyed()) return mathWindow
  mathWindow = new BrowserWindow({
    width: 580,
    height: 460,
    frame: false,
    transparent: false,
    resizable: true,
    minWidth: 360,
    minHeight: 240,
    skipTaskbar: IS_LINUX,
    show: false,
    title: "数学解析结果",
    backgroundColor: "#1e1e2e",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  loadRenderer(mathWindow, "math")
  mathWindow.webContents.once("did-finish-load", () => {
    console.log("[math] renderer did-finish-load")
    mathWindow?.webContents.on("console-message", (_e, _level, msg) => {
      console.log("[math:renderer]", msg)
    })
    if (pendingMathData) {
      console.log("[math] sending pending data after load")
      mathWindow?.webContents.send("math:result", pendingMathData)
      pendingMathData = null
    }
  })
  mathWindow.on("closed", () => {
    mathWindow = null
  })
  return mathWindow
}

function sendToMath(data: MathResultData): void {
  const win = ensureMathWindow()
  if (win.webContents.isLoading()) {
    pendingMathData = data
  } else {
    win.webContents.send("math:result", data)
  }
}

function showMathLoading(near: CaptureBounds): void {
  console.log("[math] showMathLoading near:", JSON.stringify(near))
  const win = ensureMathWindow()
  positionResultWindow(win, near)
  win.show()
  win.focus()
  win.moveTop()
  sendToMath({
    markdown: "",
    latex: "",
    loading: true,
    defaultFormat: getSettings().math.outputFormat,
  })
}

function showMathResult(r: MathResultData): void {
  console.log("[math] showMathResult, md len:", r.markdown.length, "tex len:", r.latex.length, "error:", r.error ?? "none")
  const win = ensureMathWindow()
  if (!win.isVisible()) {
    win.show()
    win.focus()
    win.moveTop()
  }
  sendToMath({
    ...r,
    loading: false,
    defaultFormat: getSettings().math.outputFormat,
  })
}

async function onMathCaptured(
  base64: string,
  rect: CaptureBounds,
) {
  console.log("[onMathCaptured] rect:", JSON.stringify(rect), "base64 len:", base64.length)
  cancelMathRequest()
  const requestId = mathRequestId
  const controller = new AbortController()
  mathAbortController = controller
  const s = getSettings()
  showMathLoading(rect)
  try {
    const quick = quickMode
    console.log("[onMathCaptured] calling API, model:", s.model, "quickMode:", quick)
    const res = await parseMath(base64, {
      apiKey: s.goApiKey,
      endpoint: s.endpoint,
      model: s.model,
      quickMode: quick,
      signal: controller.signal,
    })
    if (requestId !== mathRequestId) return
    console.log("[onMathCaptured] API result: md len:", res.markdown.length, "tex len:", res.latex.length)
    showMathResult({ markdown: res.markdown, latex: res.latex })
  } catch (error: unknown) {
    if (requestId !== mathRequestId) return
    const message = errorMessage(error)
    console.error("[onMathCaptured] API error:", message)
    showMathResult({
      markdown: "",
      latex: "",
      error: message,
    })
  } finally {
    if (mathAbortController === controller) mathAbortController = null
  }
}

async function onCaptured(
  base64: string,
  rect: CaptureBounds,
) {
  console.log("[onCaptured] rect:", JSON.stringify(rect), "base64 len:", base64.length)
  cancelTranslationRequest()
  const requestId = translationRequestId
  const controller = new AbortController()
  translationAbortController = controller
  const s = getSettings()
  showOverlayLoading(rect)
  try {
    const src = findLanguage(s.sourceLanguages, s.currentSourceId)
    const tgt = findLanguage(s.targetLanguages, s.currentTargetId)
    const quick = quickMode
    console.log("[onCaptured] calling API, model:", s.model, "src:", src.name, "tgt:", tgt.name, "quickMode:", quick)
    const res = await translateScreenshot(base64, src, tgt, {
      apiKey: s.goApiKey,
      endpoint: s.endpoint,
      model: s.model,
      quickMode: quick,
      signal: controller.signal,
    })
    if (requestId !== translationRequestId) return
    console.log("[onCaptured] API result:", JSON.stringify(res).slice(0, 200))
    showOverlayResult({
      detected: res.detected_language,
      recognized: res.recognized,
      translated: res.translated,
      sourceLabel: src.id === "auto" ? res.detected_language || "识别结果" : src.name,
      targetLabel: tgt.name,
    })
  } catch (error: unknown) {
    if (requestId !== translationRequestId) return
    const message = errorMessage(error)
    console.error("[onCaptured] API error:", message)
    showOverlayResult({
      detected: "",
      recognized: "",
      translated: "",
      sourceLabel: "",
      targetLabel: "",
      error: message,
    })
  } finally {
    if (translationAbortController === controller) {
      translationAbortController = null
    }
  }
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 640,
    height: 620,
    title: "设置",
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: IS_LINUX,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  loadRenderer(settingsWindow, "settings")
  settingsWindow.on("closed", () => {
    settingsWindow = null
    // re-register shortcuts in case they changed
    registerShortcuts()
    updateTrayMenu()
  })
}

function showCaptureError(
  error: Error,
  rect: CaptureRect | null,
  mode: CaptureMode,
): void {
  if (!rect) {
    showNotification("截图失败", error.message)
    return
  }
  if (mode === "math") {
    cancelMathRequest()
    showMathLoading(rect)
    showMathResult({ markdown: "", latex: "", error: error.message })
  } else {
    cancelTranslationRequest()
    showOverlayLoading(rect)
    showOverlayResult({
      detected: "",
      recognized: "",
      translated: "",
      sourceLabel: "",
      targetLabel: "",
      error: error.message,
    })
  }
}

function setupIpc() {
  initScreenshotModule((base64, rect, mode: CaptureMode) => {
    if (mode === "math") onMathCaptured(base64, rect)
    else onCaptured(base64, rect)
  }, showCaptureError)

  ipcMain.on("overlay:close", (event) => {
    if (!isWindowSender(event.sender, overlayWindow)) return
    cancelTranslationRequest()
    overlayWindow?.hide()
  })
  ipcMain.on("overlay:copy", (event, text: unknown) => {
    if (!isWindowSender(event.sender, overlayWindow)) return
    if (typeof text === "string" && text) clipboard.writeText(text)
  })

  ipcMain.on("math:close", (event) => {
    if (!isWindowSender(event.sender, mathWindow)) return
    cancelMathRequest()
    mathWindow?.hide()
  })
  ipcMain.on("math:copy", (event, text: unknown) => {
    if (!isWindowSender(event.sender, mathWindow)) return
    if (typeof text === "string" && text) clipboard.writeText(text)
  })
  ipcMain.on("math:set-format", (event, format: unknown) => {
    if (!isWindowSender(event.sender, mathWindow)) return
    const fmt = format === "tex" ? "tex" : "md"
    const cur = getSettings().math?.outputFormat
    if (cur === fmt) return
    setSettings({ math: { outputFormat: fmt } })
    console.log("[math] persisted default format:", fmt)
  })
  ipcMain.handle("math:save", async (event, content: unknown, format: unknown) => {
    assertWindowSender(event.sender, mathWindow)
    const win = mathWindow
    if (!win || win.isDestroyed() || typeof content !== "string" || !content) return
    const ext = format === "tex" ? "tex" : "md"
    const label = format === "tex" ? "LaTeX" : "Markdown"
    const result = await dialog.showSaveDialog(win, {
      defaultPath: `math-output.${ext}`,
      filters: [{ name: label, extensions: [ext] }],
    })
    if (!result.canceled && result.filePath) {
      try {
        await fs.promises.writeFile(result.filePath, content, "utf-8")
        return result.filePath
      } catch (error: unknown) {
        const message = errorMessage(error)
        console.error("[math:save] write failed:", message)
        throw new Error(message)
      }
    }
    return null
  })

  ipcMain.handle("settings:get", (event) => {
    assertWindowSender(event.sender, settingsWindow)
    return getSettings()
  })
  ipcMain.handle("settings:set", (event, patch: unknown) => {
    assertWindowSender(event.sender, settingsWindow)
    const result = setSettings(patch)
    registerShortcuts()
    updateTrayMenu()
    return result
  })
  ipcMain.handle("settings:reset", (event) => {
    assertWindowSender(event.sender, settingsWindow)
    const result = resetSettings()
    registerShortcuts()
    updateTrayMenu()
    return result
  })

  ipcMain.on("open-external", (event) => {
    if (!isWindowSender(event.sender, settingsWindow)) return
    void shell.openExternal("https://opencode.ai/auth").catch((error: unknown) => {
      console.error("[external] failed to open URL:", errorMessage(error))
    })
  })

}

app.whenReady().then(() => {
  tray = new Tray(makeTrayIcon())
  setupIpc()
  updateTrayMenu()
  registerShortcuts()

  // First-run: prompt for API key
  if (!getSettings().goApiKey) {
    openSettings()
  }

  app.on("activate", () => {
    openSettings()
  })
})

app.on("will-quit", () => {
  globalShortcut.unregisterAll()
  closeSelection()
  cancelTranslationRequest()
  cancelMathRequest()
})

// Keep running in tray even when all windows closed
app.on("window-all-closed", () => {
  // do nothing; stay in tray
})
