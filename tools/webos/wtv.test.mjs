import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const wtvSource = fs.readFileSync('app/specific/WTV.js', 'utf8');
const channelContentSource = fs.readFileSync('app/specific/ChannelContent.js', 'utf8');
const mainSource = fs.readFileSync('app/specific/Main.js', 'utf8');
const playSource = fs.readFileSync('app/specific/Play.js', 'utf8');
const playEtcSource = fs.readFileSync('app/specific/PlayEtc.js', 'utf8');
const screensSource = fs.readFileSync('app/specific/Screens.js', 'utf8');
const screensObjSource = fs.readFileSync('app/specific/ScreensObj.js', 'utf8');
const userLiveFeedSource = fs.readFileSync('app/specific/UserLiveFeed.js', 'utf8');

function functionBody(source, name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `${name} exists`);
  const start = match.index;
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

function createContext() {
  const captured = {};
  const storage = {};
  const context = {
    console,
    captured,
    IMG_404_BANNER: 'banner.jpg',
    IMG_404_LOGO: 'logo.jpg',
    IMG_404_VOD: 'vod.jpg',
    STR_LIVE: 'LIVE',
    STR_STARTED: 'Started',
    STR_PLAYING: ' playing ',
    Play_data: { data: null },
    Main_values_Play_data: null,
    Main_values: {},
    Main_IsOn_OSInterface: true,
    Main_vodOffset: 0,
    PlayVod_ResumeTime: 0,
    Play_DurationSeconds: 0,
    Play_isOn: false,
    PlayVod_isOn: false,
    PlayClip_isOn: false,
    Main_clearAllPlayerEvents() {},
    Main_showLoadDialog() {
      captured.loadShown = true;
    },
    Main_HideLoadDialog() {
      captured.loadHidden = true;
    },
    OSInterface_showToast(message) {
      captured.toast = message;
    },
    Play_PreshutdownStream() {},
    PlayVod_PreshutdownStream() {},
    PlayClip_PreshutdownStream() {},
    Main_openVod() {
      captured.openVod = true;
      captured.openVodOffset = context.Main_vodOffset;
      captured.openVodResume = context.PlayVod_ResumeTime;
    },
    Main_EventPlay(...args) {
      captured.eventPlay = args;
    },
    Main_Set_history(type, data) {
      captured.historySet = {type, data};
    },
    PlayVod_autoUrl: '',
    WTV_PlayVodBlobUrl: '',
    Main_getItemString(key, fallback = '') {
      if (Object.prototype.hasOwnProperty.call(storage, key)) return storage[key];
      if (key === 'sttv_webos_local_archive_endpoint') return 'http://archive.local:18080';
      return fallback;
    },
    Main_setItem(key, value) {
      storage[key] = String(value);
    },
    Main_A_includes_B(a, b) {
      return String(a).indexOf(String(b)) > -1;
    },
    Main_formatNumber(value) {
      return String(value);
    },
    Main_videoCreatedAt(value) {
      return value;
    },
    Play_timeS(value) {
      return String(value);
    },
    Play_timeHMS(value) {
      const hms = /^(\d+)h(\d+)m(\d+)s$/.exec(String(value || ''));
      return hms ? Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]) : 0;
    },
    Play_streamLiveAt(value) {
      return value;
    },
    twemoji: {
      parse(value) {
        return value;
      },
    },
    window: null,
    Blob: class {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
      }
    },
    URL: {
      createObjectURL(blob) {
        captured.blob = blob;
        return 'blob:wtv-playlist';
      },
      revokeObjectURL() {},
    },
    Play_loadDataSuccessEnd(playlist, startChat) {
      captured.livePlaylist = playlist;
      captured.liveStartChat = startChat;
    },
    PlayVod_loadDataSuccessEnd(playlist) {
      captured.vodPlaylist = playlist;
    },
    PlayHLS_GetExternalPlayListAsync(url, id, headers, callback) {
      captured.playlistFetch = {url, id, headers, callback: typeof callback};
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(wtvSource, context);
  return context;
}

const eventPlaylist = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-PLAYLIST-TYPE:EVENT
#EXTINF:2.000,
/archive/vods/grp-wtv-kuboeb/segments/sess-wtv-kuboeb/000000001.ts
#EXTINF:2.000,
segments/sess-wtv-kuboeb/000000002.ts
`;

{
  const context = createContext();
  let fallbackCalls = 0;
  context.WTV_GetLiveFromActiveArchive = () => fallbackCalls++;
  context.WTV_Request = (path, method, body, success) => {
    assert.equal(path, '/archive/sources/wtv/kuboeb/live', 'W.TV live check uses direct status endpoint');
    assert.equal(method, null);
    assert.equal(body, null);
    success({online: true, playback_kind: 'direct_hls'});
  };
  let status;
  context.WTV_GetLive('kuboeb', value => { status = value; });
  assert.equal(status.online, true, 'direct W.TV live status remains primary');
  assert.equal(fallbackCalls, 0, 'active archive fallback is not called after direct success');

  context.WTV_Request = (_path, _method, _body, _success, error) => error('offline');
  context.WTV_GetLive('kuboeb', () => {}, () => {});
  assert.equal(fallbackCalls, 1, 'active archive lookup is the fallback after direct status failure');
}

{
  const context = createContext();
  const liveStatus = context.WTV_BuildLiveStatusFromArchiveVod(
    {
      id: 'grp-wtv-kuboeb',
      source_channel: 'kuboeb',
      playback_url: '/archive/vods/grp-wtv-kuboeb/playlist.m3u8',
      thumbnail_url: '/archive/vods/grp-wtv-kuboeb/thumbnail.jpg',
      preview_url: '/archive/vods/grp-wtv-kuboeb/thumbnail.jpg',
      status: 'open',
      active: true,
      growing: true,
    },
    'kuboeb'
  );
  assert.equal(
    liveStatus.thumbnail_url,
    'http://archive.local:18080/archive/vods/grp-wtv-kuboeb/thumbnail.jpg',
    'archive fallback live thumbnail is absolute for file:// webOS runtime'
  );
	assert.equal(context.WTV_BuildLiveStatusFromArchiveVod({source_channel: 'kuboeb', playback_url: '/archive/vods/live/playlist.m3u8', viewer_count: 42}, 'kuboeb').viewer_count, 42, 'archive live status preserves W.TV viewer count');

  assert.equal(typeof context.WTV_PlayLiveLoadDataSuccess, 'function', 'W.TV live playlist success helper exists');

  const playbackUrl = 'http://archive.local:18080/archive/vods/grp-wtv-kuboeb/playlist.m3u8';
  context.Play_data.data = context.WTV_BuildLiveData(
    {
      channel: 'kuboeb',
      playback_url: playbackUrl,
      playback_kind: 'archive_hls',
      active: true,
      growing: true,
      status: 'open',
    },
    'live'
  );

  context.WTV_PlayLiveLoadDataSuccess({ status: 200, url: playbackUrl, responseText: eventPlaylist });
  const patchedLivePlaylist = context.WTV_PatchPlaylistForData(context.Play_data.data, eventPlaylist, playbackUrl);

  assert.match(
    patchedLivePlaylist,
    /http:\/\/archive\.local:18080\/archive\/vods\/grp-wtv-kuboeb\/segments\/sess-wtv-kuboeb\/000000001\.ts/,
    'W.TV playlist patcher uses absolute archive segment URLs'
  );
  assert.match(
    patchedLivePlaylist,
    /http:\/\/archive\.local:18080\/archive\/vods\/grp-wtv-kuboeb\/segments\/sess-wtv-kuboeb\/000000002\.ts/,
    'W.TV playlist patcher resolves relative segment URLs from playlist URL'
  );
  assert.doesNotMatch(patchedLivePlaylist, /#EXT-X-PLAYLIST-TYPE:VOD/, 'W.TV active archive patch keeps EVENT playlist type');
  assert.doesNotMatch(patchedLivePlaylist, /#EXT-X-ENDLIST/, 'W.TV active archive patch does not close a growing playlist');
  assert.equal(context.Play_data.AutoUrl, playbackUrl, 'W.TV live playback keeps direct archive HLS URL');
  assert.equal(context.captured.livePlaylist, '', 'W.TV archive HLS live playback avoids blob media playlists on webOS');
  assert.equal(context.captured.liveStartChat, false, 'W.TV live fallback does not start Twitch chat');
}

{
  const context = createContext();
  context.WTV_GetCurrentChannelMapping = () => ({
    twitch_login: 'streamer',
    twitch_display_name: 'Streamer',
    twitch_id: '123',
    twitch_logo: 'logo.jpg',
    wtv_channel: 'kuboeb',
  });
  context.WTV_GetChannelVods = (_channel, success) => success({vods: [
    {
      id: 'wtv-finished',
      source_channel: 'kuboeb',
      status: 'finalized',
      started_at: '2026-07-12T10:00:00Z',
      duration_seconds: 100,
      file_url: '/archive/vods/wtv-finished/file',
    },
    {
      id: 'wtv-active',
      source_channel: 'kuboeb',
      status: 'open',
      active: true,
      playback_url: '/archive/vods/wtv-active/playlist.m3u8',
    },
  ]});
  const response = {edges: [{id: 'twitch-vod', created_at: '2026-07-11T10:00:00Z'}]};
  let merged;
  context.WTV_MergeChannelVodResponse({periodPos: 0, data: null, highlight: false}, response, value => { merged = value; });
  assert.deepEqual(Array.from(merged.edges, item => item.id || item[7]), ['wtv-finished', 'twitch-vod'], 'finalized mapped W.TV recordings merge beside Twitch VODs; active recording stays out');
}

{
  const context = createContext();
  assert.equal(context.WTV_VodViewCount({viewCount: 123}), 123, 'views sort reads Twitch GraphQL viewCount');
  context.LocalVod_GetMeta = data => data && data.localMeta;
  assert.equal(
    context.WTV_VodSortTime({localMeta: {started_at: '2026-07-10T10:00:00Z'}}),
    Date.parse('2026-07-10T10:00:00Z'),
    'recent sort reads local archive metadata inserted before W.TV merge'
  );
}

{
  const context = createContext();
  context.WTV_GetCurrentChannelMapping = () => ({twitch_login: 'streamer', twitch_id: '123', wtv_channel: 'kuboeb'});
  context.WTV_GetChannelVods = (_channel, success) => success({vods: [{
    id: 'wtv-80',
    source_channel: 'kuboeb',
    status: 'finalized',
    started_at: '2026-07-01T10:00:00Z',
    duration_seconds: 100,
    viewer_count: 80,
    file_url: '/archive/vods/wtv-80/file',
  }]});
  const screen = {periodPos: 2, data: null, dataEnded: false, highlight: false};
  let firstPage;
  context.WTV_MergeChannelVodResponse(screen, {edges: [{id: 'tw-100', viewCount: 100}, {id: 'tw-90', viewCount: 90}]}, value => { firstPage = value; });
  assert.deepEqual(Array.from(firstPage.edges, item => item.id || item[7]), ['tw-100', 'tw-90'], 'lower-view W.TV VOD is deferred past the first Twitch page');
  screen.data = firstPage.edges;
  let secondPage;
  context.WTV_MergeChannelVodResponse(screen, {edges: [{id: 'tw-70', viewCount: 70}, {id: 'tw-60', viewCount: 60}]}, value => { secondPage = value; });
  assert.deepEqual(Array.from(secondPage.edges, item => item.id || item[7]), ['wtv-80', 'tw-70', 'tw-60'], 'deferred W.TV VOD is inserted on the page matching the global views order');
}

{
  const context = createContext();
  const playbackUrl = 'http://archive.local:18080/archive/vods/grp-wtv-kuboeb/file';
  const vodData = context.WTV_BuildVodData(
    {
      id: 'grp-wtv-kuboeb',
      channel: 'wtv/kuboeb',
      file_url: '/archive/vods/grp-wtv-kuboeb/file',
      final_url: '/recordings/grp-wtv-kuboeb/download',
      status: 'finalized',
      active: false,
      growing: false,
      started_at: '2026-06-13T17:53:06Z',
      duration_seconds: 6110,
    },
    'kuboeb',
    {
      display_name: 'melharucos',
      login: 'melharucos',
      id: '26819117',
      logo: 'logo.jpg',
      partner: false,
    }
  );

  assert.equal(vodData[19].playback_url, playbackUrl, 'finalized W.TV VOD uses direct archive file URL');
  assert.equal(vodData[19].playback_kind, 'archive_file', 'finalized W.TV VOD is not treated as HLS playlist');

  context.Main_values_Play_data = vodData;
  assert.equal(context.WTV_PlayVodLoadData(), true, 'finalized W.TV VOD load is handled by W.TV direct file path');
  assert.equal(context.PlayVod_autoUrl, playbackUrl, 'finalized W.TV VOD opens direct file URL');
  assert.equal(context.captured.vodPlaylist, '', 'finalized W.TV VOD passes empty playlist string');
  assert.equal(context.captured.playlistFetch, undefined, 'finalized W.TV VOD does not fetch MKV as a playlist');
}

{
  const context = createContext();
  const playbackUrl = 'http://archive.local:18080/recordings/grp-wtv-kuboeb/download';
  const vodData = context.WTV_BuildVodData(
    {
      id: 'grp-wtv-kuboeb',
      channel: 'wtv/kuboeb',
      final_url: '/recordings/grp-wtv-kuboeb/download',
      status: 'finalized',
      active: false,
      growing: false,
      started_at: '2026-06-13T17:53:06Z',
      duration_seconds: 6110,
    },
    'kuboeb',
    {
      display_name: 'melharucos',
      login: 'melharucos',
      id: '26819117',
      logo: 'logo.jpg',
      partner: false,
    }
  );

  assert.equal(vodData[19].playback_url, playbackUrl, 'finalized W.TV VOD accepts final_url outside /archive/vods/');
  assert.equal(vodData[19].playback_kind, 'archive_file', 'final_url-only W.TV VOD opens as direct file playback');

  context.Main_values_Play_data = vodData;
  assert.equal(context.WTV_PlayVodLoadData(), true, 'final_url-only W.TV VOD load is handled by W.TV direct file path');
  assert.equal(context.PlayVod_autoUrl, playbackUrl, 'final_url-only W.TV VOD opens direct final URL');
  assert.equal(context.captured.vodPlaylist, '', 'final_url-only W.TV VOD passes empty playlist string');

  context.Main_vodOffset = 321;
  context.PlayVod_ResumeTime = 321;
  assert.equal(context.WTV_OpenVodData(vodData), true, 'finalized W.TV VOD history data opens through WTV helper');
  assert.equal(context.captured.openVodOffset, 321, 'finalized W.TV VOD preserves saved watched offset');
  assert.equal(context.captured.openVodResume, 321, 'finalized W.TV VOD preserves saved resume offset');
}

{
  const context = createContext();
  const staleVodData = context.WTV_BuildVodData(
    {
      id: 'grp-wtv-kuboeb',
      channel: 'wtv/kuboeb',
      playback_url: '/archive/vods/grp-wtv-kuboeb/playlist.m3u8',
      status: 'open',
      active: true,
      growing: true,
      started_at: '2026-06-13T17:53:06Z',
      duration_seconds: 5240,
    },
    'kuboeb',
    {
      display_name: 'melharucos',
      login: 'melharucos',
      id: '26819117',
      logo: 'logo.jpg',
      partner: false,
    }
  );

  context.WTV_GetChannelMapping = () => ({wtv_channel: 'kuboeb'});
  context.WTV_GetChannelVods = (channel, success) => {
    context.captured.lookupChannel = channel;
    success({
      vods: [
        {
          id: 'grp-wtv-kuboeb',
          channel: 'wtv/kuboeb',
          file_url: '/archive/vods/grp-wtv-kuboeb/file',
          status: 'finalized',
          active: false,
          growing: false,
          started_at: '2026-06-13T17:53:06Z',
          duration_seconds: 6110,
        },
      ],
    });
  };
  context.WTV_OpenVod = (vod, channel, identity, previousLiveData) => {
    context.captured.openedVod = {vod, channel, identity, previousLiveData};
  };

  assert.equal(context.WTV_OpenHistoryVod(staleVodData), true, 'stale active W.TV VOD history is handled');
  assert.equal(context.captured.lookupChannel, 'kuboeb', 'stale active W.TV VOD history refreshes archive source');
  assert.equal(context.captured.openedVod.vod.file_url, '/archive/vods/grp-wtv-kuboeb/file', 'stale W.TV VOD opens latest finalized file VOD');
  assert.equal(context.captured.openVod, undefined, 'stale active W.TV VOD does not open old playlist data directly');
}

{
  const context = createContext();
  const vodData = context.WTV_BuildVodData(
    {
      id: 'grp-wtv-kuboeb',
      channel: 'wtv/kuboeb',
      playback_url: '/archive/vods/grp-wtv-kuboeb/playlist.m3u8',
      status: 'open',
      active: true,
      growing: true,
      started_at: '2026-06-13T17:53:06Z',
      duration_seconds: 5240,
    },
    'kuboeb',
    {
      display_name: 'melharucos',
      login: 'melharucos',
      id: '26819117',
      logo: 'logo.jpg',
      partner: false,
    }
  );

  vodData[11] = '01:32:43';
  vodData[19].duration_seconds = 0;
  context.Main_vodOffset = 9999;
  context.PlayVod_ResumeTime = 9999;
  assert.equal(context.WTV_OpenVodData(vodData), true, 'W.TV VOD history data opens through WTV helper');
  assert.equal(context.captured.openVod, true, 'W.TV VOD helper reaches Main_openVod');
  assert.equal(context.captured.openVodOffset, 0.001, 'W.TV VOD helper starts from safe webOS offset');
  assert.equal(context.captured.openVodResume, 0.001, 'W.TV VOD helper resets resume offset before opening');
  assert.equal(context.Play_DurationSeconds, 5563, 'W.TV VOD history duration parses HH:MM:SS instead of one second');
}

{
  const context = createContext();
  const vodData = context.WTV_BuildVodData(
    {
      id: 'grp-wtv-kuboeb',
      channel: 'wtv/kuboeb',
      playback_url: '/archive/vods/grp-wtv-kuboeb/playlist.m3u8',
      thumbnail_url: '/archive/vods/grp-wtv-kuboeb/thumbnail.jpg',
      started_at: '2026-06-13T17:53:06Z',
      duration_seconds: 120,
    },
    'kuboeb',
    {
      display_name: 'kuboeb',
      login: 'kuboeb',
      id: 'wtv:kuboeb',
      logo: 'logo.jpg',
      partner: false,
    }
  );
  assert.equal(
    vodData[0],
    'http://archive.local:18080/archive/vods/grp-wtv-kuboeb/thumbnail.jpg',
    'archive VOD thumbnail is absolute for file:// webOS runtime'
  );

  const playbackUrl = 'http://archive.local:18080/archive/vods/grp-wtv-kuboeb/playlist.m3u8';
  context.Main_values_Play_data = context.WTV_BuildVodData(
    {
      id: 'grp-wtv-kuboeb',
      channel: 'wtv/kuboeb',
      playback_url: '/archive/vods/grp-wtv-kuboeb/playlist.m3u8',
      status: 'open',
      active: true,
      growing: true,
      started_at: '2026-06-13T17:53:06Z',
      duration_seconds: 120,
    },
    'kuboeb',
    {
      display_name: 'kuboeb',
      login: 'kuboeb',
      id: 'wtv:kuboeb',
      logo: 'logo.jpg',
      partner: false,
    }
  );

  context.WTV_PlayVodLoadDataSuccess({ status: 200, url: playbackUrl, responseText: eventPlaylist });
  const patchedVodPlaylist = context.WTV_PatchPlaylistForData(context.Main_values_Play_data, eventPlaylist, playbackUrl);

  assert.match(
    patchedVodPlaylist,
    /http:\/\/archive\.local:18080\/archive\/vods\/grp-wtv-kuboeb\/segments\/sess-wtv-kuboeb\/000000001\.ts/,
    'growing W.TV VOD playlist uses absolute archive segment URLs'
  );
  assert.doesNotMatch(patchedVodPlaylist, /#EXT-X-ENDLIST/, 'growing W.TV VOD playlist remains open');
  assert.equal(context.PlayVod_autoUrl, playbackUrl, 'W.TV VOD playback keeps direct archive HLS URL');
  assert.equal(context.captured.vodPlaylist, '', 'W.TV archive HLS VOD playback avoids blob media playlists on webOS');
  assert.equal(context.captured.blob, undefined, 'W.TV archive HLS playback does not create a playlist blob');
}

{
  const context = createContext();
  const staleData = context.WTV_BuildLiveData(
    {
      channel: 'kuboeb',
      playback_url: 'file:///archive/vods/grp-wtv-kuboeb/playlist.m3u8',
      thumbnail_url: 'file:///archive/vods/grp-wtv-kuboeb/thumbnail.jpg',
      playback_kind: 'archive_hls',
    },
    'live'
  );
  staleData[0] = 'file:///archive/vods/grp-wtv-kuboeb/thumbnail.jpg';
  staleData[19].playback_url = 'file:///archive/vods/grp-wtv-kuboeb/playlist.m3u8';

  context.WTV_NormalizeDataUrls(staleData);

  assert.equal(
    staleData[0],
    'http://archive.local:18080/archive/vods/grp-wtv-kuboeb/thumbnail.jpg',
    'stale W.TV history thumbnail file URL is normalized for webOS'
  );
  assert.equal(
    staleData[19].playback_url,
    'http://archive.local:18080/archive/vods/grp-wtv-kuboeb/playlist.m3u8',
    'stale W.TV playback file URL is normalized for webOS'
  );

  const historyEntry = {
    data: staleData,
    forceVod: true,
    vodid: 'grp-wtv-kuboeb',
    vodimg: 'file:///archive/vods/grp-wtv-kuboeb/thumbnail.jpg',
  };
  context.WTV_NormalizeHistoryEntry('live', historyEntry);
  assert.equal(historyEntry.forceVod, false, 'active/growing W.TV live history is not forced into finished VOD mode');
  assert.equal(
    historyEntry.vodimg,
    'http://archive.local:18080/archive/vods/grp-wtv-kuboeb/thumbnail.jpg',
    'W.TV live history VOD image is normalized for webOS'
  );

  const historyData = {user: {live: [historyEntry], vod: []}};
  historyEntry.forceVod = true;
  assert.equal(context.WTV_NormalizeHistoryData(historyData), true, 'W.TV history migration reports persisted changes');
  assert.equal('wtv_changed' in historyEntry, false, 'W.TV history migration does not persist internal change marker');
}

{
  assert.doesNotMatch(
    functionBody(channelContentSource, 'ChannelContent_CheckMappedWTVLive'),
    /\|\|\s*ChannelContent_responseText/,
    'mapped W.TV lookup still runs when Twitch reports the channel online'
  );
  assert.match(
    functionBody(channelContentSource, 'ChannelContent_loadDataSuccess'),
    /ChannelContent_CheckMappedWTVLive\(false\);/,
    'channel content refreshes mapped W.TV state after rendering Twitch or offline state'
  );
  assert.doesNotMatch(
    functionBody(channelContentSource, 'ChannelContent_ScheduleWTVCheck'),
    /ChannelContent_responseText/,
    'mapped W.TV channel pages keep polling after a W.TV cell replaces an online Twitch cell'
  );
  assert.match(
    functionBody(channelContentSource, 'ChannelContent_IsMappedWTVLiveCell'),
    /WTV_IsData\(ChannelContent_DataObj\)/,
    'channel content can detect a stale mapped W.TV live cell'
  );
  assert.match(
    functionBody(channelContentSource, 'ChannelContent_MappedWTVLiveResult'),
    /ChannelContent_isoffline \|\| ChannelContent_IsMappedWTVLiveCell\(\)/,
    'offline W.TV poll clears a stale mapped W.TV live cell'
  );
  assert.doesNotMatch(
    functionBody(channelContentSource, 'ChannelContent_MappedWTVLiveResult'),
    /else\s+if\s*\(!ChannelContent_isoffline\)/,
    'offline W.TV response must not replace an online Twitch cell with offline state'
  );
  assert.doesNotMatch(
    functionBody(wtvSource, 'WTV_AddMappedLiveToUserFeed'),
    /existingPos !== null && !WTV_MappedFeedSlotIsWTV[\s\S]*?return;/,
    'mapped W.TV feed entry may replace an existing Twitch live item for the same channel'
  );
  assert.match(
    functionBody(wtvSource, 'WTV_AddMappedLiveToUserFeed'),
    /existingPos === null[\s\S]*Sidepannel_Html \+= sideHtml[\s\S]*else[\s\S]*WTV_RefreshMappedLiveSideFeed\(pos\)/,
    'mapped W.TV feed replacement refreshes the existing side-panel row'
  );
  assert.match(
    functionBody(wtvSource, 'WTV_RefreshMappedLiveSideFeed'),
    /Sidepannel_Html = html;[\s\S]*Main_innerHTMLWithEle\(Sidepannel_ScroolDoc, Sidepannel_Html\)/,
    'mapped W.TV side-panel refresh keeps cached HTML and rendered DOM in sync'
  );
  assert.match(
    functionBody(screensSource, 'Screens_LoadPreviewStart'),
    /WTV_IsData/,
    'W.TV live previews use external W.TV playback URL instead of Twitch usher URL'
  );
  assert.match(
    functionBody(screensSource, 'Screens_LoadPreviewResult'),
    /WTV_PlaylistForPlayback\(StreamInfo/,
    'W.TV live preview uses direct archive HLS URLs instead of blob media playlists'
  );
  assert.match(
    functionBody(screensSource, 'Screens_PatchExternalVodPreviewPlaylist'),
    /WTV_PlaylistForPlayback\(streamInfo/,
    'W.TV VOD preview uses direct archive HLS URLs instead of blob media playlists'
  );
  assert.match(
    functionBody(wtvSource, 'WTV_ShouldUseDirectPlaylistUrl'),
    /playback_kind === 'archive_hls'[\s\S]*\/archive\/vods\//,
    'W.TV archive HLS playback is routed through direct HTTP playlist URLs'
  );
  assert.match(
    functionBody(userLiveFeedSource, 'UserLiveFeed_refreshThumb'),
    /var currentDiv = Main_getElementById\(UserLiveFeed_ids\[1\] \+ id\);[\s\S]*if \(currentDiv\) currentDiv\.src = url;/,
    'live feed thumbnail refresh ignores stale DOM nodes after W.TV feed replacement'
  );
  assert.match(
    functionBody(mainSource, 'Main_Set_history'),
    /typeof Data\[7\] === 'undefined'/,
    'incomplete live history data cannot crash restore/update flows'
  );
  assert.match(
    functionBody(mainSource, 'Main_Set_history'),
    /WTV_NormalizeHistoryEntry\(type, ArrayPos\)/,
    'existing W.TV live history entries are normalized when refreshed'
  );
  assert.match(
    functionBody(mainSource, 'Main_StartHistoryworker'),
    /WTV_IsActiveArchiveData\(array\[i\]\.data\)[\s\S]*continue;/,
    'active W.TV archive live history is not reclassified by the Twitch broadcast worker'
  );
  assert.match(
    functionBody(mainSource, 'Main_OPenAsVod'),
    /WTV_IsActiveArchiveData\(Main_values_Play_data\)[\s\S]*Main_openStream\(\);[\s\S]*return;/,
    'active W.TV archive history opens as live, not as calculated-offset Twitch VOD'
  );
  assert.match(
    functionBody(mainSource, 'Main_Restore_history'),
    /WTV_NormalizeHistoryData\(Main_values_History_data\)\) Main_setHistoryItem\(\)/,
    'persisted W.TV history migrations are saved at restore time'
  );
  assert.match(
    functionBody(wtvSource, 'WTV_OpenVodData'),
    /if \(WTV_IsActiveArchiveData\(data\)\) \{[\s\S]*Main_vodOffset = 0\.001;[\s\S]*PlayVod_ResumeTime = 0\.001;[\s\S]*\}/,
    'W.TV VOD history open resets stale live resume offsets only for active archives'
  );
  assert.match(
    functionBody(screensObjSource, 'ScreensObj_HistoryLive'),
    /isActiveWTVArchive[\s\S]*!isActiveWTVArchive && \(\(this\.streamerID\[cell\.data\[14\]\] && cell\.vodid\) \|\| cell\.forceVod\)/,
    'active W.TV archive history cells are rendered as live even when the streamer has a linked VOD id'
  );
  assert.match(
    functionBody(mainSource, 'Main_history_Exist'),
    /typeof id === 'undefined'/,
    'history lookup ignores missing ids instead of calling toString on undefined'
  );
  assert.doesNotMatch(
    functionBody(playEtcSource, 'Play_CheckPreviewLive'),
    /\.toString\(\)/,
    'end dialog preview restore uses guarded channel id comparison'
  );
  assert.match(
    functionBody(playEtcSource, 'Play_IsCurrentChannelId'),
    /if \(!channelId \|\| !currentId\) return false;/,
    'preview restore id comparison handles missing current or candidate ids'
  );
  assert.match(
    functionBody(playSource, 'Play_qualityChanged'),
    /Play_data\.qualities\.length > 1 \? 1 : 0/,
    'live quality selection handles single-item native quality lists'
  );
  assert.match(
    functionBody(playSource, 'Play_getQualities'),
    /if \(!result\[i\] \|\| !result\[i\]\.id\) continue;/,
    'native quality parser ignores malformed quality entries'
  );
}
