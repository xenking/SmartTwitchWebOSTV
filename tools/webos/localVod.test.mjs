import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const playVodSource = fs.readFileSync('app/specific/PlayVod.js', 'utf8');
const chatVodSource = fs.readFileSync('app/specific/ChatVod.js', 'utf8');
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
assert.match(localVodSource, /function LocalVod_SaveVodHistory/, 'local VOD playback saves independent VOD history');
assert.match(functionBody(localVodSource, 'LocalVod_ApplyVodInfo'), /LocalVod_SaveVodHistory/, 'local VOD info path records resume history');
assert.match(functionBody(localVodSource, 'LocalVod_PlayVodLoadData'), /LocalVod_SaveVodHistory/, 'local VOD load path records resume history even without Twitch info lookup');
assert.match(wtvSource, /function WTV_SaveVodHistory/, 'w.tv VOD playback has independent VOD history path');
assert.match(functionBody(playVodSource, 'PlayVod_ExternalTwitchVodId'), /meta\.twitch_vod_id/, 'local VOD chat and previews use linked Twitch VOD id when present');
assert.match(functionBody(playVodSource, 'PlayVod_CanLoadVodChat'), /LocalVod_CanLoadChat/, 'local-only archive VODs can load archived local chat without a Twitch VOD id');
assert.match(functionBody(playVodSource, 'PlayVod_get_vod_info'), /PlayVod_ExternalTwitchVodId/, 'local VOD info fetch can still load linked Twitch preview metadata');
assert.doesNotMatch(functionBody(playVodSource, 'PlayVod_get_vod_info'), /LocalVod_ApplyVodInfo\(\);\s*return;/, 'local VOD info path must not block linked Twitch seek preview lookup');
assert.match(functionBody(playVodSource, 'PlayVod_get_vod_infoResult'), /LocalVod_IsData\(Main_values_Play_data\)[\s\S]*return;/, 'linked Twitch info must not overwrite local VOD playback data');
assert.match(functionBody(playVodSource, 'PlayVod_previews_success'), /PlayVod_ExternalTwitchVodId/, 'seek preview sprite validation uses linked Twitch VOD id');
assert.match(functionBody(playVodSource, 'PlayVod_previews_success_end'), /PlayVod_ExternalTwitchVodId/, 'seek preview sprite base URL uses linked Twitch VOD id');
assert.match(functionBody(playVodSource, 'PlayVod_previews_move'), /PlayVod_PlayerPositionToPreviewPosition/, 'local joined VOD seek preview positions map to Twitch timeline');
assert.match(functionBody(chatVodSource, 'Chat_loadChatRequest'), /PlayVod_ExternalTwitchVodId/, 'VOD chat request uses linked Twitch VOD id');
assert.match(functionBody(chatVodSource, 'Chat_loadChatRequest'), /LocalVod_LoadChat/, 'local archive VOD chat request uses local archive chat endpoint first');
assert.match(functionBody(chatVodSource, 'Chat_loadChatRequest'), /PlayVod_PlayerSecondsToChatSeconds/, 'VOD chat request offset maps local player time to Twitch time');
assert.match(functionBody(chatVodSource, 'Chat_LocalVodNextOffsetSeconds'), /Chat_Messages/, 'local archive VOD chat pagination advances from loaded message times');
assert.match(functionBody(chatVodSource, 'Chat_loadChatSuccess'), /PlayVod_ChatSecondsToPlayerSeconds/, 'VOD chat message timestamps map Twitch time to local player time');
assert.match(functionBody(chatVodSource, 'Chat_loadChatNextRequest'), /PlayVod_ExternalTwitchVodId/, 'VOD chat cursor request uses linked Twitch VOD id');
assert.match(functionBody(chatVodSource, 'Chat_loadChatNextRequest'), /Chat_LocalVodNextOffsetSeconds/, 'local archive VOD chat next request is offset based');
assert.match(functionBody(screensSource, 'Screens_LoadPreviewStart'), /Screens_LoadExternalVodPreview/, 'local and w.tv VOD previews use their external archive playlist');
assert.match(functionBody(screensSource, 'Screens_LoadPreviewResult'), /Screens_PatchExternalVodPreviewPlaylist/, 'external archive VOD previews patch relative playlist URLs before starting preview');
assert.doesNotMatch(functionBody(wtvSource, 'WTV_GetMeta'), /if \(data\.source_platform === WTV_Platform\) return data;\s*if \(data\[WTV_MetaIndex\]/, 'w.tv array cells must prefer meta index over array object');
assert.doesNotMatch(functionBody(wtvSource, 'WTV_VodStartedAt'), /new Date\(\)\.toISOString/, 'missing w.tv VOD dates must not sort as current wall clock');
assert.doesNotMatch(functionBody(wtvSource, 'WTV_VodDurationSeconds'), /Date\.now\(\)/, 'w.tv VOD duration must come from archive metadata, not wall clock');
assert.match(functionBody(playVodSource, 'PlayVod_WebOSLocalDurationSeconds'), /Play_OpenRewind/, 'ongoing local rewind metadata must avoid wall-clock VOD duration');

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
  assert.equal(context.LocalVod_GetMeta(merged[1]).twitch_timeline_delta_seconds, -1520, 'local joined VOD stores local-to-Twitch timeline delta');

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

console.log('local VOD tests passed');
