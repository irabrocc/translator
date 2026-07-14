# Screenshot Translator

Multimodal screenshot translator desktop app (Electron + TypeScript).
Uses OpenCode Go's `kimi-k2.7-code` model to OCR + translate screen captures.
Also supports math OCR: screenshot → Markdown/LaTeX code with format switching.

## Architecture

- `src/main/` — Electron main process (CommonJS): tray, windows, global shortcuts, IPC, screenshot capture, API client, settings store.
- `src/preload/preload.ts` — contextBridge IPC API exposed to renderers.
- `src/renderer/` — renderer pages (ES modules): `selector/` (drag-select overlay), `overlay/` (translation result popup), `math/` (math parse result window with MD/TeX toggle), `settings/` (config window), `status/` (mode badge).

Two TypeScript configs: `tsconfig.main.json` (CommonJS, no DOM) and `tsconfig.renderer.json` (ES2022 modules + DOM). The root `tsconfig.json` is a project-references umbrella.

## Commands

- `npm run build` — clean + compile main + compile renderer + copy static assets (html/css/png) to `dist/`.
- `npm start` — build then launch Electron.
- `npm run dist` — build then package a Windows installer with electron-builder into `release/`.

## Typecheck

```
npm run build
```

`tsc` is the typecheck; build fails on any type error.

## Notes

- Electron binary download may need `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` on restricted networks.
- Settings (API key, shortcuts, languages, math output format) persist via `electron-store` to `settings.json` in the user data dir.
- Default shortcuts: `Alt+S` screenshot translate, `Alt+M` math parse, `Alt+Q` quick/thinking toggle, `Alt+L` cycle source language, `Alt+T` cycle target language.
- Default target language: 简体中文. Default source: 自动识别 (auto).
- Default math output format: Markdown (switchable to LaTeX in result window or settings).
- API endpoint: `https://opencode.ai/zen/go/v1/chat/completions`, model `kimi-k2.7-code`.
- `screenshot.ts` supports capture modes (`translate` | `math`); the mode is set before starting selection and routed in the `onCaptured` callback.
- `api.ts` has a shared `callVision()` router; `translateScreenshot()` and `parseMath()` are the two public API functions.

## TODO

- Phase 7: `npm run dist` packaging (electron-builder).
