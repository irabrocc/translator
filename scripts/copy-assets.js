const fs = require("fs")
const path = require("path")

const root = path.join(__dirname, "..")
const src = path.join(root, "src")
const dist = path.join(root, "dist")

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name)
    const d = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      copyDir(s, d)
    } else if (/\.(html|css|svg|png|ico)$/i.test(entry.name)) {
      fs.copyFileSync(s, d)
    }
  }
}

copyDir(path.join(src, "renderer"), path.join(dist, "renderer"))

const assetsSrc = path.join(root, "assets")
const assetsDest = path.join(dist, "assets")
if (fs.existsSync(assetsSrc)) copyDir(assetsSrc, assetsDest)

console.log("assets copied")
