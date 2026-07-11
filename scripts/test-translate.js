const fs = require("fs")
const path = require("path")

const { KEY } = require("./load-key")
const b64 = fs.readFileSync(path.join(__dirname, "test", "test-text.png")).toString("base64")

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

console.log("calling API with translation prompt...")
async function run(i) {
  console.log("attempt", i + 1)
  try {
    const res = await fetch("https://opencode.ai/zen/go/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) {
      console.log("  fail HTTP", res.status, json.error?.message?.slice(0, 100))
      if (i < 4) return run(i + 1)
      process.exit(1)
    }
    const content = json.choices?.[0]?.message?.content ?? ""
    console.log("RAW CONTENT:\n" + content)
    console.log("FINISH:", json.choices?.[0]?.finish_reason)
    let parsed = null
    try {
      parsed = JSON.parse(content.trim().replace(/^```json\s*|\s*```$/g, ""))
    } catch {
      const m = content.match(/\{[\s\S]*\}/)
      if (m) {
        try {
          parsed = JSON.parse(m[0])
        } catch {}
      }
    }
    console.log("\nPARSED:\n" + JSON.stringify(parsed, null, 2))
  } catch (e) {
    console.log("  ERR:", e.message)
    if (i < 4) return run(i + 1)
    process.exit(1)
  }
}
run(0)
