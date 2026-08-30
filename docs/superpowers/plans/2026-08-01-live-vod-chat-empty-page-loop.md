# Live VOD Chat Empty-Page Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop active local archive VOD chat from reinitializing when the first successful live-window response is empty.

**Architecture:** Keep structural connection state out of the playback-timed message queue. Remove the initial `Connecting` placeholder and render `Connected` directly, while leaving real comments, pagination, offsets, polling, and SSE behavior unchanged.

**Tech Stack:** JavaScript, Node.js VM regression harness, npm release tooling, LG webOS CLI/CDP.

---

### Task 1: Reproduce and fix the empty live-window loop

**Files:**
- Modify: `tools/webos/localVod.test.mjs`
- Modify: `app/specific/ChatVod.js:742-753`

- [ ] **Step 1: Add the failing regression**

Add a VM test that loads the real `Chat_loadChatSuccess`, `Chat_Play`, and `Main_Addline` bodies with an empty active response at `2990s`. The assertions must be:

```js
assert.deepEqual(
  added.map(message => message.message),
  ['<span class="message">connected</span>'],
  'empty active local chat renders Connected as structural UI state'
);
assert.deepEqual(chatChildren, [], 'empty active local chat removes the Connecting placeholder');
assert.equal(context.Chat_Messages.length, 0, 'Connected is not queued as timed chat content');
assert.equal(context.Chat_MessagesNext.length, 0, 'empty active chat keeps the next timed queue empty');
assert.equal(context.Chat_cursor, 'local-live', 'empty active chat keeps its live cursor');
assert.equal(context.Chat_offset, 2990, 'empty active chat preserves its requested offset');
assert.equal(reinitializations, 0, 'empty active chat does not immediately reinitialize at a high player time');
assert.ok(nextRequests > 0, 'empty active chat polls the next live window');
assert.equal(context.Chat_hasEnded, false, 'empty active chat remains open');
```

- [ ] **Step 2: Run the focused test and prove RED**

Run:

```bash
node --no-deprecation tools/webos/localVod.test.mjs
```

Expected: FAIL because current code queues `Connected` in `Chat_Messages` and calls `Chat_Init()` from the immediate `Main_Addline()` path.

- [ ] **Step 3: Implement the minimal client fix**

In `Chat_loadChatSuccess()`, replace only the initial connection-status insertion with:

```js
if (null_next && !Chat_loadingMore) {
    Main_emptyWithEle(Chat_div[0]);
    ChatLive_ElementAdd({
        chat_number: 0,
        time: 0,
        message: '<span class="message">' + STR_CHAT_CONNECTED + '</span>'
    });
}
```

Do not change real-message queuing, cursor selection, offset mapping, polling, SSE, or retry behavior.

- [ ] **Step 4: Run the focused test and prove GREEN**

Run:

```bash
node --no-deprecation tools/webos/localVod.test.mjs
```

Expected: `local VOD tests passed`.

- [ ] **Step 5: Commit the regression and fix**

```bash
git add app/specific/ChatVod.js tools/webos/localVod.test.mjs
git commit -m "Fix empty live VOD chat restart loop"
```

### Task 2: Rebuild, validate, and install over the existing app

**Files:**
- Modify: `release/githubio/js/main.js`
- Modify: `release/githubio/js/main_uncompressed.js`
- Modify: `webos/app/appinfo.json`
- Generate: `build/com.tbsniller.smarttwitchwebostv_1.1.38_all.ipk`

- [ ] **Step 1: Run the full source gates**

```bash
npm test
npm run lint
```

Expected: all webOS tests pass and lint exits `0`.

- [ ] **Step 2: Build, bump, and package without removing app data**

```bash
npm run webos:bump-local-version
npm run webos:package
```

Expected: release assets rebuild and the corrected package is version `1.1.38` after the first live install exposed the stale placeholder left by `1.1.37`.

- [ ] **Step 3: Install over the existing app through the rooted TV package service**

The configured `tv-wired` Developer Mode SSH port is unavailable. Stage the exact IPK through `lgtv`, compare the local and remote final-200-byte MD5 values, then call the same package service used by `ares-install`:

```text
luna://com.webos.appInstallService/dev/install
```

Require an `installed` state before removing only the staged IPK from `/media/developer/temp/`. Do not run `webos:remove`, `opkg remove`, or clear app data.

- [ ] **Step 4: Restart the installed app**

```bash
/Users/xenking/.codex/skills/webos-tv-luna-control/scripts/control.sh --device lgtv launch com.tbsniller.smarttwitchwebostv
```

Expected: the package service closes the old process during install, then launch succeeds for `com.tbsniller.smarttwitchwebostv`.

### Task 3: Prove the real TV path and close out Git

**Files:**
- Verify: `webos/app/appinfo.json`
- Verify: installed `/media/developer/apps/usr/palm/applications/com.tbsniller.smarttwitchwebostv/appinfo.json`

- [ ] **Step 1: Verify installed version and visible chat**

Capture a DISPLAY screenshot and confirm the app restores/opens the current `elwycco` local archive VOD. The chat must leave `Chat: Connecting to elwycco VOD` and show `Chat: Connected` or real chat lines.

- [ ] **Step 2: Verify runtime network stability through existing WAM CDP**

Attach through an SSH loopback tunnel to WAM port `9998` and sample Network for at least 10 seconds. Confirm:

```text
/archive/vods/<current-id>/chat/timeline -> 200
/archive/vods/<current-id>/chat?... -> 200
/archive/vods/<current-id>/chat/events?... -> 200 text/event-stream
```

Reject the build if the previous rapid `timeline -> chat -> SSE -> net::ERR_ABORTED` reinitialization loop remains.

- [ ] **Step 3: Re-run post-build gates and inspect the intended diff**

```bash
npm test
npm run lint
git diff --check
git status --short
git diff --stat origin/master...HEAD
```

Expected: tests/lint pass, no whitespace errors, and only the design/plan, source, regression, generated release assets, and version bump are in scope.

- [ ] **Step 4: Commit generated release state**

```bash
git add release/githubio/js/main.js release/githubio/js/main_uncompressed.js webos/app/appinfo.json
git commit -m "chore(webos): bump release to 1.1.38"
```

- [ ] **Step 5: Push and open a draft PR**

```bash
git push -u origin codex/fix-empty-live-vod-chat-loop
gh pr create --draft --base master --head codex/fix-empty-live-vod-chat-loop --title "Fix empty live VOD chat restart loop" --body "Fixes the empty live-window chat reinitialization loop. Adds focused regression coverage, rebuilds webOS release assets, and verifies the installed TV runtime."
```

Expected: branch push and draft PR creation succeed after all local and live checks pass.
