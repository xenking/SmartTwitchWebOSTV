import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const playVodSource = fs.readFileSync('app/specific/PlayVod.js', 'utf8');
const screensSource = fs.readFileSync('app/specific/Screens.js', 'utf8');
const screensObjSource = fs.readFileSync('app/specific/ScreensObj.js', 'utf8');
const localVodSource = fs.readFileSync('app/specific/LocalVod.js', 'utf8');
const wtvSource = fs.readFileSync('app/specific/WTV.js', 'utf8');
const bridgeSource = fs.readFileSync('webos/bridge/webosCompatBridge.js', 'utf8');
const indexSource = fs.readFileSync('app/index.html', 'utf8');

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

{
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
  assert.equal(merged[1][7], 'grp-melharucos-20260606T062240.114395769Z', 'June 6 local joined VOD stays near top');
  assert.equal(merged[1][0], 'jun6-thumb.jpg', 'local joined VOD inherits overlapping Twitch thumbnail preview');
  assert.equal(merged.some(vod => vod.id === 'twitch-jun6'), false, 'overlapping Twitch VOD is replaced by local joined VOD');
}

console.log('local VOD tests passed');
