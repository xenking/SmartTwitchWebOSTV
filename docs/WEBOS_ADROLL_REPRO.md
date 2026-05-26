# webOS Live Adroll Repro and Proxy Logging

Use this when a live stream shows a Twitch adroll while the webOS TTV LOL proxy is enabled.

## Goal

Capture enough evidence to tell which layer failed:

1. live GQL `PlaybackAccessToken` did not go through the local webOS proxy service;
2. live Usher master playlist did not go through the local webOS proxy service;
3. both proxy layers worked, but Twitch still returned a media playlist with stitched ad markers.

This mirrors the `../twitch-archiver` split: proxy only live auth/assignment (`gql.twitch.tv` and `usher.ttvnw.net`) and keep media segments direct.

## Build and Launch

From repo root:

```bash
npm run lint
npm run webos:package
npm run webos:install
npm run webos:launch
npm run webos:inspect
```

`npm run webos:inspect` opens the TV inspector. Keep Console and Network open before starting playback.

## Enable Debug Proxy State

In the TV inspector Console, run:

```js
localStorage.setItem('STTV_DEBUG', '1');
localStorage.setItem('STTV_TTVLOL_ENABLED', '1');
localStorage.setItem('STTV_TTVLOL_PROXIES', 'chromium.api.cdn-perfprod.com:2023,firefox.api.cdn-perfprod.com:2023');
location.reload();
```

Then open the same live channel again.

## Required Console Evidence

Save console lines containing `[STTV webOS bridge]`.

Expected on live startup/resume:

- `gql_token_proxy_service_forced` for async token requests, or `live_sync_load_forced_async_proxy` when a sync resume/load path is forced back through async proxy flow.
- `usher_hls_service_forced` for live Usher playlist requests.
- `usher_hls_service_result` with:
  - `source: "ttvlol_proxy"` when a proxy endpoint worked;
  - `proxy: "chromium.api.cdn-perfprod.com:2023"` or `"firefox.api.cdn-perfprod.com:2023"`;
  - or a visible direct/service failure reason if proxy fallback happened.
- `twitch_stitched_ad_marker_detected` if a playlist response contains Twitch stitched-ad markers.

Record:

- channel/login;
- absolute local time and timezone;
- app version;
- git commit SHA installed on the TV;
- whether the adroll duration was 90 seconds or different.

## Required Network Evidence

Filter Network by these hosts/paths and export a HAR or copy request/response details:

- `gql.twitch.tv/gql`
- `usher.ttvnw.net/api/channel/hls/`
- `video-weaver` / `playlist.ttvnw.net` media playlist `.m3u8`
- `api.ttv.lol/playlist/` only if the old upstream proxy path appears unexpectedly

For the media playlist active during the adroll, save the response body around any lines containing:

```text
#EXT-X-DATERANGE
CLASS="twitch-stitched-ad"
twitch-stitched-ad
X-TV-TWITCH-AD
#EXT-X-DISCONTINUITY
```

Do not paste signed full playlist URLs publicly. They contain short-lived auth tokens.

## Interpreting Results

### GQL proxy log missing

If no `gql_token_proxy_service_forced` and no `live_sync_load_forced_async_proxy` appears, the token path can still be bypassing the local service. Check `webos/bridge/webosCompatBridge.js` request classification for `gql.twitch.tv/gql` and `PlaybackAccessToken`.

### Usher proxy log missing

If no `usher_hls_service_forced` appears, the master playlist path can still be bypassing the local service. Check live playlist path classification for `/api/channel/hls/*.m3u8`.

### Proxy works, but ad marker appears

If GQL and Usher proxy logs show `ttvlol_proxy`, but `twitch_stitched_ad_marker_detected` appears or the media playlist contains `CLASS="twitch-stitched-ad"`, the remaining gap is archiver-style ad recovery: refresh live assignment and switch media playlist after stitched ad detection. The current webOS bridge logs this evidence but does not block or rewrite media playback.

### Direct fallback visible

If service logs show direct fallback or proxy failures, retry with both default proxies:

```js
localStorage.setItem('STTV_TTVLOL_PROXIES', 'chromium.api.cdn-perfprod.com:2023,firefox.api.cdn-perfprod.com:2023');
location.reload();
```

If one endpoint consistently fails, keep the failure reason and endpoint in the report.
