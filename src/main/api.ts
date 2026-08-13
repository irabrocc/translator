import { LanguageDef, languagePromptName } from "./languages"

export interface TranslationResult {
  detected_language: string
  recognized: string
  translated: string
  raw?: string
}

export interface MathResult {
  markdown: string
  latex: string
  raw?: string
}

export type ProviderKind = "openai" | "anthropic"

export interface VisionCallOpts {
  apiKey: string
  model: string
  endpoint?: string
  quickMode?: boolean
  maxTokens?: number
  signal?: AbortSignal
}

type JsonRecord = Record<string, unknown>

const OPENAI_ENDPOINT = "https://opencode.ai/zen/go/v1/chat/completions"
const ANTHROPIC_ENDPOINT = "https://opencode.ai/zen/go/v1/messages"

// Models that speak the Anthropic messages protocol (vision via image source)
const ANTHROPIC_VISION_MODELS = new Set([
  "minimax-m3",
  "minimax-m2.7",
  "minimax-m2.5",
  "qwen3.7-max",
  "qwen3.7-plus",
  "qwen3.6-plus",
  "qwen3.5-plus",
])

export function modelKind(model: string): ProviderKind {
  if (ANTHROPIC_VISION_MODELS.has(model)) return "anthropic"
  return "openai"
}

function buildPrompt(source: LanguageDef, target: LanguageDef): string {
  const sourceInstruction =
    source.id === "auto"
      ? "First identify the language of the text in the image."
      : `The text in the image is in ${languagePromptName(source)}.`
  return [
    "You are an OCR + translation assistant.",
    sourceInstruction,
    "Extract ALL visible text from the image faithfully, preserving line breaks and punctuation.",
    `Then translate the extracted text into ${languagePromptName(target)}.`,
    'Return a JSON object with exactly these fields: "detected_language", "recognized", "translated".',
    "detected_language should be the language name in English (use \"unknown\" if the image has no text).",
    "Return ONLY the JSON object, no markdown fences, no extra text.",
  ].join(" ")
}

function buildMathPrompt(): string {
  return [
    "You are a math OCR assistant specialized in extracting mathematical content from images.",
    "Extract ALL visible mathematical content from the image, including surrounding explanatory text and formulas.",
    "Preserve the structure and hierarchy (headings, lists, numbered equations, align blocks, etc.).",
    "Return a JSON object with exactly these fields:",
    '"markdown": the content in Markdown format. Use $...$ for inline math and $$...$$ for display equations. Use proper LaTeX commands inside math delimiters.',
    '"latex": the content as a compile-ready LaTeX document. Include \\documentclass{article}, \\usepackage{amsmath,amssymb}, and proper math environments ($...$, \\[...\\], equation, align, etc.).',
    "Return ONLY the JSON object, no markdown fences, no extra text.",
  ].join(" ")
}

export async function translateScreenshot(
  imageBase64: string,
  source: LanguageDef,
  target: LanguageDef,
  opts: VisionCallOpts,
): Promise<TranslationResult> {
  const prompt = buildPrompt(source, target)
  const content = await callVision(imageBase64, prompt, opts)
  return parseTranslation(content)
}

export async function parseMath(
  imageBase64: string,
  opts: VisionCallOpts,
): Promise<MathResult> {
  const prompt = buildMathPrompt()
  const content = await callVision(imageBase64, prompt, {
    ...opts,
    maxTokens: opts.maxTokens ?? 4096,
  })
  return parseMathResult(content)
}

async function callVision(
  imageBase64: string,
  prompt: string,
  opts: VisionCallOpts,
): Promise<string> {
  const kind = modelKind(opts.model)
  if (kind === "anthropic") return callAnthropicRaw(imageBase64, prompt, opts)
  return callOpenAIRaw(imageBase64, prompt, opts)
}

async function callOpenAIRaw(
  imageBase64: string,
  prompt: string,
  opts: VisionCallOpts,
): Promise<string> {
  const endpoint = resolveEndpoint(opts.endpoint, OPENAI_ENDPOINT)
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${imageBase64}` },
          },
        ],
      },
    ],
    temperature: 0,
  }
  if (opts.maxTokens) body.max_tokens = opts.maxTokens
  if (opts.quickMode) body.reasoning_effort = "none"
  const json = await postJson(
    endpoint,
    {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body,
    opts.signal,
  )
  const choices = Array.isArray(json.choices) ? json.choices : []
  const firstChoice = asRecord(choices[0])
  const message = asRecord(firstChoice?.message)
  return textContent(message?.content)
}

async function callAnthropicRaw(
  imageBase64: string,
  prompt: string,
  opts: VisionCallOpts,
): Promise<string> {
  const endpoint = resolveEndpoint(opts.endpoint, ANTHROPIC_ENDPOINT)
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageBase64,
            },
          },
        ],
      },
    ],
  }
  if (opts.quickMode) body.reasoning_effort = "none"
  const json = await postJson(
    endpoint,
    {
      "x-api-key": opts.apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body,
    opts.signal,
  )
  return textContent(json.content).trim()
}

function resolveEndpoint(endpoint: string | undefined, fallback: string): string {
  return endpoint?.trim() || fallback
}

async function postJson(
  endpoint: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  externalSignal?: AbortSignal,
): Promise<JsonRecord> {
  const controller = new AbortController()
  const abortFromExternal = () => controller.abort()
  if (externalSignal?.aborted) controller.abort()
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true })
  const timeout = setTimeout(() => controller.abort(), 60_000)
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const responseText = await res.text()
    const parsed = parseJson(responseText)
    const json = asRecord(parsed)

    if (!res.ok) {
      const error = asRecord(json?.error)
      const detail = typeof error?.message === "string"
        ? error.message
        : responseText.trim().slice(0, 300) || res.statusText
      throw new Error(`API error (${res.status}): ${detail}`)
    }
    if (!json) {
      throw new Error("API 返回了无效的 JSON 响应")
    }
    return json
  } catch (error: unknown) {
    if (isAbortError(error)) {
      if (externalSignal?.aborted) throw new Error("API 请求已取消")
      throw new Error("API 请求超时（60s），请检查网络或稍后重试")
    }
    if (error instanceof Error && error.message.startsWith("API ")) {
      throw error
    }
    throw new Error(`API 请求失败: ${errorMessage(error)}`)
  } finally {
    clearTimeout(timeout)
    externalSignal?.removeEventListener("abort", abortFromExternal)
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function textContent(value: unknown): string {
  if (typeof value === "string") return value
  if (!Array.isArray(value)) return ""
  return value
    .map((block) => {
      const record = asRecord(block)
      return record?.type === "text" && typeof record.text === "string"
        ? record.text
        : ""
    })
    .join("")
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Robustly extract a JSON object from model output.
 * Handles bare JSON, fenced JSON, and balanced JSON embedded in prose.
 */
function extractJsonObject(raw: string): JsonRecord | null {
  // 1) Direct parse — works for clean bare JSON.
  try {
    return asRecord(JSON.parse(raw))
  } catch {
    /* fall through */
  }
  // 2) Pull the contents of every ```json ... ``` or ``` ... ``` fenced
  //    block (try the LAST one first — model usually ends with the answer).
  const fences = Array.from(raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
  for (let i = fences.length - 1; i >= 0; i--) {
    try {
      const parsed = asRecord(JSON.parse(fences[i][1].trim()))
      if (parsed) return parsed
    } catch {
      /* try next fence */
    }
  }
  // 3) Scan balanced top-level objects. This avoids a greedy match swallowing
  //    prose braces or multiple JSON objects in a reasoning response.
  const cleaned = raw.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, "")
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false
  let lastParsed: JsonRecord | null = null

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i]
    if (depth > 0 && inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (depth > 0 && char === '"') {
      inString = true
    } else if (char === "{") {
      if (depth === 0) start = i
      depth++
    } else if (char === "}" && depth > 0) {
      depth--
      if (depth === 0 && start >= 0) {
        try {
          const parsed = asRecord(JSON.parse(cleaned.slice(start, i + 1)))
          if (parsed) lastParsed = parsed
        } catch {
          /* keep scanning */
        }
        start = -1
      }
    }
  }
  return lastParsed
}

function stringField(
  value: JsonRecord,
  field: string,
  fallback = "",
): string {
  const candidate = value[field]
  return typeof candidate === "string" ? candidate : fallback
}

function parseTranslation(content: string): TranslationResult {
  const raw = content.trim()
  const parsed = extractJsonObject(raw)
  if (parsed && typeof parsed === "object") {
    return {
      detected_language: stringField(parsed, "detected_language", "unknown"),
      recognized: stringField(parsed, "recognized"),
      translated: stringField(parsed, "translated"),
      raw,
    }
  }
  return {
    detected_language: "unknown",
    recognized: raw,
    translated: "",
    raw,
  }
}

function parseMathResult(content: string): MathResult {
  const raw = content.trim()
  const parsed = extractJsonObject(raw)
  if (parsed && typeof parsed === "object") {
    return {
      markdown: stringField(parsed, "markdown"),
      latex: stringField(parsed, "latex"),
      raw,
    }
  }
  return {
    markdown: raw,
    latex: "",
    raw,
  }
}
