# webOS Live Proxy Adroll Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the working `../twitch-archiver` selective live proxy behavior closely enough to avoid 90s Twitch adrolls on webOS, and capture evidence when Twitch still serves stitched ads.

**Architecture:** Keep player/network compatibility behavior in `webos/bridge/webosCompatBridge.js`, `webos/service/hls_playlist_client.js`, and generated webOS release artifacts. App-level behavior may live in `app/specific/**` when it owns screen/player state. Proxy only live GQL token and live Usher master playlist requests through TTVLOL-style HTTP CONNECT proxies, keep media segments direct, and add detection/logging for stitched ad markers in media playlists.

**Tech Stack:** JavaScript webOS bridge/service, SmartTwitchWebOSTV app JS, Luna `PalmServiceBridge`, Node test script `tools/webos/hlsPlaylistClient.test.mjs`, existing `npm run lint` and `npm run webos:package` gates.

---

## File Map

- Modify `webos/service/hls_playlist_client.js`: default proxy list, attempt metadata, live GQL/Usher proxy request behavior.
- Modify `webos/bridge/webosCompatBridge.js`: sync live GQL service path, debug logs, optional media playlist ad marker detector.
- Modify `app/specific/Settings.js`: webOS TTVLOL default proxy setting string.
- Modify `app/languages/en_US.js` only if user-facing copy needs default-list wording.
- Modify `tools/webos/hlsPlaylistClient.test.mjs`: focused regression checks for defaults, live GQL proxy attempts, and allowed headers.
- Modify generated `release/githubio/js/main.js` and `release/githubio/js/main_uncompressed.js` only through the existing build/prepare path if source changes require it.
- Create `docs/WEBOS_ADROLL_REPRO.md`: exact TV repro/log workflow.

---

### Task 1: Align selective proxy defaults and route sync live loads back through async proxy flow

**Files:**
- Modify: `webos/service/hls_playlist_client.js`
- Modify: `webos/bridge/webosCompatBridge.js`
- Modify: `app/specific/Settings.js`
- Modify: `tools/webos/hlsPlaylistClient.test.mjs`

- [x] **Step 1: Add failing default-list test**

Add to `tools/webos/hlsPlaylistClient.test.mjs`:

```js
{
  assert.deepEqual(client.DEFAULT_OPTIMIZED_PROXIES, [
    'chromium.api.cdn-perfprod.com:2023',
    'firefox.api.cdn-perfprod.com:2023'
  ]);
}
```

Run: `node tools/webos/hlsPlaylistClient.test.mjs`
Expected before implementation: FAIL because only Firefox is present.

- [x] **Step 2: Update service default list**

In `webos/service/hls_playlist_client.js`, set:

```js
var DEFAULT_OPTIMIZED_PROXIES = ['chromium.api.cdn-perfprod.com:2023', 'firefox.api.cdn-perfprod.com:2023'];
```

- [x] **Step 3: Update bridge and settings defaults**

In `webos/bridge/webosCompatBridge.js`, set:

```js
var TTVLOL_DEFAULT_OPTIMIZED_PROXIES = ['chromium.api.cdn-perfprod.com:2023', 'firefox.api.cdn-perfprod.com:2023'];
```

In `app/specific/Settings.js`, set:

```js
var Settings_WebOsTtvLolProxyDefault = 'chromium.api.cdn-perfprod.com:2023,firefox.api.cdn-perfprod.com:2023';
```

- [x] **Step 4: Force sync live load/resume callers onto async proxy flow**

Do not call Luna from a synchronous token request; the synchronous caller cannot consume an async service response. Instead, patch webOS live load/resume entrypoints so synchronous reloads run the existing async `PlayHLS_GetPlayListAsync` flow, which already forces live GQL and live Usher through the local proxy service.

In `webos/bridge/webosCompatBridge.js`, add `patchLiveProxyAsyncLoadFlow()` that wraps `Play_loadData` and `PlayExtra_Resume`:

```js
if (synchronous && isBridgePolyfillActive() && isTtvLolPlaylistProxyEnabled() && w.Main_IsOn_OSInterface) {
    bridgeDebugLog('live_sync_load_forced_async_proxy', {name: name});
    return original.call(this, false);
}
```

Call it from bridge bootstrap via `ensureLiveProxyAsyncLoadFlow()` after the update/VOD safety patches.

- [x] **Step 5: Run focused tests**

Run: `node tools/webos/hlsPlaylistClient.test.mjs`
Expected: PASS.

Run: `npm run lint`
Expected: exit 0.

---

### Task 2: Add ad-marker detector and evidence logging

**Files:**
- Modify: `webos/bridge/webosCompatBridge.js`
- Modify: `tools/webos/hlsPlaylistClient.test.mjs` if helper is exportable/testable

- [x] **Step 1: Add detector helper in bridge**

Add near playlist helpers:

```js
function playlistHasTwitchStitchedAds(text) {
    if (typeof text !== 'string' || text.indexOf('#EXT') === -1) return false;
    return text.indexOf('twitch-stitched-ad') !== -1 || /#EXT-X-DATERANGE:[^\n]*(?:CLASS="?twitch-stitched-ad"?|X-TV-TWITCH-AD)/i.test(text);
}
```

- [x] **Step 2: Log ad markers for playlist responses**

When a successful playlist response is cached/finished in `sendAsyncRequest` and sync `xhrReq`, if `playlistHasTwitchStitchedAds(finalText)` is true, log:

```js
bridgeDebugLog('twitch_stitched_ad_marker_detected', {
    host: meta && meta.host ? meta.host : '',
    url: meta && meta.url ? meta.url : '',
    requestKey: meta && meta.requestKey ? meta.requestKey : ''
});
```

- [x] **Step 3: Preserve playback while collecting evidence**

Do not block media playlist or segment fetches in this task. This task is observability only so it is safe on TV.

- [x] **Step 4: Run lint/package gate**

Run: `npm run lint && npm run webos:package`
Expected: exit 0.

---

### Task 3: Document reproducible TV adroll capture

**Files:**
- Create: `docs/WEBOS_ADROLL_REPRO.md`

- [x] **Step 1: Create repro doc**

Include this exact setup:

```js
localStorage.setItem('STTV_DEBUG', '1');
localStorage.setItem('STTV_TTVLOL_ENABLED', '1');
localStorage.setItem('STTV_TTVLOL_PROXIES', 'chromium.api.cdn-perfprod.com:2023,firefox.api.cdn-perfprod.com:2023');
location.reload();
```

Include required evidence:

- `[STTV webOS bridge] gql_token_proxy_service_forced` or `_sync`
- `[STTV webOS bridge] usher_hls_service_forced`
- service result `source` and `proxy`
- media playlist body around adroll
- presence/absence of `twitch-stitched-ad`
- stream channel, absolute local time, app version, commit SHA

- [x] **Step 2: Link doc from deployment/troubleshooting docs if appropriate**

If `docs/WEBOS_DEPLOYMENT.md` has a troubleshooting section, add one bullet to `docs/WEBOS_ADROLL_REPRO.md`.

---

### Task 4: TV verification loop

**Files:**
- No source edits unless TV proof shows a regression.

- [x] **Step 1: Package**

Run: `npm run webos:package`
Expected: IPK created under `build/`.

- [ ] **Step 2: Install and launch only when user wants TV deploy**

Run only with explicit TV deploy intent:

```bash
npm run webos:install
npm run webos:launch
npm run webos:inspect
```

- [ ] **Step 3: Verify live playback logs**

Expected in inspector console after opening a live stream:

- GQL token request forced through service.
- Usher live playlist forced through service.
- Service returns `source: ttvlol_proxy` or direct fallback is visible.
- If a 90s adroll appears, media playlist evidence contains or excludes `twitch-stitched-ad`.

---

## Self-Review

- Spec coverage: covers current proxy comparison gap, sync GQL candidate, archiver default proxies, ad-marker evidence, and TV repro path.
- Placeholder scan: no TBD/TODO placeholders.
- Risk: sync GQL over Luna cannot synchronously return a token to existing sync caller; Task 1 explicitly treats that as a testable risk and may require forcing webOS live load to async instead.
