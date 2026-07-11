const loading = document.getElementById("loading") as HTMLDivElement
const content = document.getElementById("content") as HTMLDivElement
const srcEl = document.getElementById("src") as HTMLDivElement
const tgtEl = document.getElementById("tgt") as HTMLDivElement
const srcLabel = document.getElementById("srcLabel") as HTMLSpanElement
const tgtLabel = document.getElementById("tgtLabel") as HTMLSpanElement
const errorEl = document.getElementById("error") as HTMLDivElement
const closeBtn = document.getElementById("close") as HTMLSpanElement

export {}

const bridge = (window as any).bridge

bridge.onOverlayResult((r: any) => {
  if (r.loading) {
    loading.hidden = false
    content.hidden = true
    return
  }
  loading.hidden = true
  content.hidden = false
  srcLabel.textContent = r.sourceLabel || "识别结果"
  tgtLabel.textContent = r.targetLabel || "翻译"
  srcEl.textContent = r.recognized || ""
  tgtEl.textContent = r.translated || ""
  if (r.error) {
    errorEl.hidden = false
    errorEl.textContent = r.error
  } else {
    errorEl.hidden = true
  }
})

closeBtn.addEventListener("click", () => bridge.overlay.close())

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") bridge.overlay.close()
})

document.querySelectorAll<HTMLButtonElement>(".copy").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target
    const text = target === "src" ? srcEl.textContent : tgtEl.textContent
    if (text) bridge.overlay.copy(text)
    const orig = btn.textContent
    btn.textContent = "已复制"
    setTimeout(() => (btn.textContent = orig), 900)
  })
})
