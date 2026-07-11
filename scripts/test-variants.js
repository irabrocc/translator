const fs = require("fs")
const path = require("path")

const { KEY } = require("./load-key")
const b64 = fs.readFileSync(path.join(__dirname, "test", "test-text.png")).toString("base64")

async function tryFetch(label, body) {
  console.log("\n=== " + label + " ===")
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60000)
  try {
    const res = await fetch("https://opencode.ai/zen/go/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const json = await res.json()
    console.log("HTTP", res.status)
    if (!res.ok) {
      console.log("ERROR:", JSON.stringify(json.error).slice(0, 300))
      return
    }
    const c = json.choices?.[0]?.message?.content ?? ""
    console.log("CONTENT:", c.slice(0, 200))
    console.log("FINISH:", json.choices?.[0]?.finish_reason)
  } catch (e) {
    console.log("ERR:", e.message)
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  // Variant 1: image_url as object (current)
  await tryFetch("v1 image_url obj", {
    model: "kimi-k2.7-code",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What text is in this image? Reply briefly." },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      },
    ],
  })

  // Variant 2: image_url as string
  await tryFetch("v2 image_url string", {
    model: "kimi-k2.7-code",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What text is in this image? Reply briefly." },
          { type: "image_url", image_url: `data:image/png;base64,${b64}` },
        ],
      },
    ],
  })

  // Variant 3: text-only (sanity)
  await tryFetch("v3 text only", {
    model: "kimi-k2.7-code",
    messages: [{ role: "user", content: "Say hi in 3 words." }],
  })

  // Variant 4: minimal image, jpeg data uri
  await tryFetch("v4 jpeg data uri", {
    model: "kimi-k2.7-code",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe in one word." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ],
      },
    ],
  })
}

main()
