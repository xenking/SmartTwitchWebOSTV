/*
 * SmartTwitchWebOSTV local webOS JS service for HLS playlist fetches.
 * Keeps Twitch token/playlist fetches inside the app package service process
 * so browser CORS restrictions do not block quality parsing in the hosted app.
 */

'use strict';

var pkgInfo = require('./package.json');
var Service = require('webos-service');
var hlsClient = require('./hls_playlist_client');

var service = new Service(pkgInfo.name);

service.register('fetchPlaylist', function (message) {
    var payload = message && message.payload && typeof message.payload === 'object' ? message.payload : {};
    hlsClient.fetchPlaylist(payload, function (result) {
        message.respond(result);
    });
});
