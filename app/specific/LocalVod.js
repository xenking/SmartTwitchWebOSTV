/*
 * Copyright (c) 2017–present Felipe de Leon <fglfgl27@gmail.com>
 *
 * This file is part of SmartTwitchTV <https://github.com/fgl27/SmartTwitchTV>
 *
 * SmartTwitchTV is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * SmartTwitchTV is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with SmartTwitchTV.  If not, see <https://github.com/fgl27/SmartTwitchTV/blob/master/LICENSE>.
 *
 */

var LocalVod_Platform = 'local_archive';
var LocalVod_MetaIndex = 19;
var LocalVod_RequestId = 0;
var LocalVod_RequestCallbacks = {};

function LocalVod_IsData(data) {
    var meta = LocalVod_GetMeta(data);
    return !!(meta && meta.source_platform === LocalVod_Platform);
}

function LocalVod_GetMeta(data) {
    if (!data) return null;
    if (data[LocalVod_MetaIndex] && data[LocalVod_MetaIndex].source_platform === LocalVod_Platform) return data[LocalVod_MetaIndex];
    if (data.source_platform === LocalVod_Platform) return data;
    return null;
}

function LocalVod_GetEndpoint() {
    if (typeof Settings_GetLocalArchiveEndpoint === 'function') return Settings_GetLocalArchiveEndpoint();
    return Main_getItemString('sttv_webos_local_archive_endpoint', '');
}

function LocalVod_HasConfiguredEndpoint() {
    try {
        if (localStorage.getItem('sttv_webos_local_archive_endpoint') !== null) return true;
        if (localStorage.getItem('localArchiveEndpoint') !== null) return true;
    } catch (e) {}
    return false;
}

function LocalVod_Request(path, method, body, success, error) {
    var endpoint = LocalVod_GetEndpoint();
    if (!endpoint) {
        if (error) error('Local archive endpoint is not configured.');
        return;
    }

    LocalVod_RequestId++;
    LocalVod_RequestCallbacks[LocalVod_RequestId] = {
        success: success,
        error: error
    };

    FullxmlHttpGet(
        endpoint + path,
        body ? [['Content-Type', 'application/json']] : null,
        LocalVod_RequestResult,
        LocalVod_RequestResult,
        null,
        LocalVod_RequestId,
        method || null,
        body ? JSON.stringify(body) : null
    );
}

function LocalVod_RequestResult(response, key, requestId) {
    var callbacks = LocalVod_RequestCallbacks[requestId];
    var status = response && typeof response.status !== 'undefined' ? response.status : 0;
    var responseText = response && response.responseText ? response.responseText : '';
    var data = null;

    delete LocalVod_RequestCallbacks[requestId];

    if (!callbacks) return;

    if (responseText) {
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            data = responseText;
        }
    }

    if (status >= 200 && status < 300) {
        if (callbacks.success) callbacks.success(data, status);
    } else if (callbacks.error) {
        callbacks.error(LocalVod_RequestErrorText(status, data));
    }
}

function LocalVod_RequestErrorText(status, data) {
    if (data && data.error) return data.error;
    if (data && data.message) return data.message;
    if (status) return 'HTTP ' + status;
    return 'Request failed';
}

function LocalVod_GetChannelVods(channel, success, error) {
    LocalVod_Request('/archive/channels/' + encodeURIComponent(channel) + '/vods', null, null, success, error);
}

function LocalVod_GetVodList(response) {
    if (response && response.vods) return response.vods;
    if (response && response.recordings) return response.recordings;
    if (response && response.data) return response.data;
    return response;
}

function LocalVod_NormalizeTwitchLogin(login) {
    return String(login || '').replace(/^[\s@]+|\s+$/g, '').toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function LocalVod_AbsoluteUrl(url) {
    var endpoint = LocalVod_GetEndpoint();
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.charAt(0) !== '/') url = '/' + url;
    return endpoint + url;
}

function LocalVod_PlaybackUrl(vod) {
    var url = vod
        ? vod.webos_playback_url ||
          vod.compat_playback_url ||
          vod.h264_playback_url ||
          vod.hls_playback_url ||
          vod.playback_url ||
          vod.vod_url ||
          vod.playlist_url ||
          vod.file_url ||
          vod.final_url ||
          vod.url ||
          ''
        : '';
    return LocalVod_AbsoluteUrl(url);
}

function LocalVod_PlaybackKind(vod, playbackURL) {
    var rawUrl = vod
        ? vod.webos_playback_url ||
          vod.compat_playback_url ||
          vod.h264_playback_url ||
          vod.hls_playback_url ||
          vod.playback_url ||
          vod.vod_url ||
          vod.playlist_url ||
          vod.file_url ||
          vod.final_url ||
          vod.url ||
          ''
        : '';
    var url = String(rawUrl || playbackURL || '').split('?')[0];

    if (vod && (vod.file_url || vod.final_url) && rawUrl && rawUrl === (vod.file_url || vod.final_url)) return 'archive_file';
    if (/\.m3u8$/i.test(url) || /\/playlist\.m3u8$/i.test(url)) return 'archive_hls';
    return 'archive_file';
}

function LocalVod_ChatPath(meta, offsetSeconds) {
    var vodId = meta && (meta.recording_group_id || meta.stream_id);
    if (!vodId) return '';
    offsetSeconds = parseFloat(offsetSeconds) || 0;
    if (offsetSeconds < 0) offsetSeconds = 0;
    return '/archive/vods/' + encodeURIComponent(vodId) + '/chat?offset_seconds=' + encodeURIComponent(offsetSeconds);
}

function LocalVod_CanLoadChat() {
    var meta = typeof PlayVod_LocalVodMeta === 'function' ? PlayVod_LocalVodMeta() : null;
    return !!(meta && LocalVod_ChatPath(meta, 0));
}

function LocalVod_LoadChat(offsetSeconds, success, error) {
    var meta = typeof PlayVod_LocalVodMeta === 'function' ? PlayVod_LocalVodMeta() : null;
    var path = LocalVod_ChatPath(meta, offsetSeconds);
    if (!path) {
        if (error) error('Local archive chat is not available.');
        return false;
    }
    LocalVod_Request(path, null, null, success, error);
    return true;
}

function LocalVod_ParseChatJSONValue(value, fallback) {
    if (!value) return fallback;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch (e) {
        return fallback;
    }
}

function LocalVod_ChatBadgesToTwitchBadges(badges) {
    var parsed = LocalVod_ParseChatJSONValue(badges, badges);
    var out = [];
    var key;
    var list;
    var i;
    var parts;

    if (!parsed) return out;
    if (typeof parsed === 'string') {
        list = parsed.split(',');
        for (i = 0; i < list.length; i++) {
            parts = list[i].split('/');
            if (parts[0] && parts[1]) {
                out.push({
                    setID: parts[0],
                    version: parts[1]
                });
            }
        }
        return out;
    }
    if (Array.isArray(parsed)) {
        for (i = 0; i < parsed.length; i++) {
            if (parsed[i] && parsed[i].setID && parsed[i].version) out.push(parsed[i]);
        }
        return out;
    }
    for (key in parsed) {
        if (parsed.hasOwnProperty(key)) {
            out.push({
                setID: key,
                version: String(parsed[key])
            });
        }
    }
    return out;
}

function LocalVod_ChatEmotesToFragments(body, emotes) {
    var parsed = LocalVod_ParseChatJSONValue(emotes, emotes);
    var ranges = [];
    var fragments = [];
    var cursor = 0;
    var key;
    var entries;
    var i;
    var split;
    var start;
    var end;

    body = body || '';
    if (typeof parsed === 'string') {
        parsed = {};
        entries = emotes.split('/');
        for (i = 0; i < entries.length; i++) {
            split = entries[i].split(':');
            if (split[0] && split[1]) parsed[split[0]] = split[1];
        }
    }
    if (parsed && typeof parsed === 'object') {
        for (key in parsed) {
            if (!parsed.hasOwnProperty(key)) continue;
            entries = String(parsed[key]).split(',');
            for (i = 0; i < entries.length; i++) {
                split = entries[i].split('-');
                start = parseInt(split[0]);
                end = parseInt(split[1]);
                if (!isNaN(start) && !isNaN(end) && start <= end) {
                    ranges.push({
                        start: start,
                        end: end,
                        id: key
                    });
                }
            }
        }
    }
    ranges.sort(function (a, b) {
        return a.start - b.start;
    });
    for (i = 0; i < ranges.length; i++) {
        if (ranges[i].start < cursor || ranges[i].start >= body.length) continue;
        if (ranges[i].start > cursor) fragments.push({text: body.slice(cursor, ranges[i].start)});
        fragments.push({
            text: body.slice(ranges[i].start, ranges[i].end + 1),
            emote: {emoteID: ranges[i].id}
        });
        cursor = ranges[i].end + 1;
    }
    if (cursor < body.length || !fragments.length) fragments.push({text: body.slice(cursor)});
    return fragments;
}

function LocalVod_ChatMessageToTwitchComment(message) {
    var body = message && message.body ? String(message.body) : '';
    var id = (message && (message.msg_id || message.id)) || 'local-chat-' + (message ? message.offset_ms || 0 : 0);

    if (!message || (message.deleted && !body)) return null;

    return {
        cursor: id,
        node: {
            id: id,
            contentOffsetSeconds: (parseInt(message.offset_ms) || 0) / 1000,
            sourcePlatform: LocalVod_Platform,
            commenter: {
                id: message.user_id || '',
                login: message.login || message.display_name || '',
                displayName: message.display_name || message.login || ''
            },
            message: {
                body: body,
                fragments: LocalVod_ChatEmotesToFragments(body, message.emotes),
                userBadges: LocalVod_ChatBadgesToTwitchBadges(message.badges),
                userColor: message.color || '',
                is_action: !!message.is_action
            }
        }
    };
}

function LocalVod_ChatResponseToTwitchComments(response) {
    var messages = response && response.messages ? response.messages : [];
    var edges = [];
    var i;
    var edge;

    for (i = 0; i < messages.length; i++) {
        edge = LocalVod_ChatMessageToTwitchComment(messages[i]);
        if (edge) edges.push(edge);
    }

    return JSON.stringify({
        data: {
            video: {
                comments: {
                    edges: edges
                }
            }
        }
    });
}

function LocalVod_StartedAt(vod) {
    var meta = LocalVod_GetMeta(vod);
    return vod
        ? vod.source_started_at ||
              vod.started_at ||
              vod.start_time ||
              vod.created_at ||
              vod.startedAt ||
              vod.createdAt ||
              (meta && meta.started_at) ||
              ''
        : '';
}

function LocalVod_DurationSeconds(vod) {
    var meta = LocalVod_GetMeta(vod);
    var duration = vod
        ? vod.duration_seconds ||
          vod.duration ||
          vod.length_seconds ||
          vod.available_duration_seconds ||
          vod.media_duration_seconds ||
          (meta && meta.duration_seconds) ||
          0
        : 0;
    if (typeof duration === 'string') {
        if (/^\d+$/.test(duration)) duration = parseInt(duration);
        else duration = Play_timeHMS(duration);
    }
    duration = parseInt(duration);
    if ((!duration || duration < 0) && vod && vod.ended_at) {
        duration = parseInt((new Date(vod.ended_at).getTime() - new Date(LocalVod_StartedAt(vod)).getTime()) / 1000);
    }
    return duration > 0 ? duration : 1;
}

function LocalVod_ParseTimeMs(value) {
    if (typeof value === 'string') value = value.replace(/(\.\d{3})\d+(Z|[+-]\d\d:?\d\d)?$/i, '$1$2');
    var ms = value ? new Date(value).getTime() : 0;
    return isNaN(ms) ? 0 : ms;
}

function LocalVod_TwitchVodStartMs(vod) {
    return LocalVod_ParseTimeMs(vod && vod.createdAt);
}

function LocalVod_TwitchVodDurationSeconds(vod) {
    return vod ? Play_timeHMS(vod.duration || '') || 0 : 0;
}

function LocalVod_ViewCount(vod) {
    var meta = LocalVod_IsData(vod) ? LocalVod_GetMeta(vod) : null;
    var views = meta ? meta.viewer_count : vod && (vod.viewCount || vod.view_count || vod.views || 0);
    views = typeof views === 'string' ? parseInt(views.replace(/[^\d]/g, '')) : parseInt(views);
    return isNaN(views) ? 0 : views;
}

function LocalVod_LocalStartMs(vod) {
    return LocalVod_ParseTimeMs(LocalVod_StartedAt(vod));
}

function LocalVod_LocalEndMs(vod) {
    var startMs = LocalVod_LocalStartMs(vod);
    var durationSeconds = LocalVod_DurationSeconds(vod);
    return startMs && durationSeconds > 1 ? startMs + durationSeconds * 1000 : 0;
}

function LocalVod_TwitchVodEndMs(vod) {
    var startMs = LocalVod_TwitchVodStartMs(vod);
    var durationSeconds = LocalVod_TwitchVodDurationSeconds(vod);
    return startMs && durationSeconds ? startMs + durationSeconds * 1000 : 0;
}

function LocalVod_TimeRangesOverlap(startA, endA, startB, endB) {
    return !!(startA && endA && startB && endB && startA < endB && startB < endA);
}

function LocalVod_OverlapsTwitchVod(localVod, twitchVod) {
    return LocalVod_TimeRangesOverlap(
        LocalVod_LocalStartMs(localVod),
        LocalVod_LocalEndMs(localVod),
        LocalVod_TwitchVodStartMs(twitchVod),
        LocalVod_TwitchVodEndMs(twitchVod)
    );
}

function LocalVod_CurrentIdentity() {
    return {
        display_name: Main_values.Main_selectedChannelDisplayname,
        login: Main_values.Main_selectedChannel,
        id: Main_values.Main_selectedChannel_id,
        logo: Main_values.Main_selectedChannelLogo || IMG_404_LOGO,
        partner: Main_values.Main_selectedChannelPartner || false
    };
}

function LocalVod_Id(vod, channel) {
    return vod && (vod.recording_group_id || vod.id || vod.stream_id) ? vod.recording_group_id || vod.id || vod.stream_id : 'local-vod:' + channel;
}

function LocalVod_TwitchThumbnail(vod) {
    if (!vod) return '';
    if (vod.thumbnailURLs && vod.thumbnailURLs[0]) return vod.thumbnailURLs[0];
    return vod.animatedPreviewURL || vod.thumbnailURL || vod.thumbnail_url || '';
}

function LocalVod_LivePreviewUrl(vod, channel) {
    var status = String((vod && vod.status) || '').toLowerCase();
    var isActive = vod && (vod.active || vod.growing || status === 'open' || status === 'recording');
    if (!isActive || !channel) return '';
    return 'https://static-cdn.jtvnw.net/previews-ttv/live_user_' + channel + '-640x360.jpg';
}

function LocalVod_BuildData(vod, channel, identity, twitchVod) {
    channel = LocalVod_NormalizeTwitchLogin((vod && (vod.source_channel || vod.channel)) || channel);

    var playbackURL = LocalVod_PlaybackUrl(vod);
    var playbackKind = LocalVod_PlaybackKind(vod, playbackURL);
    var startedAt = LocalVod_StartedAt(vod);
    var durationSeconds = LocalVod_DurationSeconds(vod);
    var vodId = LocalVod_Id(vod, channel);
    var twitchVodId = twitchVod && twitchVod.id ? twitchVod.id : '';
    var twitchStartedAt = twitchVod && twitchVod.createdAt ? twitchVod.createdAt : '';
    var twitchDurationSeconds = LocalVod_TwitchVodDurationSeconds(twitchVod);
    var localStartMs = LocalVod_LocalStartMs(vod);
    var twitchStartMs = LocalVod_TwitchVodStartMs(twitchVod);
    var title = (vod && (vod.title || vod.name)) || 'Local recording';
    var views = (vod && (vod.view_count || vod.views || vod.viewer_count || 0)) || 0;
    var meta = {
        source_platform: LocalVod_Platform,
        source_channel: channel,
        source_kind: 'vod',
        playback_url: playbackURL,
        playback_kind: playbackKind,
        vod_url: playbackURL,
        recording_group_id: vodId,
        stream_id: vodId,
        title: title,
        started_at: startedAt,
        duration_seconds: durationSeconds,
        viewer_count: views,
        twitch_vod_id: twitchVodId,
        twitch_started_at: twitchStartedAt,
        twitch_duration_seconds: twitchDurationSeconds,
        twitch_timeline_delta_seconds: localStartMs && twitchStartMs ? (localStartMs - twitchStartMs) / 1000 : 0
    };
    var data;

    identity = identity || LocalVod_CurrentIdentity();

    data = [
        LocalVod_AbsoluteUrl(vod && (vod.thumbnail_url || vod.preview_url)) ||
            LocalVod_TwitchThumbnail(twitchVod) ||
            LocalVod_LivePreviewUrl(vod, channel) ||
            IMG_404_VOD,
        identity.display_name,
        startedAt ? Main_videoCreatedAt(startedAt) : '',
        (vod && vod.game_name) || (twitchVod && twitchVod.game_name) || '',
        Main_formatNumber(views),
        'LOCAL',
        identity.login,
        vodId,
        null,
        LocalVod_Platform,
        twemoji.parse(title),
        durationSeconds,
        startedAt,
        views,
        identity.id,
        identity.logo || IMG_404_LOGO,
        (vod && vod.game_id) || (twitchVod && twitchVod.game_id) || null
    ];

    data[LocalVod_MetaIndex] = meta;
    data.source_platform = LocalVod_Platform;
    data.source_channel = channel;
    data.playback_url = playbackURL;
    data.playback_kind = playbackKind;
    data.source_kind = meta.source_kind;
    data.vod_url = playbackURL;
    data.recording_group_id = vodId;

    return data;
}

function LocalVod_MergeWithTwitchVods(twitchVods, localVods, sourceChannel, identity, sortMode) {
    var merged = [];
    var playableLocalVods = [];
    var seen = {};
    var i;
    var j;
    var vod;
    var localData;
    var id;
    var overlapsLocal;
    var matchedTwitchVod;

    twitchVods = twitchVods || [];
    localVods = localVods || [];

    for (i = 0; i < localVods.length; i++) {
        vod = localVods[i];
        if (!LocalVod_PlaybackUrl(vod)) continue;
        playableLocalVods.push(vod);
        matchedTwitchVod = null;
        for (j = 0; j < twitchVods.length; j++) {
            if (LocalVod_OverlapsTwitchVod(vod, twitchVods[j])) {
                matchedTwitchVod = twitchVods[j];
                break;
            }
        }
        localData = LocalVod_BuildData(vod, sourceChannel, identity, matchedTwitchVod);
        id = localData[7];
        if (!id || seen[id]) continue;
        seen[id] = true;
        merged.push(localData);
    }

    for (i = 0; i < twitchVods.length; i++) {
        vod = twitchVods[i];
        if (!vod || !vod.id) continue;
        overlapsLocal = false;
        for (j = 0; j < playableLocalVods.length; j++) {
            if (LocalVod_OverlapsTwitchVod(playableLocalVods[j], vod)) {
                overlapsLocal = true;
                break;
            }
        }
        if (overlapsLocal || seen[vod.id]) continue;
        seen[vod.id] = true;
        merged.push(vod);
    }

    if (sortMode === 'views') {
        merged.sort(function (a, b) {
            return LocalVod_ViewCount(b) - LocalVod_ViewCount(a);
        });
        return merged;
    }

    merged.sort(function (a, b) {
        var aStart = LocalVod_IsData(a) ? LocalVod_ParseTimeMs(LocalVod_GetMeta(a).started_at) : LocalVod_TwitchVodStartMs(a);
        var bStart = LocalVod_IsData(b) ? LocalVod_ParseTimeMs(LocalVod_GetMeta(b).started_at) : LocalVod_TwitchVodStartMs(b);
        return bStart - aStart;
    });

    return merged;
}

function LocalVod_FilterTwitchVodsForExistingLocalData(twitchVods, existingData) {
    var out = [];
    var localVods = [];
    var i;
    var j;
    var vod;
    var overlapsLocal;

    twitchVods = twitchVods || [];
    existingData = existingData || [];

    for (i = 0; i < existingData.length; i++) {
        if (LocalVod_IsData(existingData[i]) && LocalVod_PlaybackUrl(existingData[i])) localVods.push(existingData[i]);
    }

    for (i = 0; i < twitchVods.length; i++) {
        vod = twitchVods[i];
        overlapsLocal = false;
        for (j = 0; j < localVods.length; j++) {
            if (LocalVod_OverlapsTwitchVod(localVods[j], vod)) {
                overlapsLocal = true;
                break;
            }
        }
        if (!overlapsLocal) out.push(vod);
    }

    return out;
}

function LocalVod_MergeChannelVodResponse(screenObj, responseObj, done) {
    var localChannel = LocalVod_NormalizeTwitchLogin(Main_values.Main_selectedChannel);

    if (!screenObj || screenObj.highlight || !localChannel || !LocalVod_GetEndpoint() || !LocalVod_HasConfiguredEndpoint()) {
        done(responseObj);
        return true;
    }

    if (screenObj.data) {
        responseObj.edges = LocalVod_FilterTwitchVodsForExistingLocalData(responseObj.edges, screenObj.data);
        done(responseObj);
        return true;
    }

    LocalVod_GetChannelVods(
        localChannel,
        function (localResponse) {
            var localVods = LocalVod_GetVodList(localResponse) || [];
            responseObj.edges = LocalVod_MergeWithTwitchVods(
                responseObj.edges || [],
                localVods,
                localChannel,
                LocalVod_CurrentIdentity(),
                screenObj.periodPos === 2 ? 'views' : 'recent'
            );
            done(responseObj);
        },
        function () {
            done(responseObj);
        }
    );
    return true;
}

function LocalVod_ApplyVodInfo() {
    var meta = LocalVod_GetMeta(Main_values_Play_data) || LocalVod_GetMeta(Play_data.data);
    if (!meta) return false;

    Play_DurationSeconds = meta.duration_seconds || Play_DurationSeconds || 1;
    ChannelVod_title = Main_values_Play_data[10] || meta.title || ChannelVod_title;
    ChannelVod_createdAt = Main_values_Play_data[2] || Main_videoCreatedAt(meta.started_at);
    ChannelVod_views = Main_values_Play_data[4] || Main_formatNumber(meta.viewer_count || 0);
    ChannelVod_language = 'LOCAL';

    Main_values.Main_selectedChannelLogo = Main_values_Play_data[15] || Main_values.Main_selectedChannelLogo || IMG_404_LOGO;

    Play_LoadLogo(Main_getElementById('stream_info_icon'), Main_values.Main_selectedChannelLogo);
    Main_innerHTML(
        'stream_info_name',
        Play_partnerIcon(Main_values.Main_selectedChannelDisplayname, Main_values.Main_selectedChannelPartner, 1, '[LOCAL]')
    );
    Main_innerHTML('stream_info_title', ChannelVod_title);
    Main_textContent('stream_info_game', ChannelVod_game);
    Main_innerHTMLWithEle(
        Play_infoLiveTime,
        STR_STREAM_ON + ChannelVod_createdAt + ',' + STR_SPACE_HTML + ChannelVod_views + Main_GetViewsStrings(meta.viewer_count || 0)
    );
    Main_textContent('stream_live_viewers', '');
    Main_textContentWithEle(Play_infoWatchingTime, '');
    Main_textContentWithEle(Play_BottonIcons_Progress_Duration, Play_timeS(Play_DurationSeconds));
    PlayVod_currentTime = Main_vodOffset * 1000;
    PlayVod_ProgressBarrUpdate(Main_vodOffset, Play_DurationSeconds, true);
    LocalVod_SaveVodHistory(Main_values_Play_data);
    return true;
}

function LocalVod_SaveVodHistory(data) {
    if (!data || !LocalVod_IsData(data)) return;
    Main_Set_history('vod', data);
}

function LocalVod_PlayVodLoadData() {
    var meta = LocalVod_GetMeta(Main_values_Play_data) || LocalVod_GetMeta(Play_data.data);
    if (!meta || !meta.playback_url) return false;

    LocalVod_SaveVodHistory(Main_values_Play_data);

    if (meta.playback_kind === 'archive_file') {
        PlayVod_autoUrl = meta.playback_url;
        PlayVod_loadDataSuccessEnd('');
        return true;
    }

    if (Main_IsOn_OSInterface) {
        PlayVod_loadDataId = new Date().getTime();
        PlayHLS_GetExternalPlayListAsync(meta.playback_url, PlayVod_loadDataId, null, PlayVod_loadDataResult);
    } else {
        PlayVod_loadDataSuccessFake();
    }
    return true;
}

function LocalVod_PatchPlaylist(playlist, baseUrl) {
    if (!playlist || typeof playlist !== 'string') return playlist || '';

    var lines = playlist.replace(/\r/g, '').split('\n');
    var out = [];
    var hasPlaylistType = false;
    var hasEndList = false;
    var i = 0;
    var line;
    var trimmed;

    for (i; i < lines.length; i++) {
        line = lines[i];
        trimmed = line.trim();

        if (trimmed.toUpperCase().indexOf('#EXT-X-PLAYLIST-TYPE:') === 0) {
            out.push('#EXT-X-PLAYLIST-TYPE:VOD');
            hasPlaylistType = true;
        } else if (trimmed.toUpperCase() === '#EXT-X-ENDLIST') {
            hasEndList = true;
            out.push('#EXT-X-ENDLIST');
        } else if (trimmed && trimmed.charAt(0) !== '#') {
            out.push(LocalVod_ToAbsolutePlaylistUrl(trimmed, baseUrl));
        } else if (trimmed && trimmed.charAt(0) === '#' && trimmed.toUpperCase().indexOf('URI=') !== -1) {
            out.push(LocalVod_PatchPlaylistTagUris(line, baseUrl));
        } else {
            out.push(line);
        }
    }

    if (!hasPlaylistType) {
        for (i = 0; i < out.length; i++) {
            if (out[i].toUpperCase().indexOf('#EXT-X-VERSION:') === 0) {
                out.splice(i + 1, 0, '#EXT-X-PLAYLIST-TYPE:VOD');
                hasPlaylistType = true;
                break;
            }
        }
        if (!hasPlaylistType) out.splice(1, 0, '#EXT-X-PLAYLIST-TYPE:VOD');
    }

    if (!hasEndList) out.push('#EXT-X-ENDLIST');

    return out.join('\n');
}

function LocalVod_ToAbsolutePlaylistUrl(url, baseUrl) {
    if (!url || /^https?:\/\//i.test(url) || /^data:/i.test(url) || /^blob:/i.test(url)) return url;

    if (url.charAt(0) === '/') {
        var endpoint = LocalVod_GetEndpoint();
        return endpoint ? endpoint + url : url;
    }

    if (baseUrl && /^https?:\/\//i.test(baseUrl)) {
        return baseUrl.replace(/[^/]*$/, '') + url;
    }

    return url;
}

function LocalVod_PatchPlaylistTagUris(line, baseUrl) {
    return line.replace(/(URI=")([^"]+)(")/gi, function (_, prefix, uri, suffix) {
        return prefix + LocalVod_ToAbsolutePlaylistUrl(uri, baseUrl) + suffix;
    });
}

function LocalVod_PlayVodLoadDataSuccess(responseObj) {
    var meta = LocalVod_GetMeta(Main_values_Play_data) || {};
    var playbackUrl = responseObj.url || meta.playback_url;
    var patchedPlaylist = LocalVod_PatchPlaylist(responseObj.responseText || '', playbackUrl);
    PlayVod_autoUrl = playbackUrl;
    PlayVod_loadDataSuccessEnd(patchedPlaylist);
}
