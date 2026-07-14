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
  cycleSource: string
  cycleTarget: string
}

export type MathOutputFormat = "md" | "tex"

export interface MathSettings {
  outputFormat: MathOutputFormat
}

export interface Settings {
  goApiKey: string
  model: string
  endpoint: string
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
  sourceLanguages: BUILTIN_SOURCE_LANGUAGES,
  targetLanguages: BUILTIN_TARGET_LANGUAGES,
  currentSourceId: "auto",
  currentTargetId: "zh",
  shortcuts: {
    screenshot: "Alt+S",
    quickScreenshot: "Alt+Q",
    math: "Alt+M",
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
  const data = store.store
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(data?.shortcuts ?? {}) },
    math: { ...DEFAULT_SETTINGS.math, ...(data?.math ?? {}) },
    sourceLanguages: data?.sourceLanguages?.length
      ? data.sourceLanguages
      : DEFAULT_SETTINGS.sourceLanguages,
    targetLanguages: data?.targetLanguages?.length
      ? data.targetLanguages
      : DEFAULT_SETTINGS.targetLanguages,
  }
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  store.store = next
  return next
}

export function resetSettings(): Settings {
  store.store = DEFAULT_SETTINGS
  return DEFAULT_SETTINGS
}
