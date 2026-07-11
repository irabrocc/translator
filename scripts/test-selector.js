const { app, BrowserWindow, screen, globalShortcut } = require("electron")
const path = require("node:path")

// Load compiled screenshot module
let screenshotMod = null
try {
  screenshotMod = require("../dist/main/screenshot")
} catch (e) {
  console.log("require screenshot failed:", e.message)
}

app.whenReady().then(async () => {
  console.log("app ready")
  console.log("screenshotMod:", !!screenshotMod)

  // Register Alt+S to call startSelection
  const ok = globalShortcut.register("Alt+S", () => {
    console.log("[test] Alt+S pressed!")
    startSelection()
  })
  console.log("Alt+S registered:", ok)

  // Also auto-trigger after 2s for automated test
  setTimeout(async () => {
    console.log("[test] auto-triggering startSelection")
    await startSelection()
  }, 2000)

  async function startSelection() {
    const primary = screen.getPrimaryDisplay()
    const bounds = primary.bounds
    console.log("[test] primary bounds:", JSON.stringify(bounds))

    const win = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      backgroundColor: "#80000000",
      transparent: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "..", "dist", "preload", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    win.setAlwaysOnTop(true, "screen-saver")
    const url = `file://${path.join(__dirname, "..", "dist", "renderer", "selector", "index.html")}`
    console.log("[test] loading:", url)
    try {
      await win.loadURL(url)
      console.log("[test] loaded OK")
    } catch (e) {
      console.log("[test] load failed:", e.message)
    }
    win.show()
    win.focus()
    console.log("[test] window shown, isVisible:", win.isVisible())
    console.log("[test] window bounds:", JSON.stringify(win.getBounds()))

    win.webContents.on("console-message", (_e, _l, msg) => {
      console.log("[renderer]", msg)
    })

    // Auto-close after 5s
    setTimeout(() => {
      console.log("[test] closing window")
      win.close()
      app.quit()
    }, 5000)
  }
})
