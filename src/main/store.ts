import Store from "electron-store"
import {
  BUILTIN_SOURCE_LANGUAGES,
  BUILTIN_TARGET_LANGUAGES,
  LanguageDef,
} from "./languages"

export interface ShortcutConfig {
  screenshot: string
  quickScreenshot: string
  math: string
  cycleModel: string
  cycleSource: string
  cycleTarget: string
}

export const AVAILABLE_MODELS = [
  "minimax-m3",
  "kimi-k2.7-code",
  "kimi-k2.6",
  "qwen3.7-max",
  "minimax-m2.7",
] as const

export type MathOutputFormat = "md" | "tex"

export interface MathSettings {
  outputFormat: MathOutputFormat
}

export interface Settings {
  goApiKey: string
  model: string
  endpoint: string
  launchAtLogin: boolean
  sourceLanguages: LanguageDef[]
  targetLanguages: LanguageDef[]
  currentSourceId: string
  currentTargetId: string
  shortcuts: ShortcutConfig
  math: MathSettings
}

export const DEFAULT_SETTINGS: Settings = {
  goApiKey: "",
  model: "minimax-m3",
  endpoint: "",
  launchAtLogin: false,
  sourceLanguages: BUILTIN_SOURCE_LANGUAGES,
  targetLanguages: BUILTIN_TARGET_LANGUAGES,
  currentSourceId: "auto",
  currentTargetId: "zh",
  shortcuts: {
    screenshot: "Alt+S",
    quickScreenshot: "Alt+Q",
    math: "Alt+M",
    cycleModel: "Alt+K",
    cycleSource: "Alt+L",
    cycleTarget: "Alt+T",
  },
  math: {
    outputFormat: "md",
  },
}

const store = new Store<Settings>({
  defaults: DEFAULT_SETTINGS,
  name: "settings",
})

export function getSettings(): Settings {
  return normalizeSettings(store.store)
}

export function setSettings(value: unknown): Settings {
  const current = getSettings()
  const patch = asRecord(value)
  const next = normalizeSettings({
    ...current,
    ...patch,
    shortcuts: { ...current.shortcuts, ...asRecord(patch.shortcuts) },
    math: { ...current.math, ...asRecord(patch.math) },
  })
  store.store = next
  return next
}

export function resetSettings(): Settings {
  const defaults = normalizeSettings(DEFAULT_SETTINGS)
  store.store = defaults
  return defaults
}

function normalizeSettings(value: unknown): Settings {
  const data = asRecord(value)
  const shortcuts = asRecord(data.shortcuts)
  const math = asRecord(data.math)
  const sourceLanguages = normalizeLanguages(
    data.sourceLanguages,
    DEFAULT_SETTINGS.sourceLanguages,
  )
  const targetLanguages = normalizeLanguages(
    data.targetLanguages,
    DEFAULT_SETTINGS.targetLanguages,
  )
  const requestedSourceId = stringValue(
    data.currentSourceId,
    DEFAULT_SETTINGS.currentSourceId,
  )
  const requestedTargetId = stringValue(
    data.currentTargetId,
    DEFAULT_SETTINGS.currentTargetId,
  )

  return {
    goApiKey: stringValue(data.goApiKey, DEFAULT_SETTINGS.goApiKey),
    model: stringValue(data.model, DEFAULT_SETTINGS.model, true),
    endpoint: stringValue(data.endpoint, DEFAULT_SETTINGS.endpoint),
    launchAtLogin: booleanValue(data.launchAtLogin, DEFAULT_SETTINGS.launchAtLogin),
    sourceLanguages,
    targetLanguages,
    currentSourceId: sourceLanguages.some(({ id }) => id === requestedSourceId)
      ? requestedSourceId
      : sourceLanguages[0].id,
    currentTargetId: targetLanguages.some(({ id }) => id === requestedTargetId)
      ? requestedTargetId
      : targetLanguages[0].id,
    shortcuts: {
      screenshot: stringValue(
        shortcuts.screenshot,
        DEFAULT_SETTINGS.shortcuts.screenshot,
      ),
      quickScreenshot: stringValue(
        shortcuts.quickScreenshot,
        DEFAULT_SETTINGS.shortcuts.quickScreenshot,
      ),
      math: stringValue(shortcuts.math, DEFAULT_SETTINGS.shortcuts.math),
      cycleModel: stringValue(
        shortcuts.cycleModel,
        DEFAULT_SETTINGS.shortcuts.cycleModel,
      ),
      cycleSource: stringValue(
        shortcuts.cycleSource,
        DEFAULT_SETTINGS.shortcuts.cycleSource,
      ),
      cycleTarget: stringValue(
        shortcuts.cycleTarget,
        DEFAULT_SETTINGS.shortcuts.cycleTarget,
      ),
    },
    math: {
      outputFormat: math.outputFormat === "tex" ? "tex" : "md",
    },
  }
}

function normalizeLanguages(value: unknown, fallback: LanguageDef[]): LanguageDef[] {
  if (!Array.isArray(value)) return fallback.map((language) => ({ ...language }))
  const seen = new Set<string>()
  const languages: LanguageDef[] = []
  for (const candidate of value.slice(0, 100)) {
    const record = asRecord(candidate)
    const id = stringValue(record.id, "", true)
    const name = stringValue(record.name, "", true)
    const english = stringValue(record.english, "", true)
    if (!id || !name || !english || seen.has(id)) continue
    seen.add(id)
    languages.push({ id, name, english })
  }
  return languages.length
    ? languages
    : fallback.map((language) => ({ ...language }))
}

function stringValue(value: unknown, fallback: string, requireValue = false): string {
  if (typeof value !== "string" || value.length > 10_000) return fallback
  return requireValue && !value.trim() ? fallback : value
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}
