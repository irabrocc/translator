const fs = require("fs")
const path = require("path")

const { KEY } = require("./load-key")
const pngPath = path.join(__dirname, "test", "test-text.png")
const b64 = fs.readFileSync(pngPath).toString("base64")

const prompt = [
  "You are an OCR + translation assistant.",
  "First identify the language of the text in the image.",
  "Extract ALL visible text from the image faithfully, preserving line breaks and punctuation.",
  "Then translate the extracted text into Simplified Chinese.",
  'Return a JSON object with exactly these fields: "detected_language", "recognized", "translated".',
  "Return ONLY the JSON object, no markdown fences, no extra text.",
].join(" ")

const body = {
  model: "kimi-k2.6",
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
  reasoning_effort: "none", // quickMode
}

console.log("calling API with reasoning_effort=none (quickMode)...")
const ctrl = new AbortController()
const timer = setTimeout(() => {
  console.log("TIMEOUT after 90s")
  ctrl.abort()
  process.exit(2)
}, 90000)

const start = Date.now()
fetch("https://opencode.ai/zen/go/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: ctrl.signal,
})
  .then(async (res) => {
    const json = await res.json()
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.log(`HTTP ${res.status} (${elapsed}s)`)
    if (!res.ok) {
      console.log("ERROR:", JSON.stringify(json.error))
      process.exit(1)
    }
    const content = json.choices?.[0]?.message?.content ?? ""
    const reasoning = json.choices?.[0]?.message?.reasoning_content ?? ""
    console.log("RAW CONTENT:\n", content)
    console.log("REASONING chars:", reasoning.length)
    console.log("FINISH:", json.choices?.[0]?.finish_reason)
    console.log("USAGE:", JSON.stringify(json.usage))
    if (reasoning.length > 0) {
      console.log("WARNING: reasoning_content non-empty — quickMode not working!")
      process.exit(1)
    } else {
      console.log("OK: quickMode suppressed reasoning.")
    }
  })
  .catch((e) => {
    console.log("FETCH ERR:", e.message)
    process.exit(1)
  })
  .finally(() => clearTimeout(timer))