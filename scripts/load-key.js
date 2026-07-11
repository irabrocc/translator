const fs = require("fs")
const path = require("path")

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env")
  const text = fs.readFileSync(envPath, "utf-8")
  const map = {}
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/)
    if (m) map[m[1]] = m[2]
  }
  return map
}

const env = loadEnv()
const KEY = process.env.GO_API_KEY || env.GO_API_KEY

if (!KEY) {
  console.error("No GO_API_KEY found. Set it in .env or as an environment variable.")
  process.exit(1)
}

module.exports = { KEY }