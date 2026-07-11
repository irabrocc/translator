export {}

console.log("[selector:js] selector script loaded")

const sel = document.getElementById("sel") as HTMLDivElement
const size = document.getElementById("size") as HTMLDivElement
const hint = document.getElementById("hint") as HTMLDivElement

let startScreenX = 0
let startScreenY = 0
let dragging = false

// Fullscreen window origin in screen coords (so screenX - winX === clientX)
const winX = window.screenX
const winY = window.screenY

function toClient(sx: number, sy: number) {
  return { x: sx - winX, y: sy - winY }
}

function draw(sx0: number, sy0: number, sx1: number, sy1: number) {
  const a = toClient(Math.min(sx0, sx1), Math.min(sy0, sy1))
  const b = toClient(Math.max(sx0, sx1), Math.max(sy0, sy1))
  sel.style.left = `${a.x}px`
  sel.style.top = `${a.y}px`
  sel.style.width = `${b.x - a.x}px`
  sel.style.height = `${b.y - a.y}px`
  size.textContent = `${b.x - a.x} x ${b.y - a.y}`
  size.style.left = `${a.x}px`
  size.style.top = `${Math.max(0, a.y - 22)}px`
}

document.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return
  console.log("[selector:js] mousedown", e.screenX, e.screenY)
  dragging = true
  startScreenX = e.screenX
  startScreenY = e.screenY
  sel.style.display = "block"
  size.style.display = "block"
  hint.style.display = "none"
  draw(startScreenX, startScreenY, startScreenX, startScreenY)
})

document.addEventListener("mousemove", (e) => {
  if (!dragging) return
  draw(startScreenX, startScreenY, e.screenX, e.screenY)
})

document.addEventListener("mouseup", (e) => {
  if (!dragging) return
  dragging = false
  const x0 = Math.min(startScreenX, e.screenX)
  const y0 = Math.min(startScreenY, e.screenY)
  const w = Math.abs(e.screenX - startScreenX)
  const h = Math.abs(e.screenY - startScreenY)
  if (w < 4 || h < 4) {
    sel.style.display = "none"
    size.style.display = "none"
    hint.style.display = "block"
    return
  }
  console.log("[selector:js] submit rect", x0, y0, w, h)
  ;(window as any).bridge.screenshot.submit({ x: x0, y: y0, width: w, height: h })
  console.log("[selector:js] submitted")
})

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") (window as any).bridge.screenshot.cancel()
})

document.addEventListener("contextmenu", (e) => e.preventDefault())
