import { LanguageDef, languagePromptName } from "./languages"

export interface TranslationResult {
  detected_language: string
  recognized: string
  translated: string
  raw?: string
}

export type ProviderKind = "openai" | "anthropic"

export interface ModelConfig {
  model: string
  endpoint: string
  kind: ProviderKind
}

const OPENAI_ENDPOINT = "https://opencode.ai/zen/go/v1/chat/completions"
const ANTHROPIC_ENDPOINT = "https://opencode.ai/zen/go/v1/messages"

// Models that speak the OpenAI chat-completions protocol (vision via image_url)
const OPENAI_VISION_MODELS = new Set([
  "kimi-k2.7-code",
  "kimi-k2.6",
  "kimi-k2.5",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "mimo-v2-pro",
  "mimo-v2-omni",
  "mimo-v2.5-pro",
  "mimo-v2.5",
  "glm-5.2",
  "glm-5.1",
  "glm-5",
])

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

export async function translateScreenshot(
  imageBase64: string,
  source: LanguageDef,
  target: LanguageDef,
  opts: { apiKey: string; model: string; endpoint?: string; quickMode?: boolean },
): Promise<TranslationResult> {
  const prompt = buildPrompt(source, target)
  const kind = modelKind(opts.model)

  if (kind === "anthropic") {
    return callAnthropic(imageBase64, prompt, opts)
  }
  return callOpenAI(imageBase64, prompt, opts)
}

async function callOpenAI(
  imageBase64: string,
  prompt: string,
  opts: { apiKey: string; model: string; endpoint?: string; quickMode?: boolean },
): Promise<TranslationResult> {
  const endpoint =
    opts.endpoint && opts.endpoint.trim() && !opts.endpoint.includes("/v1/messages")
      ? opts.endpoint
      : OPENAI_ENDPOINT
  const body: Record<string, any> = {
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
  if (opts.quickMode) body.reasoning_effort = "none"
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (e: any) {
    clearTimeout(timeout)
    if (e?.name === "AbortError") throw new Error("API 请求超时（60s），请检查网络或稍后重试")
    throw new Error(`API 请求失败: ${e?.message ?? String(e)}`)
  }
  clearTimeout(timeout)
  const json = (await res.json()) as any
  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`
    throw new Error(`API error: ${msg}`)
  }
  const content = json.choices?.[0]?.message?.content ?? ""
  return parseTranslation(content)
}

async function callAnthropic(
  imageBase64: string,
  prompt: string,
  opts: { apiKey: string; model: string; endpoint?: string; quickMode?: boolean },
): Promise<TranslationResult> {
  const endpoint =
    opts.endpoint && opts.endpoint.trim() && opts.endpoint.includes("/v1/messages")
      ? opts.endpoint
      : ANTHROPIC_ENDPOINT
  const body: Record<string, any> = {
    model: opts.model,
    max_tokens: 1024,
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
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "x-api-key": opts.apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (e: any) {
    clearTimeout(timeout)
    if (e?.name === "AbortError") throw new Error("API 请求超时（60s），请检查网络或稍后重试")
    throw new Error(`API 请求失败: ${e?.message ?? String(e)}`)
  }
  clearTimeout(timeout)
  const json = (await res.json()) as any
  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`
    throw new Error(`API error: ${msg}`)
  }
  const content =
    (json.content as Array<{ type: string; text?: string }>)
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim() ?? ""
  return parseTranslation(content)
}

function parseTranslation(content: string): TranslationResult {
  const raw = content.trim()
  let parsed: any = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        parsed = JSON.parse(match[0])
      } catch {
        /* fall through */
      }
    }
  }
  if (parsed && typeof parsed === "object") {
    return {
      detected_language: String(parsed.detected_language ?? "unknown"),
      recognized: String(parsed.recognized ?? ""),
      translated: String(parsed.translated ?? ""),
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
