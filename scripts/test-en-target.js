const { app, nativeImage, Tray } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const { KEY } = require("./load-key")
const { setSettings, getSettings } = require("../dist/main/store")
const { translateScreenshot } = require("../dist/main/api")
const { findLanguage } = require("../dist/main/languages")

async function run() {
  const pngB64 = fs.readFileSync(path.join(__dirname, "test", "test-text.png")).toString("base64")
  const s = getSettings()
  const src = findLanguage(s.sourceLanguages, "auto")
  const tgt = findLanguage(s.targetLanguages, "en")
  console.log("test: auto source -> English target, model", s.model)
  const res = await translateScreenshot(pngB64, src, tgt, {
    apiKey: KEY,
    model: s.model,
    endpoint: s.endpoint,
  })
  console.log("detected:", res.detected_language)
  console.log("recognized:", res.recognized)
  console.log("translated:", res.translated)
  const ok = res.translated.toLowerCase().includes("hello world")
  console.log(ok ? "PASS" : "FAIL")
  app.exit(ok ? 0 : 1)
}

app.whenReady().then(() => {
  new Tray(nativeImage.createEmpty())
  setSettings({ goApiKey: KEY })
  run().catch((e) => {
    console.log("ERR", e.message)
    app.exit(1)
  })
})
