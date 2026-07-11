const { app, nativeImage, BrowserWindow } = require("electron")
const path = require("node:path")
const fs = require("node:fs")

const { KEY } = require("./load-key")

async function testApi() {
  // Build a PNG with text via an offscreen render
  const win = new BrowserWindow({
    width: 420,
    height: 140,
    show: false,
    webPreferences: { offscreen: true, sandbox: false, nodeIntegration: false },
  })

  const html =
    "data:text/html;charset=utf-8," +
    encodeURIComponent(
      '<html><body style="margin:0;background:white;font-family:Arial"><div style="padding:20px"><div style="font-size:34px;color:black">Hello World</div><div style="font-size:24px;color:black;margin-top:10px">This is a test image</div></div></body></html>',
    )
  await win.loadURL(html)
  await new Promise((r) => setTimeout(r, 600))

  const img = await win.webContents.capturePage()
  const pngBuf = img.toPNG()
  const b64 = pngBuf.toString("base64")
  fs.writeFileSync(path.join(__dirname, "test", "test-text.png"), pngBuf)
  console.log("PNG written", pngBuf.length, "bytes, b64 len", b64.length)
  win.close()

  // Call the Go API
  const prompt = [
    "You are an OCR + translation assistant.",
    "First identify the language of the text in the image.",
    "Extract ALL visible text from the image faithfully, preserving line breaks and punctuation.",
    "Then translate the extracted text into Simplified Chinese.",
    'Return a JSON object with exactly these fields: "detected_language", "recognized", "translated".',
    "Return ONLY the JSON object, no markdown fences, no extra text.",
  ].join(" ")

  const body = {
    model: "kimi-k2.7-code",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      },
    ],
    temperature: 0,
  }

  console.log("calling API...")
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60000)
  let res
  try {
    res = await fetch("https://opencode.ai/zen/go/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch (e) {
    console.log("FETCH ERR:", e.message)
    app.exit(1)
  } finally {
    clearTimeout(timer)
  }
  const json = await res.json()
  console.log("HTTP", res.status)
  if (!res.ok) {
    console.log("ERROR:", JSON.stringify(json.error))
    app.exit(1)
  }
  const content = json.choices?.[0]?.message?.content ?? ""
  console.log("RAW CONTENT:\n", content)
  console.log("FINISH:", json.choices?.[0]?.finish_reason)
  console.log("USAGE:", JSON.stringify(json.usage))
  try {
    const parsed = JSON.parse(content.trim().replace(/^```json\s*|\s*```$/g, ""))
    console.log("PARSED:", JSON.stringify(parsed, null, 2))
  } catch (e) {
    console.log("parse failed:", e.message)
  }
  app.exit(0)
}

app.whenReady().then(testApi).catch((e) => {
  console.error("FATAL", e)
  app.exit(1)
})
