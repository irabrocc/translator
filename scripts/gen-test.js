const fs = require("fs")
const path = require("path")

const d = path.join(__dirname, "test")
fs.mkdirSync(d, { recursive: true })

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="140">' +
  '<rect width="100%" height="100%" fill="white"/>' +
  '<text x="20" y="55" font-family="Arial" font-size="34" fill="black">Hello World</text>' +
  '<text x="20" y="100" font-family="Arial" font-size="24" fill="black">This is a test image</text>' +
  "</svg>"

fs.writeFileSync(path.join(d, "test.svg"), svg)
console.log("svg written", svg.length, "bytes")
