# SmartTwitchWebOSTV AI Documentation

This document provides AI-oriented architecture context for `xenking/SmartTwitchWebOSTV`.

## AI Context Summary
- Runtime model: tracked `app/` sources are rebuilt into `release/`, staged with webOS bridge injection, and packaged into the IPK.
- App-level webOS features may live in `app/specific/**` when they need screen/player/focus/history state.
- Platform compatibility lives in `webos/bridge/**` and `webos/app/**`.
- Local TV installs package the staged release artifact into the IPK and bump `webos/app/appinfo.json` so install-over refreshes scripts without deleting app data.

## Canonical Runtime Files
- `app/specific/LocalVod.js`
- `app/specific/WTV.js`
- `app/specific/PlayVod.js`
- `app/specific/ChatVod.js`
- `webos/bridge/webosCompatBridge.js`
- `webos/app/index.js`
- `webos/app/appinfo.json`
- `tools/webos/prepareReleaseArtifact.js`
- `tools/webos/preparePackagedApp.js`

## Runtime Behavior Notes
- `window.Android` API compatibility is required for `app/specific/OSInterface.js`.
- Debug logging is disabled by default and enabled only via:
  - `?sttv_debug=1`
  - `localStorage.STTV_DEBUG = "1"`
- Local Twitch archive VODs should preserve local recording IDs for resume/history and store linked Twitch VOD metadata only for fallback chat/preview timelines.

## Tooling Map
- Release build:
  - `release/scripts/maker.js`
- webOS packaging:
  - `tools/webos/prepareReleaseArtifact.js`
  - `tools/webos/preparePackagedApp.js`
  - `tools/webos/bumpLocalAppVersion.js`
  - `tools/webos/runAresCommand.js`
- Release artifacts:
  - `tools/release/verifyReleaseTag.js`
  - `tools/release/generateHomebrewArtifacts.js`

## Canonical Doc Ownership
- Build/package/deploy/release operations: `docs/WEBOS_DEPLOYMENT.md`
- Current implementation/parity snapshot: `docs/WEBOS_PORTING_STATUS.md`
- Platform limitations and non-1:1 rationale: `docs/WEBOS_LIMITATIONS.md`
- Deep references:
  - `docs/ANDROID_TO_WEBOS_FLOW_MAPPING.md`
  - `docs/WEBOS_BRIDGE_PERFORMANCE_AUDIT.md`

## Index Hygiene
- Do not index generated or local agent artifacts:
  - `webos/app/release/`
  - `.tmp/`
  - `build/`
  - `.ai_context/`
  - `.omx/`
  - `.codebase-memory/`
  - `.beads/`

## References
- Back button: https://webostv.developer.lge.com/develop/guides/back-button
- Lifecycle: https://webostv.developer.lge.com/develop/guides/app-lifecycle-management
- `appinfo.json`: https://webostv.developer.lge.com/develop/references/appinfo-json
