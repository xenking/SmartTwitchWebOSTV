# webOS Porting Status

This is the current-state snapshot for `xenking/SmartTwitchWebOSTV`.

## Architecture Status
- `webos/app` launches the packaged `release/index.html` copied into `webos/app/release/`.
- `tools/webos/prepareReleaseArtifact.js` injects `webos/bridge/webosCompatBridge.js` before `main.js` in the staged release artifact.
- `app/specific/**` is an accepted home for webOS-owned app behavior when it needs existing screen/player/focus/history state.
- Local Twitch archive VOD support is app-owned and lives primarily in `app/specific/LocalVod.js`, `PlayVod.js`, and `ChatVod.js`.
- WTV support is app-owned and lives primarily in `app/specific/WTV.js` plus focused call sites.

## Runtime Compatibility Status
- `window.Android` surface required by `app/specific/OSInterface.js` is preserved via bridge mapping.
- Core playback, preview playback, key handling, and platform-back flow are implemented.
- Lifecycle handling (`visibilitychange`, `webkitvisibilitychange`, page show/hide) is implemented with guarded resume/stop behavior.
- Relaunch/deeplink passthrough is implemented (`GetLastIntentObj`, `webOSRelaunch`).
- Twitch `usher` HLS master playlist fetch is supported via local webOS JS service (`com.tbsniller.smarttwitchwebostv.hls`) to avoid browser CORS blocks on affected TVs.
- Main-player quality list refresh invokes `Play_getQualities(type, false)` from bridge after main playlist parse/start.

## Local VOD Status
- Local archive VODs replace overlapping Twitch VOD cards when local archive data exists.
- Local VOD playback uses the local archive playlist first.
- Local recording IDs remain the primary VOD IDs for local resume/history.
- Linked Twitch VOD IDs are retained only for fallback Twitch chat and seek preview sprites.
- Local-only archived chat needs a read API from `twitch-archiver`; tracked separately as Beads task `twitch-archiver-6ze`.

## Bridge/Parity Snapshot
- Detailed bridge parity matrix lives in `docs/WEBOS_BRIDGE_PERFORMANCE_AUDIT.md`.
- Legacy watchdog/reload/race recovery state-machine logic is removed.
- Loader flicker and hot-path DOM pressure hardening are applied in bridge runtime paths.
- Freeze-risk mitigations were added for sync request timeout handling, lifecycle unblock, and timer deduping.

## Non-1:1 Areas
- True Android-style multi-instance playback.
- Android background service behavior.
- APK update/install flow.
- Some telemetry fidelity differences.

Canonical rationale is in `docs/WEBOS_LIMITATIONS.md`.

## Automation Status
- Tag-based release automation exists in `.github/workflows/release.yml`.
- Local install automation bumps `webos/app/appinfo.json`, rebuilds the IPK, and installs it without removing app data.

## Related Docs
- Build/package/deploy/release operations: `docs/WEBOS_DEPLOYMENT.md`
- Limitations rationale: `docs/WEBOS_LIMITATIONS.md`
- Android flow mapping reference: `docs/ANDROID_TO_WEBOS_FLOW_MAPPING.md`
