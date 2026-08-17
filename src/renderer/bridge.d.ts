interface LanguageDef {
  id: string
  name: string
  english: string
}

interface RendererSettings {
  goApiKey: string
  model: string
  endpoint: string
  launchAtLogin: boolean
  sourceLanguages: LanguageDef[]
  targetLanguages: LanguageDef[]
  currentSourceId: string
  currentTargetId: string
  shortcuts: {
    screenshot: string
    quickScreenshot: string
    math: string
    cycleModel: string
    cycleSource: string
    cycleTarget: string
  }
  math: { outputFormat: "md" | "tex" }
}

interface OverlayResultData {
  detected: string
  recognized: string
  translated: string
  sourceLabel: string
  targetLabel: string
  loading?: boolean
  error?: string
}

interface MathResultData {
  markdown: string
  latex: string
  loading?: boolean
  error?: string
  defaultFormat?: "md" | "tex"
}

interface BridgeApi {
  screenshot: {
    submit(rect: {
      x: number
      y: number
      width: number
      height: number
      displayId?: string
    }): void
    cancel(): void
    onReset(cb: () => void): void
  }
  overlay: {
    close(): void
    copy(text: string): void
  }
  math: {
    close(): void
    copy(text: string): void
    save(content: string, format: "md" | "tex"): Promise<string | null | undefined>
    setFormat(format: "md" | "tex"): void
    onResult(cb: (result: MathResultData) => void): void
  }
  settings: {
    get(): Promise<RendererSettings>
    set(patch: Partial<RendererSettings>): Promise<RendererSettings>
    reset(): Promise<RendererSettings>
  }
  openExternal(): void
  onOverlayResult(cb: (result: OverlayResultData) => void): void
}

interface Window {
  bridge: BridgeApi
}
