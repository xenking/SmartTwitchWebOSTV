# webOS Limitations and Non-1:1 Transfers (Canonical)

This document is the canonical rationale for behavior that cannot match Android 1:1 in `xenking/SmartTwitchWebOSTV`.

## 1) True Multi-Video Playback

Status: **Not 1:1 possible in webOS web app context**

Reason:
- webOS web app media runtime does not provide Android ExoPlayer-style multi-instance parity.

Impact:
- Multi-stream features are compatibility-mapped but hardware-limited.
- Bridge keeps `window.Android` API shape while enforcing webOS-safe behavior.

## 2) Android Background Services and Notifications

Status: **Not transferable**

Reason:
- Android background services and notification channels do not have direct equivalents in the standard webOS web app sandbox.

Impact:
- Notification service methods remain API-compatible stubs/no-ops where needed.

## 3) APK / Play Store Update Flow

Status: **Not transferable**

Reason:
- Android APK update/install flow is platform-specific.

Impact:
- Update-related bridge calls remain compatibility paths, not APK install behavior.

## 4) Pre-Navigation Native Bridge Parity

Status: **Not 1:1 transferable for arbitrary external pages**

Reason:
- Android can set up native bridge behavior before WebView content load.
- webOS wrapper cannot provide equivalent native preload semantics for arbitrary third-party targets.

Impact:
- Deterministic bootstrap is guaranteed for the packaged app path by staged bridge injection before `main.js` in the local `release/index.html` artifact.

## 5) DNS Filtering / Sinkhole Side Effects

Status: **Partially mitigated**

Reason:
- DNS-level blocking can produce repeated timeout/failure patterns in browser XHR pathways.

Impact:
- Bridge hardening reduces timeout storms and UI lockups.
- Playback can still fail under aggressive filtering.

## 6) Player Telemetry Parity

Status: **Partially transferable**

Reason:
- Android exposes native ExoPlayer analytics not available at equivalent fidelity in browser media APIs.

Impact:
- `getVideoStatus` payload shape is preserved, but some metrics are best-effort approximations on webOS.

## 7) Home Feed Thumbnail Video Preview

Status: **Disabled by default**

Reason:
- Feed preview playback is unstable on some webOS engines/devices.

Impact:
- Disabled by default in bridge runtime.
- Debug override remains available (`?sttv_feed_preview=1` or `localStorage.STTV_FEED_PREVIEW=1`).

## 8) Sync HTTP Compatibility Path (`mMethodUrlHeaders`)

Status: **Intentionally retained for compatibility**

Reason:
- Existing `OSInterface` call sites rely on synchronous return behavior.

Impact:
- Sync XHR can still block main thread under poor network conditions.
- Timeout/circuit-breaker hardening reduces, but cannot eliminate, this trade-off.

## 9) Packaged Release Coupling

Status: **Intentionally retained**

Reason:
- Stable wrapper defaults are coupled to the packaged `release/index.html`.
- Local installs bump the app version before packaging so install-over refreshes the app without removing stored app data.

Impact:
- Removing or renaming the packaged release target requires a dedicated migration refactor across wrapper defaults and packaging scripts.

## 10) Twitch `usher` Playlist Fetch and Quality Metadata on webOS

Status: **Mitigated in webOS bridge/service**

Reason:
- Some webOS TV browser engines block cross-origin XHR to `https://usher.ttvnw.net/...m3u8` (CORS), even when direct media playback still works.

Impact:
- Bridge routes `usher` HLS master playlist fetches through local webOS JS service (`com.tbsniller.smarttwitchwebostv.hls`) instead of a proxy fallback.
- When playlist text is available, bridge parses variants and triggers quality refresh to keep UI options aligned with available tracks.

## Related Docs
- Current implementation/parity snapshot: `docs/WEBOS_PORTING_STATUS.md`
- Build/deploy operations: `docs/WEBOS_DEPLOYMENT.md`
- Bridge deep audit: `docs/WEBOS_BRIDGE_PERFORMANCE_AUDIT.md`

## Sources
- webOS FAQ: https://webostv.developer.lge.com/faq?category=FAQ&search=video
- webOS app types: https://webostv.developer.lge.com/develop/getting-started/app-types
- webOSTV.js intro: https://webostv.developer.lge.com/develop/references/webostvjs-introduction
