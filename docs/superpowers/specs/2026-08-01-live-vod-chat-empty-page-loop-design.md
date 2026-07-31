# Live archive VOD chat empty-page loop

## Problem

An active local archive VOD can remain on `Chat: Connecting to <channel> VOD` when the first successful chat page at the current playback position contains no messages. The backend and SSE endpoints are healthy, but the client repeatedly initializes and aborts the chat session.

## Root cause

`Chat_loadChatSuccess()` inserts the structural `Connected` status into `Chat_Messages` with `time: 0`. `Chat_Play()` immediately calls `Main_Addline()`, whose stale-message guard treats the status as timed chat content. At playback positions over 200 seconds, it calls `Chat_Init()` and starts the same timeline, REST, and SSE sequence again.

## Design

Render the initial `Connected` status directly with `ChatLive_ElementAdd()` instead of adding it to `Chat_Messages`. Keep the existing initial-load guard, cursor, offset, live polling, SSE, pagination, and real-message queuing unchanged.

This preserves the visible `Connecting` then `Connected` ordering while keeping structural UI state out of the playback-timed message queue. Empty active pages then follow the existing `local-live` polling path instead of triggering stale-chat recovery.

## Error handling

Existing HTTP error, Twitch fallback, retry, SSE failure, and polling paths remain unchanged. No backend changes or synthetic messages are introduced.

## Verification

Add a focused regression to `tools/webos/localVod.test.mjs` proving that an empty active initial response at a high player time:

- renders `Connected` directly;
- leaves both timed message queues empty;
- preserves `Chat_cursor = 'local-live'` and the requested offset;
- does not call `Chat_Init()` from the immediate add-line path;
- requests the next live window instead of ending chat.

Run `npm test`, `npm run lint`, rebuild/package the release, install over the existing TV app without clearing local storage, restart, and verify the live TV UI plus CDP network behavior.

## Non-goals

- No chat API or archive backend changes.
- No refactor of the general chat state machine.
- No changes to seek mapping, cursor calculations, or message ordering.
