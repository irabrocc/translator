export {}

const bridge = (window as any).bridge

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T

const apiKey = $("apiKey") as HTMLInputElement
const model = $("model") as HTMLSelectElement
const endpoint = $("endpoint") as HTMLInputElement
const scScreenshot = $("scScreenshot") as HTMLInputElement
const scMath = $("scMath") as HTMLInputElement
const scQuick = $("scQuick") as HTMLInputElement
const scSource = $("scSource") as HTMLInputElement
const scTarget = $("scTarget") as HTMLInputElement
const curSource = $("curSource") as HTMLSelectElement
const curTarget = $("curTarget") as HTMLSelectElement
const mathFormat = $("mathFormat") as HTMLSelectElement
const statusEl = $("status") as HTMLDivElement

function fillSelect(sel: HTMLSelectElement, langs: any[], currentId: string) {
  sel.innerHTML = ""
  for (const l of langs) {
    const o = document.createElement("option")
    o.value = l.id
    o.textContent = l.name
    if (l.id === currentId) o.selected = true
    sel.appendChild(o)
  }
}

async function load() {
  const s = await bridge.settings.get()
  apiKey.value = s.goApiKey
  model.value = s.model
  endpoint.value = s.endpoint
  scScreenshot.value = s.shortcuts.screenshot
  scMath.value = s.shortcuts.math || ""
  scQuick.value = s.shortcuts.quickScreenshot || ""
  scSource.value = s.shortcuts.cycleSource
  scTarget.value = s.shortcuts.cycleTarget
  fillSelect(curSource, s.sourceLanguages, s.currentSourceId)
  fillSelect(curTarget, s.targetLanguages, s.currentTargetId)
  mathFormat.value = s.math?.outputFormat || "md"
}

async function save() {
  const patch = {
    goApiKey: apiKey.value.trim(),
    model: model.value || "minimax-m3",
    endpoint: endpoint.value.trim(),
    currentSourceId: curSource.value,
    currentTargetId: curTarget.value,
    math: {
      outputFormat: (mathFormat.value as "md" | "tex") || "md",
    },
    shortcuts: {
      screenshot: scScreenshot.value.trim(),
      math: scMath.value.trim(),
      quickScreenshot: scQuick.value.trim(),
      cycleSource: scSource.value.trim(),
      cycleTarget: scTarget.value.trim(),
    },
  }
  await bridge.settings.set(patch)
  statusEl.textContent = "已保存 ✓"
  setTimeout(() => (statusEl.textContent = ""), 1500)
}

async function reset() {
  await bridge.settings.reset()
  await load()
  statusEl.textContent = "已恢复默认"
  setTimeout(() => (statusEl.textContent = ""), 1500)
}

$("save").addEventListener("click", save)
$("reset").addEventListener("click", reset)
$("goLink").addEventListener("click", (e) => {
  e.preventDefault()
  bridge.openExternal("https://opencode.ai/auth")
})

load()
