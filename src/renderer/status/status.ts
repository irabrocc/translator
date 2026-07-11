export {}

const bridge = (window as any).bridge

const modelEl = document.getElementById("model") as HTMLSpanElement
const modeEl = document.getElementById("mode") as HTMLSpanElement

function apply(info: { model: string; quick: boolean }) {
  modelEl.textContent = info.model || "—"
  modeEl.textContent = info.quick ? "F" : "T"
  modeEl.className = info.quick ? "quick" : "thinking"
}

bridge.status.onUpdate((info: { model: string; quick: boolean }) => {
  apply(info)
})

bridge.status.get().then((info: { model: string; quick: boolean }) => {
  apply(info)
})