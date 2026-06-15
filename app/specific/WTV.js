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

var WTV_Platform = 'wtv';
var WTV_MetaIndex = 19;
var WTV_LastChannelItem = 'sttv_wtv_last_channel';
var WTV_ChannelMapIndexItem = 'sttv_wtv_channel_map_index';
var WTV_ChannelMapPrefix = 'sttv_wtv_channel_map_';
var WTV_UserFeedPollId;
var WTV_RequestId = 0;
var WTV_RequestCallbacks = {};

function WTV_IsData(data) {
    var meta = WTV_GetMeta(data);
    return !!(meta && meta.source_platform === WTV_Platform);
}

function WTV_GetMeta(data) {
    if (!data) return null;
    if (data[WTV_MetaIndex] && data[WTV_MetaIndex].source_platform === WTV_Platform) return data[WTV_MetaIndex];
    if (data.source_platform === WTV_Platform) return data;
    return null;
}

function WTV_GetPlaybackUrl(data) {
    var meta = WTV_GetMeta(data);
    return meta ? meta.playback_url : '';
}

function WTV_GetPlaybackBaseUrl(data, fallbackUrl) {
    var meta = WTV_GetMeta(data);
    return fallbackUrl || (meta ? meta.playback_url : '') || '';
}

function WTV_IsVodData(data) {
    var meta = WTV_GetMeta(data);
    return !!(meta && (meta.source_kind === 'vod' || meta.source_kind === 'recording' || meta.duration_seconds));
}

function WTV_GetLiveBadgeText(data) {
    var meta = WTV_GetMeta(data);
    if (!meta) return STR_LIVE;
    return meta.source_kind === 'vod' || meta.source_kind === 'recording' ? 'W.TV VOD' : 'W.TV LIVE';
}

function WTV_HasRecordingAction() {
    var meta = WTV_GetMeta(Play_data.data);
    return !!(meta && (meta.vod_url || meta.recording_group_id || meta.source_channel));
}

function WTV_GetDataId(data) {
    var meta = WTV_GetMeta(data);
    if (meta && (meta.recording_group_id || meta.stream_id)) return meta.recording_group_id || meta.stream_id;
    return data && data[7] ? data[7] : '';
}

function WTV_GetEndpoint() {
    if (typeof Settings_GetLocalArchiveEndpoint === 'function') return Settings_GetLocalArchiveEndpoint();
    return Main_getItemString('sttv_webos_local_archive_endpoint', '');
}

function WTV_NormalizeChannel(channel) {
    channel = String(channel || '').replace(/^[\s@]+|\s+$/g, '');
    channel = channel.replace(/^https?:\/\/(www\.)?w\.tv\//i, '');
    channel = channel.replace(/^w\.tv\//i, '');
    channel = channel.replace(/^wtv\//i, '');
    channel = channel.split(/[/?#]/)[0];
    return channel.replace(/[^a-zA-Z0-9_.-]/g, '');
}

function WTV_Request(path, method, body, success, error) {
    var endpoint = WTV_GetEndpoint();
    if (!endpoint) {
        if (error) error('Local archive endpoint is not configured.');
        return;
    }

    WTV_RequestId++;
    WTV_RequestCallbacks[WTV_RequestId] = {
        success: success,
        error: error
    };

    FullxmlHttpGet(
        endpoint + path,
        body ? [['Content-Type', 'application/json']] : null,
        WTV_RequestResult,
        WTV_RequestResult,
        null,
        WTV_RequestId,
        method || null,
        body ? JSON.stringify(body) : null
    );
}

function WTV_RequestResult(response, key, requestId) {
    var callbacks = WTV_RequestCallbacks[requestId];
    var status = response && typeof response.status !== 'undefined' ? response.status : 0;
    var responseText = response && response.responseText ? response.responseText : '';
    var data = null;

    delete WTV_RequestCallbacks[requestId];

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
        callbacks.error(WTV_RequestErrorText(status, data));
    }
}

function WTV_RequestErrorText(status, data) {
    if (data && data.error) return data.error;
    if (data && data.message) return data.message;
    if (status) return 'HTTP ' + status;
    return 'Request failed';
}

function WTV_AddSource(channel, success, error) {
    WTV_Request('/api/sources', 'POST', {platform: WTV_Platform, channel: channel}, success, error);
}

function WTV_GetLive(channel, success, error) {
    WTV_Request(
        '/api/sources/wtv/' + encodeURIComponent(channel) + '/live',
        null,
        null,
        success,
        function () {
            WTV_GetLiveFromActiveArchive(channel, success, error);
        }
    );
}

function WTV_GetChannelVods(channel, success, error) {
    WTV_Request('/archive/sources/wtv/' + encodeURIComponent(channel) + '/vods', null, null, success, error);
}

function WTV_GetLiveFromActiveArchive(channel, success, error) {
    WTV_GetChannelVods(
        channel,
        function (response) {
            var vod = WTV_FindActiveVod(response);
            if (!vod) {
                if (success) success({platform: WTV_Platform, channel: channel, online: false});
                return;
            }
            if (success) success(WTV_BuildLiveStatusFromArchiveVod(vod, channel));
        },
        error
    );
}

function WTV_NormalizeTwitchLogin(login) {
    return String(login || '').replace(/^[\s@]+|\s+$/g, '').toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function WTV_GetMappingKey(twitchLogin) {
    return WTV_ChannelMapPrefix + WTV_NormalizeTwitchLogin(twitchLogin);
}

function WTV_ReadMappingIndex() {
    var raw = Main_getItemString(WTV_ChannelMapIndexItem, '[]');
    try {
        var list = JSON.parse(raw);
        return list && list.length ? list : [];
    } catch (e) {
        return [];
    }
}

function WTV_WriteMappingIndex(list) {
    Main_setItem(WTV_ChannelMapIndexItem, JSON.stringify(list || []));
}

function WTV_GetChannelMapping(twitchLogin) {
    twitchLogin = WTV_NormalizeTwitchLogin(twitchLogin);
    if (!twitchLogin) return null;

    var raw = Main_getItemString(WTV_GetMappingKey(twitchLogin), '');
    if (!raw) return null;

    try {
        var mapping = JSON.parse(raw);
        if (mapping && mapping.wtv_channel) return mapping;
    } catch (e) {}

    return null;
}

function WTV_GetCurrentChannelMapping() {
    return WTV_GetChannelMapping(Main_values.Main_selectedChannel);
}

function WTV_GetPlaybackMapping() {
    var meta = WTV_GetMeta(Play_data && Play_data.data);
    var login = meta && meta.twitch_login ? meta.twitch_login : '';

    if (!login && Play_data && Play_data.data && Play_data.data[6]) login = Play_data.data[6];
    if (!login && Main_values && Main_values.Main_selectedChannel) login = Main_values.Main_selectedChannel;

    return login ? WTV_GetChannelMapping(login) : null;
}

function WTV_SaveChannelMapping(twitchLogin, wtvChannel, meta) {
    twitchLogin = WTV_NormalizeTwitchLogin(twitchLogin);
    wtvChannel = WTV_NormalizeChannel(wtvChannel);
    if (!twitchLogin) return null;

    var list = WTV_ReadMappingIndex(),
        found = false,
        i = 0,
        mapping = null;

    if (!wtvChannel) {
        for (i = list.length - 1; i >= 0; i--) {
            if (list[i].twitch_login === twitchLogin) {
                WTV_RemoveMappedLiveFromUserFeed(list[i]);
                list.splice(i, 1);
            }
        }
        localStorage.removeItem(WTV_GetMappingKey(twitchLogin));
        WTV_WriteMappingIndex(list);
        return null;
    }

    mapping = {
        twitch_login: twitchLogin,
        twitch_display_name: (meta && meta.twitch_display_name) || twitchLogin,
        twitch_id: (meta && meta.twitch_id) || twitchLogin,
        twitch_logo: (meta && meta.twitch_logo) || IMG_404_LOGO,
        twitch_partner: !!(meta && meta.twitch_partner),
        wtv_channel: wtvChannel,
        updated_at: new Date().toISOString()
    };

    Main_setItem(WTV_GetMappingKey(twitchLogin), JSON.stringify(mapping));

    for (i = 0; i < list.length; i++) {
        if (list[i].twitch_login === twitchLogin) {
            list[i] = mapping;
            found = true;
            break;
        }
    }
    if (!found) list.push(mapping);

    WTV_WriteMappingIndex(list);
    Main_setItem(WTV_LastChannelItem, wtvChannel);
    return mapping;
}

function WTV_ChannelContentPrompt(done) {
    var currentMapping = WTV_GetCurrentChannelMapping();
    var currentValue = currentMapping ? currentMapping.wtv_channel : Main_getItemString(WTV_LastChannelItem, Main_values.Main_selectedChannel);

    Settings_TextInputShow(
        'w.tv channel for ' + Main_values.Main_selectedChannelDisplayname,
        currentValue,
        Main_values.Main_selectedChannel,
        function (value) {
            WTV_ChannelContentPromptSave(value, done);
        },
        function () {
            if (done) done(false);
        }
    );
}

function WTV_ChannelContentPromptSave(value, done) {
    var channel = WTV_NormalizeChannel(value);
    var mapping = WTV_SaveChannelMapping(Main_values.Main_selectedChannel, channel, {
        twitch_display_name: Main_values.Main_selectedChannelDisplayname,
        twitch_id: Main_values.Main_selectedChannel_id,
        twitch_logo: Main_values.Main_selectedChannelLogo,
        twitch_partner: Main_values.Main_selectedChannelPartner
    });

    if (!channel) {
        OSInterface_showToast('w.tv mapping cleared');
        if (done) done(true);
        return;
    }

    WTV_AddSource(channel, noop_fun, noop_fun);
    OSInterface_showToast('w.tv mapped: ' + mapping.twitch_display_name + ' -> ' + channel);
    if (done) done(true);
}

function WTV_BuildTwitchMappedLiveData(status, mapping, sourceKind) {
    var data = WTV_BuildLiveData(status, sourceKind || 'live');
    var meta = WTV_GetMeta(data);

    data[1] = mapping.twitch_display_name || mapping.twitch_login;
    data[5] = '[W.TV]';
    data[6] = mapping.twitch_login;
    data[9] = mapping.twitch_logo || data[9] || IMG_404_LOGO;
    data[10] = mapping.twitch_partner;
    data[14] = mapping.twitch_id || mapping.twitch_login;
    data[15] = WTV_Platform;

    if (meta) {
        meta.twitch_login = mapping.twitch_login;
        meta.twitch_display_name = mapping.twitch_display_name;
        meta.twitch_id = mapping.twitch_id;
        meta.twitch_logo = mapping.twitch_logo;
    }

    return WTV_NormalizeDataUrls(data);
}

function WTV_MappedFeedSlotIsWTV(pos, itemPos, mapping) {
    var current = UserLiveFeed_DataObj[pos] && UserLiveFeed_DataObj[pos][itemPos],
        meta = WTV_GetMeta(current);
    return !!(meta && meta.source_platform === WTV_Platform && (!mapping || !mapping.twitch_id || meta.twitch_id === mapping.twitch_id));
}

function WTV_RemoveMappedLiveFromUserFeed(mapping) {
    if (!mapping || !mapping.twitch_id || !UserLiveFeed_idObject || !UserLiveFeed_DataObj) return;

    var pos = UserLiveFeedobj_UserLivePos,
        itemPos = UserLiveFeed_idObject[pos] && UserLiveFeed_idObject[pos].hasOwnProperty(mapping.twitch_id) ? UserLiveFeed_idObject[pos][mapping.twitch_id] : null;

    if (itemPos === null || !WTV_MappedFeedSlotIsWTV(pos, itemPos, mapping)) return;

    if (typeof UserLiveFeedobj_StartDefault === 'function' && UserLiveFeed_obj[pos] && UserLiveFeed_obj[pos].load) {
        UserLiveFeedobj_StartDefault(pos);
        UserLiveFeed_obj[pos].load();
        return;
    }

    delete UserLiveFeed_idObject[pos][mapping.twitch_id];
    delete UserLiveFeed_DataObj[pos][itemPos];
    if (UserLiveFeed_cell[pos] && UserLiveFeed_cell[pos][itemPos] && UserLiveFeed_cell[pos][itemPos].parentNode) {
        UserLiveFeed_cell[pos][itemPos].parentNode.removeChild(UserLiveFeed_cell[pos][itemPos]);
    }
    if (UserLiveFeed_cell[pos]) delete UserLiveFeed_cell[pos][itemPos];
    Sidepannel_Positions = JSON.parse(JSON.stringify(UserLiveFeed_idObject[pos] || {}));
}

function WTV_AddMappedLiveToUserFeed(status, mapping) {
    if (!status || !status.online || !status.playback_url || !mapping || !mapping.twitch_id) {
        WTV_RemoveMappedLiveFromUserFeed(mapping);
        return;
    }
    if (!UserLiveFeed_obj || !UserLiveFeed_obj[UserLiveFeedobj_UserLivePos]) return;

    var pos = UserLiveFeedobj_UserLivePos,
        id = mapping.twitch_id,
        data = WTV_BuildTwitchMappedLiveData(status, mapping, 'live'),
        existingPos = UserLiveFeed_idObject[pos] && UserLiveFeed_idObject[pos].hasOwnProperty(id) ? UserLiveFeed_idObject[pos][id] : null,
        itemPos = existingPos !== null ? existingPos : UserLiveFeed_itemsCount[pos],
        oldCell,
        newCell,
        sideHtml;

    if (!UserLiveFeed_idObject[pos]) UserLiveFeed_idObject[pos] = {};
    if (!UserLiveFeed_DataObj[pos]) UserLiveFeed_DataObj[pos] = {};
    if (!UserLiveFeed_cell[pos]) UserLiveFeed_cell[pos] = [];

    UserLiveFeed_idObject[pos][id] = itemPos;
    UserLiveFeed_itemsCount[pos] = Math.max(UserLiveFeed_itemsCount[pos], itemPos + 1);
    UserLiveFeed_PreloadImgs.push(data[0]);

    oldCell = UserLiveFeed_cell[pos][itemPos];
    newCell = UserLiveFeedobj_CreatFeed(pos, itemPos, pos + '_' + itemPos, data);
    UserLiveFeed_cell[pos][itemPos] = newCell;

    if (oldCell && oldCell.parentNode) {
        oldCell.parentNode.replaceChild(newCell, oldCell);
        newCell.style.position = oldCell.style.position;
        newCell.style.transition = oldCell.style.transition || 'none';
        newCell.style.transform = oldCell.style.transform;
    } else if (UserLiveFeed_status[pos] && UserLiveFeed_obj[pos] && UserLiveFeed_obj[pos].div && itemPos < UserLiveFeed_cellVisible[pos]) {
        UserLiveFeed_obj[pos].div.appendChild(newCell);
        newCell.style.position = '';
        newCell.style.transition = 'none';
    }

    sideHtml = UserLiveFeedobj_CreateSideFeed(itemPos, data);
    if (existingPos === null) {
        Sidepannel_Html += sideHtml;
        if (Sidepannel_ScroolDoc) Sidepannel_ScroolDoc.insertAdjacentHTML('beforeend', sideHtml);
    }
    Sidepannel_Positions = JSON.parse(JSON.stringify(UserLiveFeed_idObject[pos]));
}

function WTV_CheckMappedUserFeedItem(mapping) {
    WTV_GetLive(
        mapping.wtv_channel,
        function (status) {
            WTV_AddMappedLiveToUserFeed(status, mapping);
        },
        noop_fun
    );
}

function WTV_CheckMappedChannelsForUserFeed() {
    var list = WTV_ReadMappingIndex(),
        i = 0,
        mapping;

    for (i; i < list.length; i++) {
        mapping = list[i];
        if (!mapping || !mapping.wtv_channel || !mapping.twitch_id) continue;

        WTV_CheckMappedUserFeedItem(mapping);
    }
}

function WTV_StartMappedFeedPolling() {
    Main_clearTimeout(WTV_UserFeedPollId);
    WTV_UserFeedPollId = Main_setTimeout(
        function () {
            WTV_CheckMappedChannelsForUserFeed();
            WTV_StartMappedFeedPolling();
        },
        60000,
        WTV_UserFeedPollId
    );
}

function WTV_GetVodList(response) {
    if (response && response.vods) return response.vods;
    if (response && response.recordings) return response.recordings;
    if (response && response.data) return response.data;
    return response;
}

function WTV_FindVod(response) {
    var list = WTV_GetVodList(response);
    var i;

    if (!list || !list.length) return null;

    for (i = 0; i < list.length; i++) {
        if (WTV_ArchiveVodPlaybackUrl(list[i])) return list[i];
    }

    return null;
}

function WTV_FindActiveVod(response) {
    var list = WTV_GetVodList(response);
    var i;

    if (!list || !list.length) return null;

    for (i = 0; i < list.length; i++) {
        if ((list[i].active || list[i].growing || list[i].status === 'open' || list[i].status === 'recording') && WTV_ArchiveVodPlaybackUrl(list[i])) {
            return list[i];
        }
    }

    return null;
}

function WTV_AbsoluteArchiveUrl(url) {
    var endpoint = WTV_GetEndpoint();
    if (!url) return '';
    url = String(url).replace(/^file:\/\/\/archive\//i, '/archive/');
    if (/^(data|blob):/i.test(url)) return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.charAt(0) !== '/') url = '/' + url;
    return endpoint ? endpoint.replace(/\/+$/, '') + url : url;
}

function WTV_NormalizeArchiveUrl(url) {
    if (!url) return '';
    url = String(url).replace(/^file:\/\/\/archive\//i, '/archive/');
    if (/^(https?|data|blob):/i.test(url)) return url;
    if (/^\/?archive\//i.test(url)) return WTV_AbsoluteArchiveUrl(url);
    return url;
}

function WTV_NormalizeDataUrls(data) {
    var meta = WTV_GetMeta(data);
    if (!meta) return data;

    if (data[0]) data[0] = WTV_NormalizeArchiveUrl(data[0]);
    if (data[9]) data[9] = WTV_NormalizeArchiveUrl(data[9]);

    if (meta.thumbnail_url) meta.thumbnail_url = WTV_NormalizeArchiveUrl(meta.thumbnail_url);
    if (meta.preview_url) meta.preview_url = WTV_NormalizeArchiveUrl(meta.preview_url);
    if (meta.playback_url) meta.playback_url = WTV_AbsoluteArchiveUrl(meta.playback_url);
    if (meta.vod_url) meta.vod_url = WTV_AbsoluteArchiveUrl(meta.vod_url);

    data.playback_url = meta.playback_url || data.playback_url || '';
    data.vod_url = meta.vod_url || data.vod_url || '';

    return data;
}

function WTV_IsActiveArchiveData(data) {
    var meta = WTV_GetMeta(data);
    var status = meta && meta.status ? String(meta.status).toLowerCase() : '';

    return !!(
        meta &&
        (meta.source_kind === 'live' ||
            meta.active ||
            meta.growing ||
            status === 'open' ||
            status === 'recording')
    );
}

function WTV_NormalizeHistoryEntry(type, entry) {
    var previousForceVod;
    var previousVodImg;

    if (!entry || !entry.data || !WTV_IsData(entry.data)) return entry;

    previousForceVod = entry.forceVod;
    previousVodImg = entry.vodimg;

    WTV_NormalizeDataUrls(entry.data);
    if (entry.vodimg) entry.vodimg = WTV_NormalizeArchiveUrl(entry.vodimg);

    if (type === 'live' && WTV_IsActiveArchiveData(entry.data)) {
        entry.forceVod = false;
    }

    entry.wtv_changed = previousForceVod !== entry.forceVod || previousVodImg !== entry.vodimg;
    return entry;
}

function WTV_NormalizeHistoryData(historyData) {
    var userId;
    var types = ['live', 'vod'];
    var typeIndex;
    var i;
    var entries;
    var type;
    var changed = false;
    var normalized;

    for (userId in historyData) {
        if (!historyData.hasOwnProperty(userId)) continue;

        for (typeIndex = 0; typeIndex < types.length; typeIndex++) {
            type = types[typeIndex];
            entries = historyData[userId][type];
            if (!entries || !entries.length) continue;

            for (i = 0; i < entries.length; i++) {
                normalized = WTV_NormalizeHistoryEntry(type, entries[i]);
                if (normalized && normalized.wtv_changed) {
                    changed = true;
                    delete normalized.wtv_changed;
                }
            }
        }
    }

    return changed;
}

function WTV_IsArchiveVodUrl(url) {
    return !!(url && String(url).indexOf('/archive/vods/') !== -1);
}

function WTV_IsFinalizedVod(vod) {
    var status = vod && vod.status ? String(vod.status).toLowerCase() : '';

    if (!vod) return false;
    if (status === 'finalized' || status === 'finished' || status === 'complete' || status === 'completed') return true;
    return !!((vod.file_url || vod.final_url) && !vod.active && !vod.growing && status !== 'open' && status !== 'recording');
}

function WTV_ArchiveVodPlaybackUrl(vod) {
    var url = WTV_VodPlaybackUrl(vod);
    if (!url) return '';
    if (WTV_IsArchiveVodUrl(url)) return url;
    return WTV_IsFinalizedVod(vod) ? url : '';
}

function WTV_BuildLiveStatusFromArchiveVod(vod, channel) {
    var playbackURL = WTV_AbsoluteArchiveUrl(WTV_ArchiveVodPlaybackUrl(vod));
    var playbackKind = WTV_PlaybackKind(vod, playbackURL);
    var thumbnailURL = WTV_AbsoluteArchiveUrl(vod.thumbnail_url || vod.preview_url || '') || IMG_404_BANNER;
    return {
        platform: WTV_Platform,
        channel: vod.source_channel || vod.channel || channel,
        online: true,
        status: vod.status || '',
        active: !!vod.active,
        growing: !!vod.growing,
        title: vod.title || vod.channel || channel,
        viewer_count: vod.viewer_count || 0,
        started_at: vod.source_started_at || vod.started_at || new Date().toISOString(),
        thumbnail_url: thumbnailURL,
        preview_url: thumbnailURL,
        playback_url: playbackURL,
        playback_kind: playbackKind,
        vod_url: playbackURL,
        recording_group_id: vod.recording_group_id || vod.id || '',
        stream_id: vod.recording_group_id || vod.id || WTV_Platform + ':' + channel
    };
}


function WTV_FindVodByRecordingGroup(response, recordingGroupId) {
    var list = WTV_GetVodList(response);
    var i;

    if (!list || !list.length || !recordingGroupId) return null;

    for (i = 0; i < list.length; i++) {
        if ((list[i].recording_group_id || list[i].id || '') === recordingGroupId && WTV_ArchiveVodPlaybackUrl(list[i])) return list[i];
    }

    return null;
}

function WTV_VodPlaybackUrl(vod) {
    return vod
        ? vod.webos_playback_url ||
              vod.compat_playback_url ||
              vod.h264_playback_url ||
              vod.hls_playback_url ||
              vod.playback_url ||
              vod.vod_url ||
              vod.playlist_url ||
              vod.hls_url ||
              vod.file_url ||
              vod.final_url ||
              vod.url ||
              ''
        : '';
}

function WTV_PlaybackKind(vod, playbackURL) {
    var rawUrl = WTV_VodPlaybackUrl(vod);
    var url = String(rawUrl || playbackURL || '').split('?')[0];

    if (vod && (vod.file_url || vod.final_url) && rawUrl && rawUrl === (vod.file_url || vod.final_url)) return 'archive_file';
    if (/\.m3u8$/i.test(url) || /\/playlist\.m3u8$/i.test(url)) return 'archive_hls';
    return 'archive_file';
}

function WTV_VodStartedAt(vod) {
    return vod ? vod.source_started_at || vod.started_at || vod.start_time || vod.created_at || vod.startedAt || vod.createdAt || '' : '';
}

function WTV_ParseTimeMs(value) {
    if (typeof value === 'string') value = value.replace(/(\.\d{3})\d+(Z|[+-]\d\d:?\d\d)?$/i, '$1$2');
    var ms = value ? new Date(value).getTime() : 0;
    return isNaN(ms) ? 0 : ms;
}

function WTV_ParseDurationSeconds(value) {
    var parts;
    var seconds;

    if (typeof value === 'number') return isFinite(value) && value > 0 ? parseInt(value) : 0;
    if (typeof value !== 'string') return 0;

    value = value.trim();
    if (!value) return 0;
    if (/^\d+(\.\d+)?$/.test(value)) return parseInt(value);

    if (/^\d+:\d\d(:\d\d)?$/.test(value)) {
        parts = value.split(':');
        seconds = 0;
        while (parts.length) seconds = seconds * 60 + (parseInt(parts.shift()) || 0);
        return seconds;
    }

    seconds = typeof Play_timeHMS === 'function' ? Play_timeHMS(value) : 0;
    return seconds > 0 ? seconds : parseInt(value) || 0;
}

function WTV_VodDurationSeconds(vod) {
    var duration = vod ? vod.duration_seconds || vod.duration || vod.length_seconds || 0 : 0;
    duration = WTV_ParseDurationSeconds(duration);
    if ((!duration || duration < 0) && vod && vod.ended_at) {
        duration = parseInt((WTV_ParseTimeMs(vod.ended_at) - WTV_ParseTimeMs(WTV_VodStartedAt(vod))) / 1000);
    }
    return duration > 0 ? duration : 1;
}

function WTV_DataDurationSeconds(data, meta) {
    var duration = meta && meta.duration_seconds ? meta.duration_seconds : 0;
    duration = WTV_ParseDurationSeconds(duration);
    if (!duration && data && data[11]) duration = WTV_ParseDurationSeconds(data[11]);
    return duration > 0 ? duration : 1;
}

function WTV_VodId(vod, channel) {
    return vod && (vod.recording_group_id || vod.id || vod.stream_id) ? vod.recording_group_id || vod.id || vod.stream_id : 'wtv-vod:' + channel;
}

function WTV_IdentityFromLiveMeta(meta, channel) {
    return {
        display_name: (meta && meta.twitch_display_name) || (Play_data && Play_data.data && Play_data.data[1]) || 'w.tv / ' + channel,
        login: (meta && meta.twitch_login) || (Play_data && Play_data.data && Play_data.data[6]) || channel,
        id: (meta && meta.twitch_id) || (Play_data && Play_data.data && Play_data.data[14]) || WTV_Platform + ':' + channel,
        logo: (meta && meta.twitch_logo) || (Play_data && Play_data.data && Play_data.data[9]) || IMG_404_LOGO,
        partner: (Play_data && Play_data.data && Play_data.data[10]) || false
    };
}

function WTV_IdentityFromData(data, channel) {
    var meta = WTV_GetMeta(data);
    return {
        display_name: (meta && meta.twitch_display_name) || (data && data[1]) || 'w.tv / ' + channel,
        login: (meta && meta.twitch_login) || (data && data[6]) || channel,
        id: (meta && meta.twitch_id) || (data && data[14]) || WTV_Platform + ':' + channel,
        logo: (meta && meta.twitch_logo) || (data && data[9]) || IMG_404_LOGO,
        partner: (data && data[10]) || false
    };
}

function WTV_IdentityFromMapping(mapping, channel) {
    return {
        display_name: (mapping && mapping.twitch_display_name) || (Play_data && Play_data.data && Play_data.data[1]) || 'w.tv / ' + channel,
        login: (mapping && mapping.twitch_login) || (Play_data && Play_data.data && Play_data.data[6]) || channel,
        id: (mapping && mapping.twitch_id) || (Play_data && Play_data.data && Play_data.data[14]) || WTV_Platform + ':' + channel,
        logo: (mapping && mapping.twitch_logo) || (Play_data && Play_data.data && Play_data.data[9]) || IMG_404_LOGO,
        partner: (mapping && mapping.twitch_partner) || (Play_data && Play_data.data && Play_data.data[10]) || false
    };
}

function WTV_BuildVodData(vod, channel, identity) {
    channel = WTV_NormalizeChannel((vod && (vod.source_channel || vod.channel)) || channel);
    if (channel.indexOf('wtv/') === 0) channel = WTV_NormalizeChannel(channel.substring(4));

    var playbackURL = WTV_AbsoluteArchiveUrl(WTV_ArchiveVodPlaybackUrl(vod));
    var playbackKind = WTV_PlaybackKind(vod, playbackURL);
    var startedAt = WTV_VodStartedAt(vod);
    var durationSeconds = WTV_VodDurationSeconds(vod);
    var vodId = WTV_VodId(vod, channel);
    var title = (vod && (vod.title || vod.name)) || 'w.tv recording';
    var views = (vod && (vod.view_count || vod.views || vod.viewer_count || 0)) || 0;
    var sourceCount = vod && vod.source_count ? vod.source_count : 0;
    var thumbnailURL = WTV_AbsoluteArchiveUrl(vod && (vod.thumbnail_url || vod.preview_url)) || IMG_404_VOD;
    var meta = {
        source_platform: WTV_Platform,
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
        source_count: sourceCount,
        status: (vod && vod.status) || '',
        active: !!(vod && vod.active),
        growing: !!(vod && vod.growing)
    };
    var data;

    identity = identity || WTV_IdentityFromLiveMeta(null, channel);

    meta.twitch_login = identity.login;
    meta.twitch_display_name = identity.display_name;
    meta.twitch_id = identity.id;
    meta.twitch_logo = identity.logo;

    data = [
        thumbnailURL,
        identity.display_name,
        startedAt ? Main_videoCreatedAt(startedAt) : '',
        'w.tv',
        Main_formatNumber(views),
        'W.TV',
        identity.login,
        vodId,
        null,
        WTV_Platform,
        twemoji.parse(title),
        durationSeconds,
        startedAt,
        views,
        identity.id,
        Play_timeS(durationSeconds),
        WTV_Platform
    ];

    data[WTV_MetaIndex] = meta;
    data.source_platform = WTV_Platform;
    data.source_channel = channel;
    data.playback_url = playbackURL;
    data.playback_kind = meta.playback_kind;
    data.source_kind = meta.source_kind;
    data.vod_url = playbackURL;
    data.recording_group_id = vodId;

    return WTV_NormalizeDataUrls(data);
}

function WTV_OpenVodData(data) {
    data = WTV_NormalizeDataUrls(data);
    var meta = WTV_GetMeta(data);
    if (!meta || !WTV_IsVodData(data)) return false;

    Main_clearAllPlayerEvents();
    if (Play_isOn) Play_PreshutdownStream(true);
    else if (PlayVod_isOn) PlayVod_PreshutdownStream(true);
    else if (PlayClip_isOn) PlayClip_PreshutdownStream(true);

    Main_values_Play_data = data;
    Play_data.data = Main_values_Play_data;
    Main_values.Play_isHost = false;
    Main_values.Main_selectedChannelDisplayname = meta.twitch_display_name || data[1];
    Main_values.Main_selectedChannel = meta.twitch_login || data[6];
    Main_values.Main_selectedChannelLogo = meta.twitch_logo || data[9] || IMG_404_LOGO;
    Main_values.Main_selectedChannelPartner = data[10] || false;
    Main_values.Main_selectedChannel_id = meta.twitch_id || data[14];
    Main_values.ChannelVod_vodId = data[7];
    ChannelVod_createdAt = data[2];
    ChannelVod_language = 'W.TV';
    ChannelVod_title = data[10];
    ChannelVod_game = STR_STARTED + STR_PLAYING + 'w.tv';
    ChannelVod_views = data[4];
    Play_DurationSeconds = WTV_DataDurationSeconds(data, meta);
    if (WTV_IsActiveArchiveData(data)) {
        Main_vodOffset = 0.001;
        PlayVod_ResumeTime = 0.001;
    }

    WTV_SaveVodHistory(data);
    Main_EventPlay('vod', data[6], data[3], WTV_Platform, 'WTV');
    Main_openVod();
    return true;
}

function WTV_OpenVod(vod, channel, identity, liveData) {
    var data = WTV_BuildVodData(vod, channel, identity),
        previousLiveData = liveData || (Play_data && Play_data.data ? Main_Slice(Play_data.data) : null);

    Main_clearAllPlayerEvents();
    if (Play_isOn) Play_PreshutdownStream(true);
    else if (PlayVod_isOn) PlayVod_PreshutdownStream(true);
    else if (PlayClip_isOn) PlayClip_PreshutdownStream(true);

    Main_values_Play_data = data;
    Play_data.data = Main_values_Play_data;
    Main_values.Play_isHost = false;
    Main_values.Main_selectedChannelDisplayname = data[1];
    Main_values.Main_selectedChannel = data[6];
    Main_values.Main_selectedChannelLogo = identity && identity.logo ? identity.logo : IMG_404_LOGO;
    Main_values.Main_selectedChannelPartner = identity && identity.partner ? identity.partner : false;
    Main_values.Main_selectedChannel_id = data[14];
    Main_values.ChannelVod_vodId = data[7];
    ChannelVod_createdAt = data[2];
    ChannelVod_language = 'W.TV';
    ChannelVod_title = data[10];
    ChannelVod_game = STR_STARTED + STR_PLAYING + 'w.tv';
    ChannelVod_views = data[4];
    Play_DurationSeconds = data[11];
    Main_vodOffset = 0.001;
    PlayVod_ResumeTime = 0.001;

    WTV_SaveVodHistory(data);
    WTV_LinkLiveHistoryToVod(data, previousLiveData);

    Main_EventPlay('vod', data[6], data[3], WTV_Platform, 'WTV');
    Main_openVod();
}

function WTV_OpenHistoryVod(data) {
    data = WTV_NormalizeDataUrls(data);
    var meta = WTV_GetMeta(data);
    var mapping;
    var sourceChannel;
    var identity;

    if (!meta) return false;
    if (WTV_IsVodData(data) && !WTV_IsActiveArchiveData(data)) return WTV_OpenVodData(data);

    mapping = WTV_GetChannelMapping((meta && meta.twitch_login) || (data && data[6]) || '');
    sourceChannel = (meta && meta.source_channel) || (mapping && mapping.wtv_channel) || '';
    identity = WTV_IdentityFromData(data, sourceChannel);

    if (!sourceChannel) {
        OSInterface_showToast('No w.tv archive channel metadata');
        return true;
    }

    Main_showLoadDialog();
    WTV_GetChannelVods(
        sourceChannel,
        function (response) {
            var vod = WTV_FindVodByRecordingGroup(response, meta.recording_group_id || meta.stream_id) || WTV_FindActiveVod(response) || WTV_FindVod(response);
            Main_HideLoadDialog();
            if (vod) WTV_OpenVod(vod, sourceChannel, identity, data);
            else OSInterface_showToast('No local w.tv archive recording yet');
        },
        function (error) {
            Main_HideLoadDialog();
            OSInterface_showToast('w.tv local archive lookup failed: ' + error);
        }
    );
    return true;
}

function WTV_OpenRecordingFromLive() {
    var meta = WTV_GetMeta(Play_data.data);
    var mapping = WTV_GetPlaybackMapping();
    var sourceChannel = (meta && meta.source_channel) || (mapping && mapping.wtv_channel) || '';
    var liveData = Play_data && Play_data.data ? Main_Slice(Play_data.data) : null;
    var identity = meta ? WTV_IdentityFromLiveMeta(meta, sourceChannel) : WTV_IdentityFromMapping(mapping, sourceChannel);

    if (!sourceChannel) {
        OSInterface_showToast('No w.tv recording metadata yet');
        return;
    }

    Main_showLoadDialog();
    WTV_GetChannelVods(
        sourceChannel,
        function (response) {
            var vod = WTV_FindVodByRecordingGroup(response, meta && meta.recording_group_id) || WTV_FindActiveVod(response) || WTV_FindVod(response);
            Main_HideLoadDialog();
            if (vod) WTV_OpenVod(vod, sourceChannel, identity, liveData);
            else OSInterface_showToast('No local w.tv archive recording yet');
        },
        function (error) {
            Main_HideLoadDialog();
            OSInterface_showToast('w.tv local archive lookup failed: ' + error);
        }
    );
}

function WTV_SaveVodHistory(data) {
    if (!data || !WTV_IsData(data) || !WTV_IsVodData(data)) return;
    data = WTV_NormalizeDataUrls(data);
    Main_Set_history('vod', data);
}

function WTV_LinkLiveHistoryToVod(data, liveData) {
    var meta = WTV_GetMeta(data);
    var liveId = liveData ? WTV_GetDataId(liveData) : '';
    if (!meta || !liveId || !data[7]) return;
    Main_history_UpdateLiveVod(liveId, data[7], data[0]);
}

function WTV_PlayVodApplyInfo() {
    var meta = WTV_GetMeta(Main_values_Play_data) || WTV_GetMeta(Play_data.data);
    if (!meta) return false;

    Play_DurationSeconds = meta.duration_seconds || Play_DurationSeconds || 1;
    ChannelVod_title = Main_values_Play_data[10] || meta.title || ChannelVod_title;
    ChannelVod_createdAt = Main_values_Play_data[2] || Main_videoCreatedAt(meta.started_at);
    ChannelVod_views = Main_values_Play_data[4] || Main_formatNumber(meta.viewer_count || 0);
    ChannelVod_language = 'W.TV';

    Main_values.Main_selectedChannelLogo = meta.twitch_logo || Main_values.Main_selectedChannelLogo || IMG_404_LOGO;
    Main_values.Main_selectedChannelDisplayname = meta.twitch_display_name || Main_values.Main_selectedChannelDisplayname;
    Main_values.Main_selectedChannel = meta.twitch_login || Main_values.Main_selectedChannel;
    Main_values.Main_selectedChannel_id = meta.twitch_id || Main_values.Main_selectedChannel_id;

    Play_LoadLogo(Main_getElementById('stream_info_icon'), meta.twitch_logo || IMG_404_LOGO);
    Main_innerHTML(
        'stream_info_name',
        Play_partnerIcon(Main_values.Main_selectedChannelDisplayname, Main_values.Main_selectedChannelPartner, 1, '[W.TV]')
    );
    Main_innerHTML('stream_info_title', ChannelVod_title);
    Main_textContent('stream_info_game', STR_PLAYING + 'w.tv');
    Main_innerHTMLWithEle(
        Play_infoLiveTime,
        STR_STREAM_ON + ChannelVod_createdAt + ',' + STR_SPACE_HTML + ChannelVod_views + Main_GetViewsStrings(meta.viewer_count || 0)
    );
    Main_textContent('stream_live_viewers', '');
    Main_textContentWithEle(Play_infoWatchingTime, '');
    Main_textContentWithEle(Play_BottonIcons_Progress_Duration, Play_timeS(Play_DurationSeconds));
    PlayVod_currentTime = Main_vodOffset * 1000;
    PlayVod_ProgressBarrUpdate(Main_vodOffset, Play_DurationSeconds, true);
    WTV_SaveVodHistory(Main_values_Play_data);
    return true;
}

function WTV_PlayVodLoadData() {
    var meta = WTV_GetMeta(Main_values_Play_data) || WTV_GetMeta(Play_data.data);
    if (!meta || !meta.playback_url) return false;

    if (meta.playback_kind === 'archive_file') {
        PlayVod_autoUrl = meta.playback_url;
        PlayVod_loadDataSuccessEnd('');
        WTV_SaveVodHistory(Main_values_Play_data);
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

function WTV_ShouldKeepArchivePlaylistOpen(data) {
    return WTV_IsActiveArchiveData(data);
}

function WTV_ShouldUseDirectPlaylistUrl(data, responseUrl) {
    var meta = WTV_GetMeta(data);
    var url = responseUrl || (meta && meta.playback_url) || '';

    return !!(meta && (meta.playback_kind === 'archive_hls' || Main_A_includes_B(url, '/archive/vods/')));
}

function WTV_PlaylistForPlayback(data, playlist, responseUrl) {
    if (WTV_ShouldUseDirectPlaylistUrl(data, responseUrl)) return '';

    return WTV_PatchPlaylistForData(data, playlist, responseUrl);
}

function WTV_PatchPlaylistForData(data, playlist, baseUrl) {
    var keepOpen = WTV_ShouldKeepArchivePlaylistOpen(data);
    return WTV_PatchVodPlaylist(playlist, baseUrl, {
        forceVod: !keepOpen,
        closePlaylist: !keepOpen
    });
}

function WTV_PatchVodPlaylist(playlist, baseUrl, options) {
    if (!playlist || typeof playlist !== 'string') return playlist || '';

    var lines = playlist.replace(/\r/g, '').split('\n'),
        out = [],
        hasPlaylistType = false,
        hasEndList = false,
        forceVod = !options || options.forceVod !== false,
        closePlaylist = !options || options.closePlaylist !== false,
        i = 0,
        line,
        trimmed;

    for (i; i < lines.length; i++) {
        line = lines[i];
        trimmed = line.trim();

        if (trimmed.toUpperCase().indexOf('#EXT-X-PLAYLIST-TYPE:') === 0) {
            out.push(forceVod ? '#EXT-X-PLAYLIST-TYPE:VOD' : line);
            hasPlaylistType = true;
        } else if (trimmed.toUpperCase() === '#EXT-X-ENDLIST') {
            hasEndList = true;
            out.push('#EXT-X-ENDLIST');
        } else if (trimmed && trimmed.charAt(0) !== '#') {
            out.push(WTV_ToAbsolutePlaylistUrl(trimmed, baseUrl));
        } else if (trimmed && trimmed.charAt(0) === '#' && trimmed.toUpperCase().indexOf('URI=') !== -1) {
            out.push(WTV_PatchPlaylistTagUris(line, baseUrl));
        } else {
            out.push(line);
        }
    }

    if (forceVod && !hasPlaylistType) {
        for (i = 0; i < out.length; i++) {
            if (out[i].toUpperCase().indexOf('#EXT-X-VERSION:') === 0) {
                out.splice(i + 1, 0, '#EXT-X-PLAYLIST-TYPE:VOD');
                hasPlaylistType = true;
                break;
            }
        }
        if (!hasPlaylistType) out.splice(1, 0, '#EXT-X-PLAYLIST-TYPE:VOD');
    }

    if (closePlaylist && !hasEndList) out.push('#EXT-X-ENDLIST');

    return out.join('\n');
}

function WTV_ToAbsolutePlaylistUrl(url, baseUrl) {
    if (!url || /^https?:\/\//i.test(url) || /^data:/i.test(url) || /^blob:/i.test(url)) return url;

    if (url.charAt(0) === '/') {
        var endpoint = WTV_GetEndpoint();
        return endpoint ? endpoint.replace(/\/+$/, '') + url : url;
    }

    if (baseUrl && /^https?:\/\//i.test(baseUrl)) {
        return baseUrl.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + url;
    }

    return url;
}

function WTV_PatchPlaylistTagUris(line, baseUrl) {
    return line.replace(/(URI=")([^"]+)(")/gi, function (_, prefix, uri, suffix) {
        return prefix + WTV_ToAbsolutePlaylistUrl(uri, baseUrl) + suffix;
    });
}

function WTV_PlayVodLoadDataSuccess(responseObj) {
    var playbackUrl = responseObj.url || WTV_GetPlaybackUrl(Main_values_Play_data);
    var playlist = WTV_PlaylistForPlayback(
        Main_values_Play_data,
        responseObj.responseText || '',
        WTV_GetPlaybackBaseUrl(Main_values_Play_data, playbackUrl)
    );
    PlayVod_autoUrl = playbackUrl;
    PlayVod_loadDataSuccessEnd(playlist);
}

function WTV_PlayLiveLoadDataSuccess(responseObj) {
    var playbackUrl = responseObj.url || WTV_GetPlaybackUrl(Play_data.data);
    var playlist = WTV_PlaylistForPlayback(
        Play_data.data,
        responseObj.responseText || '',
        WTV_GetPlaybackBaseUrl(Play_data.data, playbackUrl)
    );

    Play_data.AutoUrl = playbackUrl;
    Play_loadDataSuccessEnd(playlist, false);
}

function WTV_BuildLiveData(status, sourceKind) {
    var channel = WTV_NormalizeChannel(status.channel || status.source_channel || '');
    var startedAt = status.started_at || new Date().toISOString();
    var streamId = status.stream_id || status.recording_group_id || WTV_Platform + ':' + channel;
    var viewerCount = status.viewer_count || 0;
    var title = status.title || channel;
    var playbackUrl = WTV_AbsoluteArchiveUrl(status.playback_url || status.vod_url || '');
    var vodUrl = WTV_AbsoluteArchiveUrl(status.vod_url || playbackUrl);
    var thumbnailUrl = WTV_NormalizeArchiveUrl(status.preview_url || status.thumbnail_url || IMG_404_BANNER);
    var meta = {
        source_platform: WTV_Platform,
        source_channel: channel,
        source_kind: sourceKind || 'live',
        playback_url: playbackUrl,
        playback_kind: status.playback_kind || 'direct_hls',
        vod_url: vodUrl,
        recording_group_id: status.recording_group_id || '',
        stream_id: streamId,
        title: title,
        started_at: startedAt,
        viewer_count: viewerCount,
        status: status.status || '',
        active: !!status.active,
        growing: !!status.growing
    };
    var data = [
        thumbnailUrl,
        'w.tv / ' + channel,
        title,
        'w.tv',
        Main_formatNumber(viewerCount),
        '[W.TV]',
        channel,
        streamId,
        false,
        status.profile_image_url || IMG_404_LOGO,
        false,
        Play_streamLiveAt(startedAt),
        startedAt,
        viewerCount,
        WTV_Platform + ':' + channel,
        WTV_Platform,
        null,
        null,
        null
    ];

    data[WTV_MetaIndex] = meta;
    data.source_platform = WTV_Platform;
    data.source_channel = channel;
    data.playback_url = playbackUrl;
    data.playback_kind = meta.playback_kind;
    data.source_kind = meta.source_kind;
    data.vod_url = meta.vod_url;
    data.recording_group_id = meta.recording_group_id;

    return WTV_NormalizeDataUrls(data);
}
