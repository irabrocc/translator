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
  Notification,
} from "electron"
import path from "node:path"
import {
  getSettings,
  setSettings,
  resetSettings,
} from "./store"
import {
  BUILTIN_SOURCE_LANGUAGES,
  BUILTIN_TARGET_LANGUAGES,
  LanguageDef,
  cycleLanguage,
  findLanguage,
} from "./languages"
import { translateScreenshot } from "./api"
import {
  initScreenshotModule,
  startSelection,
  closeSelection,
} from "./screenshot"

let tray: Tray | null = null
let overlayWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let statusWindow: BrowserWindow | null = null
let pendingOverlayData: any = null

// Persistent toggle: when true, captures run without reasoning (quick mode)
let quickMode = false

function getAsset(name: string): string {
  return path.join(__dirname, "..", "..", "assets", name)
}

function makeTrayIcon(): Electron.NativeImage {
  try {
    return nativeImage.createFromPath(getAsset("tray-icon.png"))
  } catch {
    return nativeImage.createEmpty()
  }
}

function currentSource(): LanguageDef {
  const s = getSettings()
  return findLanguage(s.sourceLanguages, s.currentSourceId)
}
function currentTarget(): LanguageDef {
  const s = getSettings()
  return findLanguage(s.targetLanguages, s.currentTargetId)
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
      label: `模式: ${quickMode ? "快速 (F)" : "思考 (T)"} — 点击切换`,
      click: () => toggleQuickMode(),
    },
    { label: `模型: ${getSettings().model}`, enabled: false },
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
  tray.setContextMenu(menu)
  tray.setToolTip(`源: ${src.name} → 目标: ${tgt.name}`)
}

function registerShortcuts() {
  const s = getSettings()
  globalShortcut.unregisterAll()
  const tryReg = (accel: string, fn: () => void): boolean => {
    if (!accel) return false
    const ok = globalShortcut.register(accel, fn)
    console.log(`[shortcut] register ${accel}: ${ok ? "OK" : "FAILED"}`)
    if (!ok) {
      new Notification({
        title: "快捷键注册失败",
        body: `无法注册: ${accel}，可能已被占用。请在设置中修改。`,
      }).show()
    }
    return ok
  }
  tryReg(s.shortcuts.screenshot, triggerScreenshot)
  if (s.shortcuts.quickScreenshot && s.shortcuts.quickScreenshot !== s.shortcuts.screenshot) {
    tryReg(s.shortcuts.quickScreenshot, toggleQuickMode)
  }
  tryReg(s.shortcuts.cycleSource, cycleSource)
  tryReg(s.shortcuts.cycleTarget, cycleTarget)
}

function ensureStatusWindow(): BrowserWindow {
  if (statusWindow && !statusWindow.isDestroyed()) return statusWindow
  const primary = screen.getPrimaryDisplay()
  const w = 220
  const h = 36
  const wa = primary.workArea
  const b = primary.bounds
  const y = wa.y + wa.height + Math.max(0, (b.height - wa.y - wa.height - h) / 2)
  statusWindow = new BrowserWindow({
    x: wa.x + 8,
    y: Math.min(y, b.y + b.height - h),
    width: w,
    height: h,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  statusWindow.setAlwaysOnTop(true, "screen-saver")
  statusWindow.setIgnoreMouseEvents(true, { forward: false })
  statusWindow.loadURL(
    `file://${path.join(__dirname, "..", "renderer", "status", "index.html")}`,
  )
  statusWindow.webContents.on("did-finish-load", () => {
    pushStatusUpdate()
  })
  statusWindow.on("closed", () => {
    statusWindow = null
  })

  // Periodically re-assert z-order so the badge stays visible
  // even after the Windows taskbar is clicked/focused.
  setInterval(() => {
    if (!statusWindow || statusWindow.isDestroyed()) return
    statusWindow.setAlwaysOnTop(true, "screen-saver")
    statusWindow.moveTop()
  }, 2000)

  return statusWindow
}

function statusBadgeInfo() {
  return { model: getSettings().model || "—", quick: quickMode }
}

function pushStatusUpdate() {
  if (!statusWindow || statusWindow.isDestroyed()) return
  statusWindow.webContents.send("status:update", statusBadgeInfo())
}

function updateStatusBadge() {
  ensureStatusWindow()
  const win = statusWindow!
  if (!win.isVisible()) win.show()
  pushStatusUpdate()
}

function triggerScreenshot() {
  console.log("[screenshot] Alt+S triggered, quickMode:", quickMode)
  if (!getSettings().goApiKey) {
    console.log("[screenshot] no API key, opening settings")
    new Notification({
      title: "未配置 API Key",
      body: "请先在设置中填入 OpenCode Go API Key。",
    }).show()
    openSettings()
    return
  }
  startSelection().catch((e) => {
    console.error("[screenshot] start selection failed", e)
  })
}

function toggleQuickMode() {
  quickMode = !quickMode
  console.log("[mode] quickMode toggled to:", quickMode)
  updateTrayMenu()
  updateStatusBadge()
  if (Notification.isSupported()) {
    new Notification({
      title: quickMode ? "快速模式" : "思考模式",
      body: quickMode ? "已切换至快速模式（无思考）。" : "已切换至思考模式。",
      silent: true,
    }).show()
  }
}

function cycleSource() {
  const s = getSettings()
  const cur = findLanguage(s.sourceLanguages, s.currentSourceId)
  const next = cycleLanguage(s.sourceLanguages, cur.id)
  setSettings({ currentSourceId: next.id })
  updateTrayMenu()
  notifyLangChange("源语言", next.name)
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
  if (Notification.isSupported()) {
    new Notification({ title: kind, body: name, silent: true }).show()
  }
}

function ensureOverlay(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow
  overlayWindow = new BrowserWindow({
    width: 360,
    height: 220,
    frame: false,
    transparent: false,
    resizable: false,
    skipTaskbar: false,
    show: false,
    title: "翻译结果",
    backgroundColor: "#1e1e2e",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  overlayWindow.loadURL(
    `file://${path.join(__dirname, "..", "renderer", "overlay", "index.html")}`,
  )
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

function sendToOverlay(data: any) {
  const win = ensureOverlay()
  if (win.webContents.isLoading()) {
    pendingOverlayData = data
  } else {
    win.webContents.send("overlay:result", data)
  }
}

function showOverlayLoading(near: { x: number; y: number; width: number; height: number }) {
  console.log("[overlay] showOverlayLoading near:", JSON.stringify(near))
  const win = ensureOverlay()
  const display = screen.getDisplayMatching({
    x: near.x,
    y: near.y,
    width: near.width,
    height: near.height,
  })
  const db = display.bounds
  let x = near.x + near.width + 8
  let y = near.y
  if (x + 360 > db.x + db.width) x = near.x - 368
  if (x < db.x) x = db.x + 8
  if (y + 220 > db.y + db.height) y = db.y + db.height - 228
  if (y < db.y) y = db.y + 8
  win.setBounds({ x, y, width: 360, height: 220 })
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

function showOverlayResult(r: {
  detected: string
  recognized: string
  translated: string
  sourceLabel: string
  targetLabel: string
  error?: string
}) {
  console.log("[overlay] showOverlayResult, recognized len:", r.recognized.length, "translated len:", r.translated.length, "error:", r.error ?? "none")
  const win = ensureOverlay()
  if (!win.isVisible()) {
    win.show()
    win.focus()
    win.moveTop()
  }
  sendToOverlay({ ...r, loading: false })
}

async function onCaptured(
  base64: string,
  rect: { x: number; y: number; width: number; height: number },
) {
  console.log("[onCaptured] rect:", JSON.stringify(rect), "base64 len:", base64.length)
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
    })
    console.log("[onCaptured] API result:", JSON.stringify(res).slice(0, 200))
    showOverlayResult({
      detected: res.detected_language,
      recognized: res.recognized,
      translated: res.translated,
      sourceLabel: src.id === "auto" ? res.detected_language || "识别结果" : src.name,
      targetLabel: tgt.name,
    })
  } catch (e: any) {
    console.error("[onCaptured] API error:", e?.message)
    showOverlayResult({
      detected: "",
      recognized: "",
      translated: "",
      sourceLabel: "",
      targetLabel: "",
      error: e?.message ?? String(e),
    })
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
    height: 560,
    title: "设置",
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  settingsWindow.loadURL(
    `file://${path.join(__dirname, "..", "renderer", "settings", "index.html")}`,
  )
  settingsWindow.on("closed", () => {
    settingsWindow = null
    // re-register shortcuts in case they changed
    registerShortcuts()
    updateTrayMenu()
    updateStatusBadge()
  })
}

function setupIpc() {
  initScreenshotModule(onCaptured)

  ipcMain.on("overlay:close", () => overlayWindow?.hide())
  ipcMain.on("overlay:copy", (_e, text: string) => {
    if (text) clipboard.writeText(text)
  })

  ipcMain.handle("settings:get", () => getSettings())
  ipcMain.handle("settings:set", (_e, patch) => {
    const result = setSettings(patch)
    updateStatusBadge()
    return result
  })
  ipcMain.handle("settings:reset", () => {
    resetSettings()
    updateStatusBadge()
    return getSettings()
  })

  ipcMain.on("open-external", (_e, url: string) => shell.openExternal(url))

  ipcMain.handle("status:get", () => statusBadgeInfo())
}

app.whenReady().then(() => {
  tray = new Tray(makeTrayIcon())
  setupIpc()
  updateTrayMenu()
  registerShortcuts()
  updateStatusBadge()

  // First-run: prompt for API key
  if (!getSettings().goApiKey) {
    openSettings()
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) openSettings()
  })
})

app.on("will-quit", () => {
  globalShortcut.unregisterAll()
  closeSelection()
})

// Keep running in tray even when all windows closed
app.on("window-all-closed", () => {
  // do nothing; stay in tray
})
