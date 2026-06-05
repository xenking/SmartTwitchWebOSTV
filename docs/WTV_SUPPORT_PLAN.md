# w.tv support plan

Date: 2026-06-04
Scope: `SmartTwitchWebOSTV` only. Integration target is `w.tv` only.

Kick is not part of the implementation plan. Kick can be used only as a reference for clean provider/player scheme design.

## Corrected understanding

Playback default is direct HLS, not archiver proxy.

Target:

- STW can show/play a `w.tv` live stream explicitly as `w.tv`.
- Live playback should prefer direct HLS URL by default.
- If archiver has a live recording/VOD for the same w.tv stream, STW should also expose the existing “go to VOD/recording” style switch, same conceptual UX as Twitch live -> VOD recording switch.
- Finished w.tv recordings appearing in the all-recordings/VOD list is a separate task, but plan it here.
- Need clear UI marker that this is `w.tv`, not Twitch. Example: replace/augment red `LIVE` label with `W.TV LIVE` or add platform badge next to title.

No Twitch-to-w.tv binding is required for archiver. STW may have UI entry points from existing screens, but w.tv source identity is `platform=wtv + channel=nickname`.

## Backend/API expected from twitch-archiver

Tracked source management exists in archiver, not necessarily tied to Twitch channels:

```text
GET    /api/sources
POST   /api/sources
PATCH  /api/sources/wtv/{channel}
DELETE /api/sources/wtv/{channel}
```

Live direct-HLS status:

```text
GET /api/sources/wtv/{channel}/live
```

Response:

```json
{
  "platform": "wtv",
  "channel": "sosohe",
  "online": true,
  "title": "...",
  "viewer_count": 123,
  "started_at": "2026-06-04T...Z",
  "stream_id": "wtv:...",
  "playback_url": "https://....m3u8",
  "playback_kind": "direct_hls",
  "recording_group_id": "...optional if archiver is recording it",
  "vod_url": "http://archive.local/archive/... optional"
}
```

Source/VOD list endpoint, exact name TBD by archiver plan:

```text
GET /archive/recordings?platform=wtv
GET /archive/sources/wtv/{channel}/vods
```

VOD DTO fields:

```json
{
  "source_platform": "wtv",
  "source_channel": "sosohe",
  "playback_url": "http://archive.local/archive/vods/.../playlist.m3u8",
  "webos_playback_url": "http://archive.local/archive/vods/.../webos.m3u8"
}
```

Important webOS compatibility constraint found during local archive testing:

- older source-pruned finalized `file_url` recordings that worked on TV are HEVC + AAC in Matroska (`recording.mkv`, `video/x-matroska`);
- the failing local archive recording is HEVC + AAC in fragmented MP4 (`recording.mp4`, `hvc1`, `video/mp4`);
- symptom matches container/finalization/playback switch regression, not simply "HEVC cannot play";
- SmartTwitchWebOSTV should still allow direct `file_url` for existing working MKV archives, but should prefer backend-provided webOS-compatible URLs when present;
- backend should expose a webOS-compatible finalized URL (`webos_playback_url`, `compat_playback_url`, `h264_playback_url`, or a Matroska remux URL) for MP4 finals that black-screen on webOS.

## UX entry points

### MVP input/add source

Need a way to enter w.tv channel nickname.

Possible placements:

1. Settings/local archive area:
   - “Add w.tv channel” input.
   - Good for archiver-tracked source management.
2. Channel Content action row:
   - add `w.tv` action/button near existing VOD/Clips/Follow row.
   - opens input for w.tv nickname and optionally starts playback/status check.
3. Dedicated source list screen later:
   - list tracked Twitch/w.tv sources together.

MVP recommended:

- Add simple `w.tv` action where it is fastest/safest in current UX.
- The action asks for nickname, calls archiver add-source API if endpoint configured, and then opens/checks that w.tv source.

Important: do not imply the w.tv nickname is linked to the current Twitch channel unless a later product decision adds that.

### Live marker

When a w.tv stream is shown:

- show platform visibly.
- examples:
  - red label becomes `W.TV LIVE` instead of `LIVE`;
  - title prefix `[w.tv]`;
  - channel row says `w.tv / sosohe`.

Acceptance: user can tell immediately that playback is w.tv, not Twitch.

## Direct live playback plan

Direct HLS is default.

Flow:

1. User enters/selects `w.tv` channel.
2. STW asks archiver live-status endpoint or w.tv resolver endpoint for direct HLS.
3. If online, STW opens `playback_url` directly as HLS.
4. Do not route through archiver proxy unless direct playback fails or user explicitly picks archived/recorded playback.

Implementation options:

1. Add external direct-HLS branch in `Main_OpenLiveStream(data)`:
   - detect metadata `{ source_platform:'wtv', playback_kind:'direct_hls' }`;
   - skip Twitch token/usher path;
   - pass URL to generic HLS player startup.
2. If generic HLS player path is not clean, add `PlayExternalHLS` wrapper around the existing player init.

Need verification on real webOS/local browser because direct Amazon IVS HLS may have device-specific behavior.

## Live-to-recording/VOD switch plan

For Twitch today there is a concept of going from live to corresponding VOD/live recording. w.tv should get analogous behavior when archiver has recording metadata.

During live:

- live source DTO may include `recording_group_id` or `vod_url`.
- player/info UI should expose button/action:
  - `Open recording`
  - `Go to VOD`
  - same style as current Twitch live/VOD switch.

Behavior:

- default OK/open = direct live HLS.
- explicit VOD/recording action = archiver recording URL.
- if no recording exists yet, disable or hide VOD action.

## Finished w.tv VOD playback task

Separate task, but needed for full product.

Goal:

- after w.tv stream ends and archiver finalizes it, STW can list and play that recording.

Tasks:

1. Add source-aware archive list client:
   - all recordings;
   - filter `source_platform=wtv`;
   - per w.tv channel VOD list.
2. Add badge in list rows:
   - `w.tv` source badge;
   - channel nickname.
3. Reuse existing archive playback for finalized HLS/VOD URLs.
4. Ensure Twitch VOD screens remain unchanged.

Acceptance:

- w.tv finalized recording appears in all-recordings/source list.
- selecting it plays archive/VOD playback.
- UI marks it as `w.tv`.

## Files likely touched

Known high-signal files:

- `app/specific/ChannelContent.js`
  - optional w.tv action/input if using Channel Content as MVP entry point.
- `app/specific/Settings.js`
  - likely best place for archiver source management input.
- `app/specific/ScreensObj.js`
  - add w.tv live cell/source metadata helpers and `W.TV LIVE` label support.
- `app/specific/Main.js`
  - direct-HLS branch in `Main_OpenLiveStream` or equivalent open path.
- `app/specific/PlayHLS.js` / `app/specific/PlayEtc.js`
  - generic direct-HLS playback wrapper if needed.
- optional new file: `app/specific/WTV.js` or `app/specific/ExternalSources.js`
  - archiver API client and direct-HLS source normalization.

## Suggested agent task split

### Agent STW-1: w.tv API client/input

Tasks:

1. Add small source client module.
2. Use existing local archive endpoint config.
3. Implement:
   - add/list/delete tracked `w.tv` source via archiver API;
   - get `w.tv` live status and direct HLS URL.
4. Add simple input action for w.tv nickname.

Acceptance:

- can save `sosohe` as tracked w.tv source through STW when archiver endpoint configured.
- can fetch online/offline status.
- no behavior change when endpoint unset.

### Agent STW-2: w.tv live cell/marker

Tasks:

1. Create data helper for w.tv live source.
2. Render live cell with obvious `W.TV LIVE` marker.
3. Include `source_platform/source_channel` metadata.
4. Keep Twitch live cells unchanged.

Acceptance:

- w.tv live row/tile is visually distinct.
- no accidental Twitch branding/identity in w.tv stream cell.

### Agent STW-3: direct HLS playback

Tasks:

1. Add direct-HLS playback branch.
2. Skip Twitch token/usher for `source_platform=wtv`.
3. Start player from `playback_url`.
4. Test with live `sosohe` or captured URL.

Acceptance:

- direct HLS opens by default.
- if direct HLS fails, error is visible and does not corrupt Twitch player state.

### Agent STW-4: live recording/VOD switch

Tasks:

1. If live status includes `recording_group_id`/`vod_url`, show action to open recording.
2. Reuse current live->VOD switch UX where possible.
3. Keep default playback direct live.

Acceptance:

- live w.tv playback can switch to archive recording when available.
- no switch shown when no recording exists.

### Agent STW-5: finished w.tv VOD list/playback

Tasks:

1. Add source-aware archive list screen/client support.
2. Show w.tv badge and channel nickname.
3. Reuse archive playback path.
4. Manual test with finalized w.tv recording.

Acceptance:

- finished w.tv recording appears in all/source VOD list.
- playback works from archive URL.

## Verification checklist

Static/local:

```bash
git status --short
# run repo's existing build/lint/test command if present
```

Manual live smoke:

1. Configure local archive endpoint.
2. Add w.tv source `sosohe`.
3. Fetch live status.
4. Expected: online source includes direct HLS URL.
5. Open source.
6. Expected: direct HLS playback starts.
7. Expected UI label says `W.TV LIVE` / `w.tv`, not plain Twitch `LIVE`.
8. If archiver recording metadata exists, open VOD/recording action.
9. Expected: archive recording playback opens separately.

Finished VOD smoke:

1. Let archiver finalize a w.tv recording.
2. Open all/source recordings list.
3. Expected: w.tv recording appears with source badge.
4. Play it.
5. Expected: archive VOD playback works.

## Open decisions

1. Best MVP placement for “Add w.tv channel”: Settings vs Channel Content vs new source list.
2. Whether archiver returns selected source media playlist or master playlist for direct HLS. PoC source variant worked best for IINA.
3. Exact existing STW live->VOD switch hook to reuse.
4. Real webOS direct HLS compatibility must be tested; direct remains default, fallback/proxy only after evidence.

## Follow-up task: w.tv chat in SmartTwitchWebOSTV

Task: `SmartTwitchWebOSTV-0w9` — Add w.tv chat support for mapped WTV playback.

### Goal

When a Twitch channel is mapped to a w.tv channel and STW is showing/playing the w.tv source, the chat panel should show w.tv chat instead of pretending Twitch IRC belongs to that stream.

Example:

- Twitch channel: `melharucos`
- mapped w.tv channel: `sosohe`
- Twitch is offline, w.tv/archive source is active
- livefeed/player shows `melharucos` with `W.TV` marker
- chat panel connects to `sosohe` w.tv chat and marks messages as `W.TV`

### Reference implementation

AxelChat is useful as reference because it lists `W (w.tv)` as a supported platform and exposes local HTTP/WebSocket APIs for messages/state. The public `3dproger/AxelChat` repository is mostly docs/assets, not the native platform connector source, so do not vendor it as implementation source. Use it to validate behavior/API shape only.

Relevant AxelChat integration surfaces:

- HTTP pull: `GET /api/v1/messages?count=100`, `GET /api/v1/state`.
- WebSocket push: `NEW_MESSAGES_RECEIVED`, `MESSAGES_CHANGED`, `CLEAR_MESSAGES`.
- Message shape: author, service/platform id, contents array with text/image chunks, timestamps, deletion/edit flags.

### Architecture options

#### Option A — native w.tv chat client inside STW/webOS bridge

Research w.tv chat transport directly from live browser/HAR/devtools and implement it in the hosted bridge/app.

Pros:

- No extra host dependency.
- Direct player/chat coupling in TV app.

Cons:

- Risky on webOS: CORS, websocket headers, CloudFront/WAF token behavior, auth drift.
- Harder to debug and update.

Use only if the w.tv chat websocket/API is public and stable from the TV webview.

#### Option B — archiver-side w.tv chat proxy, STW consumes local endpoint

Add a read-only chat bridge to `twitch-archiver` or a small sidecar on `192.168.0.109:18080`:

- `GET /archive/sources/wtv/{channel}/chat/messages?after=...`
- `GET /archive/sources/wtv/{channel}/chat/stream` (SSE preferred for TV simplicity)

STW connects to local LAN endpoint, receives normalized messages, renders through existing chat UI.

Pros:

- Best fit for webOS: LAN HTTP/SSE is already working.
- Can handle WAF/cookies/headers/server-side quirks outside TV app.
- Same archiver host already knows active w.tv source and recording state.

Cons:

- Requires archiver/sidecar work.

Recommended MVP.

#### Option C — AxelChat adapter endpoint

Run AxelChat on LAN and add an adapter that reads AxelChat HTTP/WebSocket API, filters `serviceId=w`/`wtv` messages for the mapped channel, then exposes the same STW-normalized endpoint as Option B.

Pros:

- Fastest if AxelChat already connects to w.tv reliably.
- No need to reverse-engineer w.tv chat immediately.

Cons:

- Requires another app/service running.
- AxelChat main connector source is not available in the public repo.
- Harder to make appliance-like on HTPC/NAS.

Use as research/prototype, not final default unless it is clearly stable.

### STW implementation plan

1. Add chat source detection:
   - if `WTV_IsData(Play_data.data)` is true, route chat through `WTVChat` provider;
   - otherwise preserve existing Twitch IRC path unchanged.
2. Add `app/specific/WTVChat.js`:
   - resolve mapped w.tv channel from `WTV_GetMeta(Play_data.data).source_channel`;
   - connect to local normalized endpoint;
   - convert messages into the existing chat renderer input shape.
3. UI markers:
   - show `W.TV CHAT` in chat header/status;
   - message badges should not look like Twitch badges unless mapped explicitly;
   - disable Twitch write-to-chat for w.tv unless actual w.tv auth/send support exists.
4. Fallback behavior:
   - if endpoint unavailable, show a non-blocking `w.tv chat unavailable` status;
   - never block playback;
   - never fall back to Twitch chat for a w.tv stream unless explicitly enabled later.
5. Debug logging:
   - log endpoint, connection state, message counts, reconnect reasons;
   - redact cookies/tokens/authorization.
6. Verification:
   - live mapped stream `melharucos -> sosohe` shows W.TV chat panel;
   - Twitch stream still uses Twitch chat;
   - offline/no-chat states do not hang UI;
   - webOS install/package path verified.

### Open research questions

- Actual w.tv chat transport: websocket URL, REST bootstrap, auth/cookie/WAF requirements.
- Whether public read-only chat works without account login.
- Stable platform id string from AxelChat for w.tv (`w`, `wtv`, or another service id).
- Emoji/emote/image content support needed for first MVP.
- Whether archiver should persist chat alongside WTV recordings later.

### Acceptance criteria

- During W.TV playback, chat panel displays live w.tv messages for mapped channel.
- Chat header clearly says `W.TV CHAT`.
- Twitch chat is not opened for W.TV playback.
- Playback/feed remain working if chat endpoint fails.
- No settings-screen UX is required for basic use; mapping remains in ChannelContent action row.
