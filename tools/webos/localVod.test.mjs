import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const playVodSource = fs.readFileSync('app/specific/PlayVod.js', 'utf8');
const chatVodSource = fs.readFileSync('app/specific/ChatVod.js', 'utf8');
const mainSource = fs.readFileSync('app/specific/Main.js', 'utf8');
const screensSource = fs.readFileSync('app/specific/Screens.js', 'utf8');
const screensObjSource = fs.readFileSync('app/specific/ScreensObj.js', 'utf8');
const localVodSource = fs.readFileSync('app/specific/LocalVod.js', 'utf8');
const settingsSource = fs.readFileSync('app/specific/Settings.js', 'utf8');
const wtvSource = fs.readFileSync('app/specific/WTV.js', 'utf8');
const bridgeSource = fs.readFileSync('webos/bridge/webosCompatBridge.js', 'utf8');
const indexSource = fs.readFileSync('app/index.html', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} exists`);
  let depth = 0;
  let bodyStart = -1;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') {
      if (bodyStart === -1) bodyStart = i + 1;
      depth++;
    } else if (source[i] === '}') {
      depth--;
      if (bodyStart !== -1 && depth === 0) return source.slice(bodyStart, i);
    }
  }
  throw new Error(`${name} body not found`);
}

function installPlayVodLocalActions(context) {
  vm.createContext(context);
  vm.runInContext(`function PlayVod_WebOSLocalActions() {${functionBody(playVodSource, 'PlayVod_WebOSLocalActions')}}`, context);
}

function createBridgeVideoElement() {
  const listeners = {};
  return {
    id: '',
    style: {},
    currentTime: 0,
    duration: 53246,
    paused: true,
    ended: false,
    readyState: 4,
    networkState: 1,
    buffered: { length: 0, start: () => 0, end: () => 0 },
    seekable: { length: 0, start: () => 0, end: () => 0 },
    setAttribute() {},
    removeAttribute(name) {
      if (name === 'src') this.src = '';
    },
    addEventListener(name, callback) {
      if (!listeners[name]) listeners[name] = [];
      listeners[name].push(callback);
    },
    load() {
      for (const callback of listeners.loadedmetadata || []) callback.call(this);
    },
    play() {
      this.paused = false;
      return { catch() {} };
    },
    pause() {
      this.paused = true;
    },
  };
}

function createBridgeContext(matchResponse, storageEntries) {
  const createdVideos = [];
  let blobCounter = 0;
  const endpointEntries =
    storageEntries === undefined ? [['sttv_webos_local_archive_endpoint', 'http://192.168.0.109:18080']] : storageEntries;
  const storage = new Map([['STTV_FORCE_BRIDGE', '1'], ...endpointEntries]);
  const body = {
    style: {},
    firstChild: null,
    appendChild(node) {
      node.parentNode = this;
      return node;
    },
    insertBefore(node) {
      node.parentNode = this;
      return node;
    },
  };
  const document = {
    body,
    head: { childNodes: [] },
    documentElement: { style: {} },
    createElement(tag) {
      if (tag === 'video') {
        const video = createBridgeVideoElement();
        createdVideos.push(video);
        return video;
      }
      return {
        id: '',
        style: {},
        childNodes: [],
        appendChild(node) {
          node.parentNode = this;
          return node;
        },
        setAttribute() {},
        removeAttribute() {},
      };
    },
    addEventListener() {},
    getElementById() {
      return null;
    },
  };
  const context = {
    console,
    window: null,
    document,
    navigator: { userAgent: 'Mozilla/5.0 webOS' },
    location: { search: '', href: 'file:///app/index.html', replace() {} },
    localStorage: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
    },
    Blob: class {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
      }
    },
    URL: {
      createObjectURL(blob) {
        context.__lastBlob = blob;
        blobCounter += 1;
        return `blob:playlist-${blobCounter}`;
      },
      revokeObjectURL(url) {
        context.__revokedBlobs.push(url);
      },
    },
    __revokedBlobs: [],
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    addEventListener() {},
    XMLHttpRequest: class {
      open(method, url) {
        this.method = method;
        this.url = url;
      }
      send() {
        this.readyState = 4;
        this.status = 200;
        this.responseText = JSON.stringify(matchResponse);
        if (this.onreadystatechange) this.onreadystatechange();
      }
    },
    Play_DurationSeconds: 24480,
    PlayExtra_PicturePicture: false,
    Play_MultiEnable: false,
    Main_IsOn_OSInterface: true,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(bridgeSource, context);
  return { context, createdVideos, storage };
}

{
  const body = functionBody(playVodSource, 'PlayVod_WebOSLocalBridge');
  assert.doesNotMatch(body, /WTV_IsData/, 'w.tv VOD data must not disable the webOS local VOD override');
}

{
  const body = functionBody(playVodSource, 'PlayVod_WebOSLocalSwitchSource');
  assert.doesNotMatch(body, /Already using W\.TV archive/, 'w.tv VOD playback must still allow switching local/Twitch source');
}

{
  const body = functionBody(bridgeSource, 'localVodMatchFromVod');
  assert.doesNotMatch(body, /Date\.now\(\)/, 'local VOD matching must not stretch active recordings to current wall clock');
}

{
  const body = functionBody(bridgeSource, 'localVodAvailableLocalDurationMs');
  assert.doesNotMatch(body, /Date\.now\(\)\s*-\s*sourceStartedAtMs/, 'growing local VOD duration must come from media/index duration, not wall clock');
}

{
  const body = functionBody(bridgeSource, 'localVodReportedDurationMs');
  assert.doesNotMatch(body, /Date\.now\(\)\s*-\s*localVodOverride\.twitchMeta\.startedAtMs/, 'reported local VOD duration must not grow from Twitch wall clock');
}

assert.match(localVodSource, /function LocalVod_MergeChannelVodResponse/, 'generic local VOD merge helper exists');
assert.match(settingsSource, /Settings_IsDeprecatedLocalArchiveEndpoint/, 'settings migrate deprecated local archive endpoint values');
assert.match(localVodSource, /\/archive\/channels\//, 'joined channel VODs come from generic local archive channel data');
assert.doesNotMatch(functionBody(localVodSource, 'LocalVod_StartedAt'), /new Date\(\)\.toISOString/, 'missing local VOD dates must not sort as current wall clock');
assert.match(functionBody(localVodSource, 'LocalVod_ParseTimeMs'), /\\\.\\d\{3\}/, 'local VOD timestamps with nanoseconds must be parsed as millisecond ISO');
assert.match(
  screensObjSource,
  /LocalVod_MergeChannelVodResponse/,
  'channel VOD screen merges local archive VODs before rendering Twitch VODs'
);
assert.match(screensSource, /LocalVod_IsData\(valuesArray\)/, 'local VOD cells render as LOCAL, not W.TV');
assert.doesNotMatch(wtvSource, /WTV_MergeChannelVodResponse|WTV_MergeLocalVodsWithTwitchVods/, 'WTV module does not own generic joined local VOD merge');
assert.match(indexSource, /specific\/LocalVod\.js/, 'LocalVod runtime module is loaded');
assert.match(localVodSource, /function LocalVod_SaveVodHistory/, 'local VOD playback saves independent VOD history');
assert.match(functionBody(localVodSource, 'LocalVod_ApplyVodInfo'), /LocalVod_SaveVodHistory/, 'local VOD info path records resume history');
assert.match(functionBody(localVodSource, 'LocalVod_PlayVodLoadData'), /LocalVod_SaveVodHistory/, 'local VOD load path records resume history even without Twitch info lookup');
assert.match(functionBody(localVodSource, 'LocalVod_PlaybackUrl'), /final_url/, 'local archive finalized direct URLs are playable');
assert.match(wtvSource, /function WTV_SaveVodHistory/, 'w.tv VOD playback has independent VOD history path');
assert.match(mainSource, /function Main_PrepareVodPlaybackData/, 'VOD playback has a reusable context preparation helper');
assert.match(functionBody(mainSource, 'Main_OpenVodStart'), /Main_PrepareVodPlaybackData/, 'manual VOD open persists the full VOD item into Play_data');
assert.match(functionBody(screensSource, 'Screens_first_init'), /Screens_GetRestoreVodData/, 'restore previous playback rebuilds full VOD context before opening');
assert.match(functionBody(screensSource, 'Screens_GetRestoreVodData'), /Main_values\.ChannelVod_vodId/, 'restore can recover damaged Play_data from VOD history id');
assert.match(functionBody(playVodSource, 'PlayVod_ExternalTwitchVodId'), /meta\.twitch_vod_id/, 'local VOD chat and previews use linked Twitch VOD id when present');
assert.match(functionBody(playVodSource, 'PlayVod_ExternalTwitchVodId'), /if \(meta\) return '';/, 'unlinked local archive VOD ids are not treated as Twitch VOD ids');
assert.match(functionBody(playVodSource, 'PlayVod_ExternalTwitchVodId'), /PlayVod_IsLocalArchiveVodId/, 'local archive recording ids are never sent as Twitch VOD ids');
assert.match(functionBody(playVodSource, 'PlayVod_CanLoadVodChat'), /LocalVod_CanLoadChat/, 'local-only archive VODs can load archived local chat without a Twitch VOD id');
assert.match(functionBody(playVodSource, 'PlayVod_get_vod_info'), /PlayVod_ExternalTwitchVodId/, 'local VOD info fetch can still load linked Twitch preview metadata');
assert.doesNotMatch(functionBody(playVodSource, 'PlayVod_get_vod_info'), /LocalVod_ApplyVodInfo\(\);\s*return;/, 'local VOD info path must not block linked Twitch seek preview lookup');
assert.match(functionBody(playVodSource, 'PlayVod_get_vod_infoResult'), /LocalVod_IsData\(Main_values_Play_data\)[\s\S]*return;/, 'linked Twitch info must not overwrite local VOD playback data');
assert.match(functionBody(playVodSource, 'PlayVod_previews_success'), /PlayVod_ExternalTwitchVodId/, 'seek preview sprite validation uses linked Twitch VOD id');
assert.match(functionBody(playVodSource, 'PlayVod_previews_success_end'), /PlayVod_ExternalTwitchVodId/, 'seek preview sprite base URL uses linked Twitch VOD id');
assert.match(functionBody(playVodSource, 'PlayVod_previews_move'), /PlayVod_PlayerPositionToPreviewPosition/, 'local joined VOD seek preview positions map to Twitch timeline');
assert.match(functionBody(chatVodSource, 'Chat_loadChatRequest'), /PlayVod_ExternalTwitchVodId/, 'VOD chat request uses linked Twitch VOD id');
assert.match(functionBody(chatVodSource, 'Chat_loadChatRequest'), /LocalVod_LoadChat/, 'local archive VOD chat request uses local archive chat endpoint first');
assert.match(functionBody(chatVodSource, 'Chat_loadChatRequest'), /Chat_LocalVodChatUnavailable/, 'missing local archive chat falls back to linked Twitch VOD comments');
assert.match(functionBody(chatVodSource, 'Chat_loadTwitchChatOffsetRequest'), /PlayVod_PlayerSecondsToChatSeconds/, 'Twitch VOD chat fallback keeps local-to-Twitch offset mapping');
assert.match(functionBody(chatVodSource, 'Chat_loadTwitchChatOffsetRequest'), /PlayVod_PlayerSecondsToChatSeconds/, 'VOD chat request offset maps local player time to Twitch time');
assert.doesNotMatch(functionBody(chatVodSource, 'Chat_loadChatRequest'), /Chat_offset\s*\?\s*parseInt\(PlayVod_PlayerSecondsToChatSeconds\(Chat_offset\)\)\s*:\s*0/, 'zero-offset local VOD chat requests still apply local-to-Twitch timeline mapping');
assert.match(functionBody(chatVodSource, 'Chat_LocalVodNextOffsetSeconds'), /Chat_Messages/, 'local archive VOD chat pagination advances from loaded message times');
assert.match(functionBody(chatVodSource, 'Chat_loadChatSuccess'), /sourcePlatform === 'local_archive'[\s\S]*PlayVod_ChatSecondsToPlayerSeconds/, 'local archive chat stays on local timeline while Twitch comments map to player time');
assert.match(functionBody(chatVodSource, 'Chat_loadChatNextRequest'), /PlayVod_ExternalTwitchVodId/, 'VOD chat cursor request uses linked Twitch VOD id');
assert.match(functionBody(chatVodSource, 'Chat_loadChatNextRequest'), /Chat_LocalVodNextOffsetSeconds/, 'local archive VOD chat next request is offset based');
assert.match(functionBody(chatVodSource, 'Chat_loadChatNextRequest'), /Chat_loadTwitchChatNextOffsetRequest/, 'local chat next-page fallback uses the next-result path');
assert.match(functionBody(chatVodSource, 'Chat_loadTwitchChatNextOffsetRequest'), /Chat_LocalVodNextOffsetSeconds\(\)[\s\S]*Chat_loadChatNextResult/, 'local chat next-page Twitch fallback continues from the current local offset');
assert.match(functionBody(localVodSource, 'LocalVod_MergeChannelVodResponse'), /LocalVod_FilterTwitchVodsForExistingLocalData/, 'paginated channel VOD loads suppress Twitch entries already represented by local archive cards');
assert.match(functionBody(screensSource, 'Screens_LoadPreviewStart'), /Screens_LoadExternalVodPreview/, 'local and w.tv VOD previews use their external archive playlist');
assert.match(functionBody(screensSource, 'Screens_LoadPreviewResult'), /Screens_PatchExternalVodPreviewPlaylist/, 'external archive VOD previews patch relative playlist URLs before starting preview');
assert.match(functionBody(screensSource, 'Screens_LoadExternalVodPreview'), /playback_kind === 'archive_file'[\s\S]*Screens_LoadPreviewSTop\(\)[\s\S]*return true/, 'direct local archive files clear stale previews and skip HLS preview playlist fetch');
assert.doesNotMatch(functionBody(wtvSource, 'WTV_GetMeta'), /if \(data\.source_platform === WTV_Platform\) return data;\s*if \(data\[WTV_MetaIndex\]/, 'w.tv array cells must prefer meta index over array object');
assert.doesNotMatch(functionBody(wtvSource, 'WTV_VodStartedAt'), /new Date\(\)\.toISOString/, 'missing w.tv VOD dates must not sort as current wall clock');
assert.doesNotMatch(functionBody(wtvSource, 'WTV_VodDurationSeconds'), /Date\.now\(\)/, 'w.tv VOD duration must come from archive metadata, not wall clock');
assert.match(functionBody(playVodSource, 'PlayVod_WebOSLocalDurationSeconds'), /Play_OpenRewind/, 'ongoing local rewind metadata must avoid wall-clock VOD duration');
assert.match(functionBody(bridgeSource, 'localVodMatchFromVod'), /boundedActiveSeconds/, 'active local VOD matching uses a bounded active duration when archive duration is not finalized');
assert.match(functionBody(bridgeSource, 'localVodMatchFromVod'), /final_url/, 'webOS bridge match carries final_url from local archive records');
assert.match(functionBody(bridgeSource, 'localVodNormalizeBackendMatch'), /final_url/, 'webOS bridge backend match normalization preserves final_url');
assert.match(functionBody(bridgeSource, 'localVodPlaybackUrl'), /finalUrl[\s\S]*playlistUrl \|\| fileUrl \|\| finalUrl/, 'webOS bridge playback URL can use final_url direct archive files');
assert.equal(packageJson.scripts['hosted:prepare'], 'npm run webos:prepare-release', 'release workflow hosted prepare entrypoint stays available');

{
  const localMeta = {
    source_platform: 'local_archive',
    recording_group_id: 'grp-elwycco-20260611T201308.651145575Z',
  };
  const fullVodData = [
    'thumb.jpg',
    'elwycco',
    'June 12, 2026',
    'Just Chatting',
    '0',
    'LOCAL',
    'elwycco',
    'grp-elwycco-20260611T201308.651145575Z',
    null,
    'local_archive',
    'elwycco local archive',
    9769,
    '2026-06-11T20:13:08.651145575Z',
    0,
    '94849379',
    'logo.jpg',
    '509658',
    null,
    null,
    localMeta,
  ];
  const context = {
    Main_values: {},
    Main_values_Play_data: null,
    Play_data: { data: [] },
    STR_STARTED: 'Started ',
    STR_PLAYING: 'Playing ',
    Main_Slice: value => value.slice(),
  };
  vm.createContext(context);
  vm.runInContext(`function Main_PrepareVodPlaybackData(data) {${functionBody(mainSource, 'Main_PrepareVodPlaybackData')}}`, context);

  assert.equal(context.Main_PrepareVodPlaybackData(fullVodData), true, 'full VOD data can prepare playback context');
  assert.notEqual(context.Play_data.data, fullVodData, 'prepared VOD data is copied before app mutation');
  assert.equal(context.Play_data.data[7], 'grp-elwycco-20260611T201308.651145575Z', 'prepared Play_data keeps local recording id');
  assert.equal(context.Play_data.data[19], localMeta, 'prepared Play_data keeps local archive metadata');
  assert.equal(context.Play_data.data[18], '509658', 'prepared Play_data keeps game id helper slot');
  assert.equal(context.Main_values.ChannelVod_vodId, 'grp-elwycco-20260611T201308.651145575Z', 'prepared context restores selected VOD id');
  assert.equal(context.ChannelVod_title, 'elwycco local archive', 'prepared context restores VOD title');
}

{
  const fullVodData = [
    'thumb.jpg',
    'elwycco',
    'June 12, 2026',
    'Just Chatting',
    '0',
    'LOCAL',
    'elwycco',
    'grp-elwycco-20260611T201308.651145575Z',
    null,
    'local_archive',
    'elwycco local archive',
    9769,
    '2026-06-11T20:13:08.651145575Z',
    0,
    '94849379',
    'logo.jpg',
    '509658',
    null,
    null,
    {
      source_platform: 'local_archive',
      twitch_vod_id: '2794330615',
    },
  ];
  const damagedSavedVodData = [];
  damagedSavedVodData[3] = 'Just Chatting';
  const context = {
    Main_values: { ChannelVod_vodId: 'grp-elwycco-20260611T201308.651145575Z' },
    AddUser_UserIsSet: () => true,
    Main_history_GetById(type, id) {
      assert.equal(type, 'vod', 'restore reads VOD history');
      assert.equal(id, 'grp-elwycco-20260611T201308.651145575Z', 'restore history lookup uses persisted VOD id');
      return { data: fullVodData };
    },
    LocalVod_IsData: data => !!(data && data[19] && data[19].source_platform === 'local_archive'),
  };
  vm.createContext(context);
  const screensRestoreParams = {
    Screens_RestoreVodDataHasLocalMeta: 'data',
    Screens_RestoreVodDataIsComplete: 'data',
    Screens_GetRestoreVodHistoryData: 'vodId',
    Screens_GetRestoreVodData: 'savedVodData',
  };
  for (const name of Object.keys(screensRestoreParams)) {
    vm.runInContext(`function ${name}(${screensRestoreParams[name]}) {${functionBody(screensSource, name)}}`, context);
  }

  assert.equal(context.Screens_GetRestoreVodData(damagedSavedVodData), fullVodData, 'restore recovers local VOD item from history when saved Play_data is damaged');
  assert.equal(context.Screens_GetRestoreVodData(fullVodData), fullVodData, 'restore keeps complete local VOD data when saved Play_data is intact');
  context.AddUser_UserIsSet = () => false;
  assert.equal(context.Screens_GetRestoreVodData(damagedSavedVodData), null, 'restore rejects incomplete saved VOD data when history is unavailable');
}

{
  const context = {
    Main_values: { ChannelVod_vodId: 'grp-elwycco-20260611T201308.651145575Z' },
    Main_values_Play_data: null,
    Play_data: { data: null },
    WTV_IsData: () => false,
    LocalVod_GetMeta: data => data && data[19],
  };
  vm.createContext(context);
  vm.runInContext(`function LocalVod_ParseTimeMs(value) {${functionBody(localVodSource, 'LocalVod_ParseTimeMs')}}`, context);
  vm.runInContext(`function PlayVod_LocalVodMeta() {${functionBody(playVodSource, 'PlayVod_LocalVodMeta')}}`, context);
  vm.runInContext(`function PlayVod_IsLocalArchiveVodId(vodId) {${functionBody(playVodSource, 'PlayVod_IsLocalArchiveVodId')}}`, context);
  vm.runInContext(`function PlayVod_ExternalTwitchVodId() {${functionBody(playVodSource, 'PlayVod_ExternalTwitchVodId')}}`, context);
  vm.runInContext(`function PlayVod_LocalVodTimelineDeltaSeconds() {${functionBody(playVodSource, 'PlayVod_LocalVodTimelineDeltaSeconds')}}`, context);

  assert.equal(context.PlayVod_ExternalTwitchVodId(), '', 'damaged local restore state must not query Twitch chat with grp-* recording id');

  context.Play_data.data = [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'grp-elwycco-20260611T201308.651145575Z',
    null,
    null,
    null,
    9769,
    '2026-06-11T20:13:08.651145575Z',
    null,
    null,
    null,
    null,
    null,
    null,
    {
      source_platform: 'local_archive',
      twitch_vod_id: '2794330615',
      twitch_timeline_delta_seconds: 30,
      started_at: '2026-06-11T20:13:08.651145575Z',
      twitch_started_at: '2026-06-11T20:12:38Z',
    },
  ];

  assert.equal(context.PlayVod_ExternalTwitchVodId(), '2794330615', 'local archive metadata still exposes linked Twitch VOD id');
  assert.equal(context.PlayVod_LocalVodTimelineDeltaSeconds(), 30.651, 'chat timeline delta uses exact timestamp difference instead of old floored history value');
}

{
  const storage = new Map([['sttv_webos_local_archive_endpoint', 'http://192.168.0.109:18080']]);
  const context = {
    Main_values: {
      Main_selectedChannel: 'melharucos',
      Main_selectedChannelDisplayname: 'melharucos',
      Main_selectedChannel_id: '123',
      Main_selectedChannelLogo: 'logo.png',
      Main_selectedChannelPartner: false,
    },
    IMG_404_VOD: '404-vod.png',
    IMG_404_LOGO: '404-logo.png',
    Settings_GetLocalArchiveEndpoint: () => 'http://192.168.0.109:18080',
    Main_getItemString: () => '',
    localStorage: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
    },
    Main_videoCreatedAt: value => `created:${value}`,
    Main_formatNumber: value => String(value),
    Play_timeHMS(value) {
      const parts = String(value || '').split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return Number(value) || 0;
    },
    twemoji: { parse: value => value },
  };
  vm.createContext(context);
  vm.runInContext(localVodSource, context);

  const twitchVods = [
    {
      id: 'twitch-apr',
      title: 'old twitch',
      createdAt: '2026-04-13T10:00:00Z',
      duration: '06:00:34',
      thumbnailURLs: ['old-thumb.jpg'],
      game_name: 'Just Chatting',
      game_id: '509658',
    },
    {
      id: 'twitch-jun6',
      title: 'matching twitch',
      createdAt: '2026-06-06T06:48:00Z',
      duration: '06:48:00',
      thumbnailURLs: ['jun6-thumb.jpg'],
      game_name: 'Just Chatting',
      game_id: '509658',
    },
  ];
  const localVods = [
    {
      id: 'grp-melharucos-20260607T051210.127333703Z',
      channel: 'melharucos',
      title: 'melharucos local archive 2026-06-07 05:12',
      source_started_at: '2026-06-07T05:12:10.127333703Z',
      duration_seconds: 4185,
      playback_url: '/archive/vods/grp-melharucos-20260607T051210.127333703Z/playlist.m3u8',
      thumbnail_url: '/archive/vods/grp-melharucos-20260607T051210.127333703Z/thumbnail.jpg',
    },
    {
      id: 'grp-melharucos-20260606T062240.114395769Z',
      channel: 'melharucos',
      title: 'melharucos local archive 2026-06-06 06:22',
      source_started_at: '2026-06-06T06:22:40.114395769Z',
      duration_seconds: 53246,
      playback_url: '/archive/vods/grp-melharucos-20260606T062240.114395769Z/playlist.m3u8',
    },
  ];

  const merged = context.LocalVod_MergeWithTwitchVods(twitchVods, localVods, 'melharucos');
  assert.equal(merged[0][7], 'grp-melharucos-20260607T051210.127333703Z', 'nanosecond local VOD date sorts above old Twitch VODs');
  assert.equal(
    merged[0][0],
    'http://192.168.0.109:18080/archive/vods/grp-melharucos-20260607T051210.127333703Z/thumbnail.jpg',
    'local archive thumbnail URLs are absolute for file:// webOS app pages'
  );
  assert.equal(merged[1][7], 'grp-melharucos-20260606T062240.114395769Z', 'June 6 local joined VOD stays near top');
  assert.equal(merged[1][0], 'jun6-thumb.jpg', 'local joined VOD inherits overlapping Twitch thumbnail preview');
  assert.equal(merged.some(vod => vod.id === 'twitch-jun6'), false, 'overlapping Twitch VOD is replaced by local joined VOD');
  assert.equal(context.LocalVod_GetMeta(merged[1]).twitch_vod_id, 'twitch-jun6', 'local joined VOD keeps linked Twitch VOD id for chat/previews');
  assert.equal(context.LocalVod_GetMeta(merged[1]).twitch_started_at, '2026-06-06T06:48:00Z', 'local joined VOD keeps linked Twitch start time');
  assert.equal(context.LocalVod_GetMeta(merged[1]).twitch_duration_seconds, 24480, 'local joined VOD keeps linked Twitch duration for preview mapping');
  assert.equal(context.LocalVod_GetMeta(merged[1]).twitch_timeline_delta_seconds, -1519.886, 'local joined VOD stores precise local-to-Twitch timeline delta');

  const viewSorted = context.LocalVod_MergeWithTwitchVods(
    [
      {
        id: 'twitch-most-viewed',
        title: 'popular twitch',
        createdAt: '2026-06-01T00:00:00Z',
        duration: '01:00:00',
        viewCount: 999,
      },
    ],
    [
      {
        id: 'grp-low-views',
        channel: 'melharucos',
        title: 'low views',
        source_started_at: '2026-06-07T00:00:00Z',
        duration_seconds: 60,
        playback_url: '/archive/vods/grp-low-views/playlist.m3u8',
        viewer_count: 1,
      },
    ],
    'melharucos',
    undefined,
    'views'
  );
  assert.equal(viewSorted[0].id, 'twitch-most-viewed', 'views sort keeps most-viewed Twitch VOD ahead of newer local VODs');

  const unplayableOverlap = context.LocalVod_MergeWithTwitchVods(
    [
      {
        id: 'twitch-playable',
        title: 'twitch playable',
        createdAt: '2026-06-06T06:48:00Z',
        duration: '06:48:00',
      },
    ],
    [
      {
        id: 'grp-unplayable',
        channel: 'melharucos',
        title: 'failed local',
        source_started_at: '2026-06-06T06:22:40.114395769Z',
        duration_seconds: 53246,
      },
    ],
    'melharucos'
  );
  assert.equal(unplayableOverlap.some(vod => vod.id === 'twitch-playable'), true, 'unplayable overlapping local VOD does not suppress Twitch VOD');

  const pageTwoFiltered = context.LocalVod_FilterTwitchVodsForExistingLocalData(
    [
      {
        id: 'twitch-jun6',
        title: 'matching twitch',
        createdAt: '2026-06-06T06:48:00Z',
        duration: '06:48:00',
      },
      {
        id: 'twitch-other',
        title: 'other twitch',
        createdAt: '2026-06-02T00:00:00Z',
        duration: '01:00:00',
      },
    ],
    [merged[1]]
  );
  assert.equal(pageTwoFiltered.some(vod => vod.id === 'twitch-jun6'), false, 'paginated Twitch VOD overlapping an existing local card is suppressed');
  assert.equal(pageTwoFiltered.some(vod => vod.id === 'twitch-other'), true, 'paginated Twitch VOD without local overlap is retained');

  assert.equal(context.LocalVod_HasConfiguredEndpoint(), true, 'explicit local archive endpoint enables blocking local merge path');
  storage.delete('sttv_webos_local_archive_endpoint');
  assert.equal(context.LocalVod_HasConfiguredEndpoint(), false, 'default-only local archive endpoint does not block Twitch VOD rendering');

  const activeLocal = context.LocalVod_BuildData(
    {
      id: 'grp-active',
      channel: 'melharucos',
      title: 'active local',
      active: true,
      source_started_at: '2026-06-07T05:12:10.127333703Z',
      duration_seconds: 60,
      playback_url: '/archive/vods/grp-active/playlist.m3u8',
    },
    'melharucos'
  );
  assert.equal(
    activeLocal[0],
    'https://static-cdn.jtvnw.net/previews-ttv/live_user_melharucos-640x360.jpg',
    'active local Twitch VOD cards use Twitch live preview when archive has no thumbnail'
  );

  const prunedLocal = context.LocalVod_BuildData(
    {
      id: 'grp-pruned',
      channel: 'melharucos',
      title: 'pruned local',
      source_started_at: '2026-06-05T10:28:34.567965595Z',
      duration_seconds: 46362,
      file_url: '/archive/vods/grp-pruned/file',
    },
    'melharucos'
  );
  assert.equal(
    context.LocalVod_GetMeta(prunedLocal).playback_url,
    'http://192.168.0.109:18080/archive/vods/grp-pruned/file',
    'pruned local archive VODs keep their playable file URL'
  );
  assert.equal(context.LocalVod_GetMeta(prunedLocal).playback_kind, 'archive_file', 'file URL local VODs are direct media, not HLS playlists');

  const finalizedLocal = context.LocalVod_BuildData(
    {
      id: 'grp-finalized',
      channel: 'melharucos',
      title: 'finalized local',
      source_started_at: '2026-06-05T10:28:34.567965595Z',
      duration_seconds: 46362,
      final_url: '/archive/vods/grp-finalized/file',
    },
    'melharucos'
  );
  assert.equal(
    context.LocalVod_GetMeta(finalizedLocal).playback_url,
    'http://192.168.0.109:18080/archive/vods/grp-finalized/file',
    'final_url-only local archive VODs keep their playable file URL'
  );

  context.Main_values_Play_data = prunedLocal;
  context.Play_data = { data: prunedLocal };
  context.Main_IsOn_OSInterface = true;
  context.LocalVod_SaveVodHistory = () => {};
  let externalPlaylistRequested = false;
  context.PlayHLS_GetExternalPlayListAsync = () => {
    externalPlaylistRequested = true;
  };
  context.PlayVod_loadDataSuccessEnd = playlist => {
    context.__localVodStartedPlaylist = playlist;
  };
  assert.equal(context.LocalVod_PlayVodLoadData(), true, 'direct local file VOD starts through local VOD path');
  assert.equal(externalPlaylistRequested, false, 'direct local file VOD must not be downloaded as an HLS playlist');
  assert.equal(context.PlayVod_autoUrl, 'http://192.168.0.109:18080/archive/vods/grp-pruned/file', 'direct local file VOD starts from its media URL');
  assert.equal(context.__localVodStartedPlaylist, '', 'direct local file VOD has no playlist body');

  context.Main_values_Play_data = localVods[0] ? context.LocalVod_BuildData(localVods[0], 'melharucos') : activeLocal;
  context.Play_data = { data: context.Main_values_Play_data };
  context.LocalVod_PlayVodLoadDataSuccess({
    status: 200,
    url: 'http://192.168.0.109:18080/archive/vods/grp-active/playlist.m3u8',
    responseText: '#EXTM3U\n#EXTINF:2,\nsegments/000001.ts\n#EXT-X-ENDLIST',
  });
  assert.equal(
    context.PlayVod_autoUrl,
    'http://192.168.0.109:18080/archive/vods/grp-active/playlist.m3u8',
    'local HLS VOD starts from the real HTTP playlist URL, not a blob/data URL'
  );
  assert.match(context.__localVodStartedPlaylist, /http:\/\/192\.168\.0\.109:18080\/archive\/vods\/grp-active\/segments\/000001\.ts/, 'local HLS playlist body still patches relative segment URLs');

  const localMeta = {
    source_platform: 'local_archive',
    recording_group_id: 'grp-melharucos-20260606T062240.114395769Z',
  };
  context.PlayVod_LocalVodMeta = () => localMeta;
  assert.equal(context.LocalVod_CanLoadChat(), true, 'local-only VOD can load archived chat');
  assert.equal(
    context.LocalVod_ChatPath(localMeta, 12.425),
    '/archive/vods/grp-melharucos-20260606T062240.114395769Z/chat?offset_seconds=12.425',
    'local archived chat path uses recording group id and fractional offset seconds'
  );

  const twitchLikeChat = JSON.parse(
    context.LocalVod_ChatResponseToTwitchComments({
      messages: [
        {
          msg_id: 'a4ba2223-0f47-4eb9-aa8d-c71c4c78f73c',
          offset_ms: 12425,
          user_id: '73935315',
          login: 'o_ozzie',
          display_name: 'o_OZzie',
          color: '#FF7F50',
          body: 'Kappa test',
          is_action: false,
          badges: 'subscriber/24,bits-charity/1',
          emotes: '25:0-4',
          deleted: false,
        },
      ],
    })
  );
  const twitchLikeNode = twitchLikeChat.data.video.comments.edges[0].node;
  assert.equal(twitchLikeNode.id, 'a4ba2223-0f47-4eb9-aa8d-c71c4c78f73c', 'local chat msg id maps to Twitch-like comment id');
  assert.equal(twitchLikeNode.contentOffsetSeconds, 12.425, 'local chat offset_ms maps to contentOffsetSeconds');
  assert.equal(twitchLikeNode.sourcePlatform, 'local_archive', 'local chat comments are marked so the player does not remap them from Twitch timeline');
  assert.equal(twitchLikeNode.commenter.displayName, 'o_OZzie', 'local chat display name maps to Twitch-like commenter');
  assert.deepEqual(
    twitchLikeNode.message.userBadges,
    [
      { setID: 'subscriber', version: '24' },
      { setID: 'bits-charity', version: '1' },
    ],
    'local chat badges map to Twitch-like userBadges'
  );
  assert.equal(twitchLikeNode.message.fragments[0].emote.emoteID, '25', 'local chat emote ranges map to Twitch-like fragments');
}

{
  const context = {
    IMG_404_VOD: '404-vod.png',
    IMG_404_LOGO: '404-logo.png',
    Main_values: {},
    Play_data: { data: [] },
    Main_Slice: value => value.slice(),
    Main_getItemString: () => 'http://192.168.0.109:18080',
    Main_videoCreatedAt: value => (value ? `created:${value}` : ''),
    Main_formatNumber: value => String(value),
    Play_timeHMS(value) {
      const parts = String(value || '').split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return Number(value) || 0;
    },
    Play_timeS: value => `${value}s`,
    WTV_AbsoluteArchiveUrl: value => value,
    twemoji: { parse: value => value },
  };
  vm.createContext(context);
  vm.runInContext(wtvSource, context);

  const wtvData = context.WTV_BuildVodData(
    {
      id: 'grp-wtv-20260607T051210.127333703Z',
      channel: 'sosohe',
      title: 'w.tv recording',
      source_started_at: '2026-06-07T05:12:10.127333703Z',
      duration_seconds: 1234,
      playback_url: '/archive/sources/wtv/sosohe/vods/grp/playlist.m3u8',
    },
    'sosohe',
    { display_name: 'mapped twitch', login: 'mapped_login', id: '42', logo: 'logo.png', partner: false }
  );

  assert.equal(context.WTV_GetMeta(wtvData).recording_group_id, 'grp-wtv-20260607T051210.127333703Z', 'w.tv array cell returns metadata object');
  assert.equal(context.WTV_VodStartedAt({}), '', 'w.tv missing start time is empty, not current time');
  assert.equal(context.WTV_VodDurationSeconds({ active: true, source_started_at: '2026-01-01T00:00:00Z' }), 1, 'w.tv active duration does not grow from wall clock');
}

{
  const { context, storage } = createBridgeContext({ matched: false, reason: 'unused' }, [
    ['sttv_webos_local_archive_endpoint', 'http://192.168.0.20:18080'],
  ]);

  assert.equal(storage.get('sttv_webos_local_archive_endpoint'), 'http://192.168.0.109:18080', 'deprecated 0.20 endpoint migrates to HTPC default');
  assert.equal(storage.get('localArchiveEndpoint'), 'http://192.168.0.109:18080', 'deprecated endpoint migration keeps legacy key in sync');
  assert.equal(context.STTVWebOSLocalVod.debugSnapshot().endpoint, 'http://192.168.0.109:18080', 'debug snapshot exposes active local archive endpoint');
}

{
  const { storage } = createBridgeContext({ matched: false, reason: 'unused' }, []);

  assert.equal(storage.get('sttv_webos_local_archive_endpoint'), 'http://192.168.0.109:18080', 'missing endpoint persists HTPC default');
  assert.equal(storage.get('localArchiveEndpoint'), 'http://192.168.0.109:18080', 'missing endpoint persists legacy key default');
}

{
  const context = {
    PlayVod_isOn: true,
    PlayVod_autoUrl: '',
    PlayVod_playlist: '',
    PlayVod_ResumeTime: 0,
    PlayVod_currentTime: 0,
    Main_vodOffset: 0,
    Main_values: { ChannelVod_vodId: 'twitch-jun6' },
    PlayVod_WebOSLocalUpdateControlLabel() {},
    PlayVod_WebOSLocalNotify() {},
    Play_showBufferDialog() {},
    Play_HideBufferDialog() {},
    PlayVod_WarnEnd() {},
    PlayVod_SaveVodIds(value) {
      context.__savedVodOffset = value;
    },
    PlayVod_loadDataSuccessEnd(playlist) {
      context.__startedPlaylist = playlist;
    },
  };
  installPlayVodLocalActions(context);

  context.PlayVod_WebOSLocalActions().playLocal({
    url: 'http://192.168.0.109:18080/archive/vods/grp/playlist.m3u8',
    playlist: '',
    offsetSeconds: 1520,
    twitchOffsetSeconds: 0,
  });

  assert.equal(context.PlayVod_autoUrl, 'http://192.168.0.109:18080/archive/vods/grp/playlist.m3u8', 'local override starts the matched local URL');
  assert.equal(context.Main_vodOffset, 0.001, 'zero Twitch offset remains near start instead of falling back to local offset');
  assert.equal(context.PlayVod_ResumeTime, 0.001, 'zero Twitch offset resume remains near start');
  assert.equal(context.__savedVodOffset, 0.001, 'zero Twitch offset history save remains near start');
}

{
  const matchResponse = {
    matched: true,
    position_within_recording: true,
    offset_seconds: 1520,
    delta_seconds: -1520,
    playback_url: '/archive/vods/grp/playlist.m3u8',
    vod: {
      channel: 'melharucos',
      source_started_at: '2026-06-06T06:22:40Z',
      duration_seconds: 53246,
      playback_url: '/archive/vods/grp/playlist.m3u8',
    },
  };
  const { context, createdVideos } = createBridgeContext(matchResponse);
  const meta = {
    login: 'melharucos',
    vodId: 'twitch-jun6',
    startedAt: '2026-06-06T06:48:00Z',
    durationSeconds: 24480,
    positionSeconds: 0,
    playerPositionSeconds: 0,
    toleranceSeconds: 600,
  };
  let localResult = null;
  let twitchResult = null;
  const actions = {
    updateState() {},
    notify() {},
    playLocal(result) {
      localResult = result;
      context.Android.StartAuto(result.url, result.playlist || '', 2, result.twitchOffsetSeconds * 1000, 0);
    },
    playTwitch(result) {
      twitchResult = result;
    },
  };

  assert.equal(context.STTVWebOSLocalVod.load(meta, actions), true, 'bridge local override accepts matched local VOD');
  assert.equal(localResult.twitchOffsetSeconds, 0, 'bridge preserves explicit zero Twitch offset');
  assert.equal(localResult.offsetSeconds, 1520, 'bridge still provides local offset for media start conversion');
  assert.equal(createdVideos[0].currentTime, 1520, 'local playback starts at the local media offset for Twitch zero');
  assert.equal(context.Android.gettime(), 0, 'local playback reports Twitch timeline zero to app code');

  context.Android.mseekTo(300000);
  assert.equal(createdVideos[0].currentTime, 1820, 'local VOD seek converts Twitch offset to local media offset');
  assert.equal(context.Android.gettime(), 300000, 'local VOD gettime reports Twitch timeline after seek');

  assert.equal(context.STTVWebOSLocalVod.switchSource(meta, actions), true, 'bridge can switch local playback back to Twitch');
  assert.equal(twitchResult.offsetSeconds, 300, 'switching local to Twitch preserves current Twitch timeline offset');
}

{
  const { context, createdVideos } = createBridgeContext({ matched: false, reason: 'unused' });
  const playlist = '#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:2,\nhttp://192.168.0.109:18080/archive/vods/grp/segments/000001.ts\n#EXT-X-ENDLIST';

  context.Android.StartAuto('http://192.168.0.109:18080/archive/vods/grp/playlist.m3u8', playlist, 2, 120000, 0);

  assert.equal(createdVideos[0].src, 'blob:playlist-1', 'webOS bridge plays patched media playlist body so local VOD seekability is preserved');
  assert.equal(context.__lastBlob.parts.length, 1, 'patched media playlist Blob has one body part');
  assert.equal(context.__lastBlob.parts[0], playlist, 'patched media playlist body is used for the playback Blob');
  assert.equal(createdVideos[0].currentTime, 120, 'media playlist Blob playback still applies VOD resume position');
}

console.log('local VOD tests passed');
