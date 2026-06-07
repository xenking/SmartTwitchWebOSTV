# AGENTS

## Canonical Agent Policy
- This file is the canonical agent instruction source for this repository.
- `CLAUDE.md` and `CODEX.md` are intentionally thin compatibility pointers and must not duplicate policy content.
- Preserve multi-model/agent support.

## Project Scope
- This repository is `xenking/SmartTwitchWebOSTV`, a webOS Twitch TV app.
- The packaged TV runtime is built from tracked `app/` sources plus webOS wrapper/bridge code.
- webOS-specific app behavior may live in `app/specific/**` when it owns real UI/player/feed/history state.
- webOS platform/runtime compatibility lives in `webos/bridge/**` and `webos/app/**`.

## Architecture Rules
- Use the app layer for app-level behavior:
  - local Twitch archive VOD list/merge/playback metadata
  - WTV source UI/state
  - VOD chat, preview, seek, resume, and history behavior
  - screen/player controls that need existing focus/navigation state
- Use the webOS bridge for platform adaptation:
  - `window.Android` compatibility expected by `app/specific/OSInterface.js`
  - webOS media element control
  - native request/proxy shims
  - lifecycle/back handling
- Use `tools/webos/**` and `release/scripts/**` for local build/package/install behavior.
- Do not reintroduce Twitch browser/embed fallback for webOS player paths.
- Keep changes scoped and prefer explicit helper functions over duplicated inline logic.

## Build, Package, Deploy
- Install deps: `npm install`
- Rebuild release bundle: `npm run release:build`
- Prepare staged webOS release artifact: `npm run webos:prepare-release`
- Lint/check JS pipeline: `npm run lint`
- Build IPK: `npm run webos:package`
- Install on device: `npm run webos:install`
- Launch app: `npm run webos:launch`
- Close app: `npm run webos:close`
- Restart app: `npm run webos:restart`
- Inspect app: `npm run webos:inspect`
- Remove app only when explicitly requested: `npm run webos:remove`

## Quality Gate
- For runtime behavior changes, run:
  - `npm test`
  - `npm run lint`
- For package/install changes, also run:
  - `npm run webos:package`
- For TV-facing fixes, install over the existing app and verify the installed version. Do not remove the app or clear local storage unless explicitly requested.

## webOS Best Practices
- Use `disableBackHistoryAPI` in `appinfo.json`.
- Handle app visibility/lifecycle with `visibilitychange` and `webkitvisibilitychange`.
- Route app close/back through `webOS.platformBack()` / `PalmSystem.platformBack()`.
- Treat Android-only features (APK update flow, Android services) as compatibility shims on webOS.

## Codebase-Memory / Index Hygiene
- Keep generated and local agent artifacts out of repository indexing:
  - `webos/app/release/`
  - `.tmp/`
  - `build/`
  - `.ai_context/`
  - `.omx/`
  - `.codebase-memory/`
  - `.beads/`
- If codebase-memory search includes these paths, refresh/re-index after checking `.gitignore`.

## Legal and Copyright
- Keep required license/copyright notices on copied third-party files.
- New repository-owned docs and webOS-local code should use `xenking/SmartTwitchWebOSTV` repository links.

## Canonical Documentation Map
- `README.md`: project entrypoint and local build/runtime model.
- `docs/WEBOS_DEPLOYMENT.md`: build/package/deploy/release operations.
- `docs/WEBOS_PORTING_STATUS.md`: current implementation status and parity snapshot.
- `docs/WEBOS_LIMITATIONS.md`: platform limits and non-1:1 transfers.
- `docs/AI_DOCUMENTATION.md`: AI-oriented architecture/runtime summary and references.
- Deep references:
  - `docs/ANDROID_TO_WEBOS_FLOW_MAPPING.md`
  - `docs/WEBOS_BRIDGE_PERFORMANCE_AUDIT.md`
