export interface LanguageDef {
  id: string
  name: string
  english: string
}

export const BUILTIN_SOURCE_LANGUAGES: LanguageDef[] = [
  { id: "auto", name: "自动识别", english: "Auto" },
  { id: "en", name: "英语", english: "English" },
  { id: "ko", name: "韩语", english: "Korean" },
  { id: "he", name: "希伯来语", english: "Hebrew" },
  { id: "fr", name: "法语", english: "French" },
]

export const BUILTIN_TARGET_LANGUAGES: LanguageDef[] = [
  { id: "zh", name: "简体中文", english: "Simplified Chinese" },
  { id: "en", name: "英语", english: "English" },
  { id: "ko", name: "韩语", english: "Korean" },
  { id: "ja", name: "日语", english: "Japanese" },
  { id: "fr", name: "法语", english: "French" },
]

export function languagePromptName(lang: LanguageDef): string {
  return lang.english
}

export function cycleLanguage(list: LanguageDef[], currentId: string): LanguageDef {
  const idx = list.findIndex((l) => l.id === currentId)
  const next = (idx + 1) % list.length
  return list[next]
}

export function findLanguage(list: LanguageDef[], id: string): LanguageDef {
  return list.find((l) => l.id === id) ?? list[0]
}
