export {}

const bridge = (window as any).bridge

const loading = document.getElementById("loading") as HTMLDivElement
const content = document.getElementById("content") as HTMLDivElement
const codeEl = document.getElementById("code") as HTMLPreElement
const errorEl = document.getElementById("error") as HTMLDivElement
const closeBtn = document.getElementById("close") as HTMLSpanElement
const copyBtn = document.getElementById("copyBtn") as HTMLButtonElement
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement
const tabs = document.querySelectorAll<HTMLButtonElement>(".tab")

let currentFormat: "md" | "tex" = "md"
let mathData: { markdown: string; latex: string } = { markdown: "", latex: "" }

function currentText(): string {
  return currentFormat === "md" ? mathData.markdown : mathData.latex
}

function render() {
  codeEl.textContent = currentText() || ""
}

function setFormat(fmt: "md" | "tex") {
  currentFormat = fmt
  tabs.forEach((t) => {
    t.classList.toggle("active", t.dataset.format === fmt)
  })
  render()
}

bridge.math.onResult((r: any) => {
  if (r.loading) {
    loading.hidden = false
    content.hidden = true
    return
  }
  loading.hidden = true
  content.hidden = false
  if (r.error) {
    errorEl.hidden = false
    errorEl.textContent = r.error
    mathData = { markdown: "", latex: "" }
    codeEl.textContent = ""
    return
  }
  errorEl.hidden = true
  mathData = { markdown: r.markdown || "", latex: r.latex || "" }
  const preferred: "md" | "tex" = r.defaultFormat === "tex" ? "tex" : "md"
  setFormat(preferred)
})

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const fmt = (tab.dataset.format as "md" | "tex") ?? "md"
    setFormat(fmt)
    try {
      bridge.math.setFormat(fmt)
    } catch {
      /* persist is best-effort */
    }
  })
})

closeBtn.addEventListener("click", () => bridge.math.close())

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") bridge.math.close()
})

copyBtn.addEventListener("click", () => {
  const text = codeEl.textContent
  if (text) bridge.math.copy(text)
  const orig = copyBtn.textContent
  copyBtn.textContent = "已复制"
  setTimeout(() => (copyBtn.textContent = orig), 900)
})

saveBtn.addEventListener("click", async () => {
  const text = currentText()
  if (!text) return
  try {
    await bridge.math.save(text, currentFormat)
    const orig = saveBtn.textContent
    saveBtn.textContent = "已保存"
    setTimeout(() => (saveBtn.textContent = orig), 900)
  } catch (e: any) {
    errorEl.hidden = false
    errorEl.textContent = e?.message ?? String(e)
  }
})