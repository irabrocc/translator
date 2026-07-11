const fs = require("fs")
const path = require("path")

const { KEY } = require("./load-key")
const pngPath = path.join(__dirname, "test", "test-text.png")
const b64 = fs.readFileSync(pngPath).toString("base64")
console.log("image b64 len:", b64.length)

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

const ctrl = new AbortController()
const timer = setTimeout(() => {
  console.log("TIMEOUT after 90s")
  ctrl.abort()
  process.exit(2)
}, 90000)

console.log("calling API...")
fetch("https://opencode.ai/zen/go/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: ctrl.signal,
})
  .then(async (res) => {
    const json = await res.json()
    console.log("HTTP", res.status)
    if (!res.ok) {
      console.log("ERROR:", JSON.stringify(json.error))
      process.exit(1)
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
  })
  .catch((e) => {
    console.log("FETCH ERR:", e.message)
    process.exit(1)
  })
  .finally(() => clearTimeout(timer))
