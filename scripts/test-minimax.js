const fs = require("fs")
const { KEY } = require("./load-key")
const b64 = fs.readFileSync("test/test-text.png").toString("base64")

const prompt = [
  "You are an OCR + translation assistant.",
  "First identify the language of the text in the image.",
  "Extract ALL visible text faithfully, preserving line breaks.",
  "Then translate into Simplified Chinese.",
  'Return a JSON object with fields: detected_language, recognized, translated.',
  "Return ONLY JSON, no markdown fences.",
].join(" ")

const body = {
  model: "minimax-m3",
  max_tokens: 400,
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
      ],
    },
  ],
}

console.log("calling minimax-m3 /v1/messages with translation prompt...")
fetch("https://opencode.ai/zen/go/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": KEY,
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify(body),
})
  .then(async (r) => {
    const j = await r.json()
    console.log("HTTP", r.status)
    if (!r.ok) {
      console.log("ERR", JSON.stringify(j.error))
      return
    }
    const c = (j.content?.map((b) => b.text).join("") ?? "").trim()
    console.log("CONTENT:", c)
    let parsed = null
    try {
      parsed = JSON.parse(c.replace(/^```json\s*|\s*```$/g, "").trim())
    } catch {
      const m = c.match(/\{[\s\S]*\}/)
      if (m) {
        try {
          parsed = JSON.parse(m[0])
        } catch {}
      }
    }
    console.log("PARSED:", JSON.stringify(parsed, null, 2))
    console.log("USAGE:", JSON.stringify(j.usage))
  })
  .catch((e) => console.log("ERR", e.message))
