const fs = require("fs")
const { KEY } = require("./load-key")
const b64 = fs.readFileSync("test/test-text.png").toString("base64")

async function t(label, text) {
  const body = {
    model: "kimi-k2.7-code",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      },
    ],
    temperature: 0,
  }
  try {
    const r = await fetch("https://opencode.ai/zen/go/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const j = await r.json()
    const ok = r.ok
    console.log(`[${ok ? "OK " : "FAIL"}] ${label} HTTP ${r.status} :: ${(j.choices?.[0]?.message?.content ?? j.error?.message ?? "").slice(0, 90)}`)
  } catch (e) {
    console.log(`[ERR ] ${label} :: ${e.message}`)
  }
}

async function main() {
  await t("A: short describe", "What text is in this image?")
  await t("B: extract only", "Extract all visible text from the image faithfully, preserving line breaks.")
  await t("C: extract+identify", "Extract all visible text. Identify the language. Reply with the language name and the text.")
  await t("D: +translate", "Extract all visible text. Identify the language. Translate into Simplified Chinese. Give language, original, translation.")
  await t("E: JSON output", 'Extract all visible text. Identify the language. Translate into Simplified Chinese. Return JSON with fields detected_language, recognized, translated. Return ONLY JSON.')
  await t("F: short JSON", "Extract the text and translate to Chinese. Return JSON: {recognized, translated}.")
}

main()
