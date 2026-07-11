const { app, BrowserWindow, Tray, ipcMain, nativeImage, globalShortcut, screen, clipboard, Notification, shell } = require("electron")
const path = require("node:path")
const fs = require("node:fs")

const { KEY } = require("./load-key")

// Reuse the compiled main modules
const { getSettings, setSettings } = require("../dist/main/store")
const { translateScreenshot } = require("../dist/main/api")
const { BUILTIN_SOURCE_LANGUAGES, BUILTIN_TARGET_LANGUAGES, findLanguage } = require("../dist/main/languages")

let tray = null

function makeTrayIcon() {
  try {
    return nativeImage.createFromPath(path.join(__dirname, "assets", "tray-icon.png"))
  } catch {
    return nativeImage.createEmpty()
  }
}

async function runTest() {
  // Seed API key + use minimax-m3 (reliable for images right now)
  setSettings({ goApiKey: KEY, model: "minimax-m3", currentSourceId: "auto", currentTargetId: "zh" })
  const s = getSettings()
  console.log("settings: model=", s.model, "src=", s.currentSourceId, "tgt=", s.currentTargetId)

  const pngB64 = fs.readFileSync(path.join(__dirname, "test", "test-text.png")).toString("base64")
  console.log("test image b64 len:", pngB64.length)

  const src = findLanguage(s.sourceLanguages, s.currentSourceId)
  const tgt = findLanguage(s.targetLanguages, s.currentTargetId)
  console.log("source:", src.name, "target:", tgt.name)

  console.log("calling translateScreenshot...")
  try {
    const res = await translateScreenshot(pngB64, src, tgt, {
      apiKey: s.goApiKey,
      model: s.model,
      endpoint: s.endpoint,
    })
    console.log("RESULT:")
    console.log("  detected_language:", res.detected_language)
    console.log("  recognized:", JSON.stringify(res.recognized))
    console.log("  translated:", JSON.stringify(res.translated))
    const ok =
      res.recognized.includes("Hello World") &&
      res.translated.includes("你好世界")
    console.log(ok ? "\n✅ END-TO-END TEST PASSED" : "\n❌ END-TO-END TEST FAILED (content mismatch)")
    app.exit(ok ? 0 : 1)
  } catch (e) {
    console.log("❌ TEST ERROR:", e.message)
    app.exit(1)
  }
}

app.whenReady().then(() => {
  // minimal tray so app doesn't quit
  tray = new Tray(makeTrayIcon())
  tray.setToolTip("test")
  runTest()
})
