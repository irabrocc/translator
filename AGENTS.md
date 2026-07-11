# Screenshot Translator

Multimodal screenshot translator desktop app (Electron + TypeScript).
Uses OpenCode Go's `kimi-k2.7-code` model to OCR + translate screen captures.

## Architecture

- `src/main/` — Electron main process (CommonJS): tray, windows, global shortcuts, IPC, screenshot capture, API client, settings store.
- `src/preload/preload.ts` — contextBridge IPC API exposed to renderers.
- `src/renderer/` — renderer pages (ES modules): `selector/` (drag-select overlay), `overlay/` (translation result popup), `settings/` (config window).

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
- Settings (API key, shortcuts, languages) persist via `electron-store` to `settings.json` in the user data dir.
- Default shortcuts: `Alt+S` screenshot, `Alt+L` cycle source language, `Alt+T` cycle target language.
- Default target language: 简体中文. Default source: 自动识别 (auto).
- API endpoint: `https://opencode.ai/zen/go/v1/chat/completions`, model `kimi-k2.7-code`.

## TODO

- Phase 7: `npm run dist` packaging (electron-builder).
