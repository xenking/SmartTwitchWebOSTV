/*
 * HLS playlist client for the SmartTwitchWebOSTV webOS service.
 * Fetches Twitch Usher playlists directly or through TTV LOL v2-style
 * HTTP(S) CONNECT proxies. Kept dependency-free so it can be unit tested
 * outside the Luna service runtime.
 */

'use strict';

var https = require('https');
var net = require('net');
var tls = require('tls');
var urlLib = require('url');

var ALLOWED_HOST = 'usher.ttvnw.net';
var MAX_RESPONSE_BYTES = 1024 * 1024;
var DEFAULT_TIMEOUT_MS = 4500;
var MIN_TIMEOUT_MS = 1200;
var MAX_TIMEOUT_MS = 7000;
var DEFAULT_ACCEPT_LANGUAGE = 'en-US,en;q=0.9';
var DEFAULT_OPTIMIZED_PROXIES = ['firefox.api.cdn-perfprod.com:2023'];
var MAX_PROXY_COUNT = 12;
var MAX_PROXY_LENGTH = 512;

function clampTimeout(value) {
    var parsed = parseInt(value, 10);
    if (!isFinite(parsed) || parsed <= 0) parsed = DEFAULT_TIMEOUT_MS;
    if (parsed < MIN_TIMEOUT_MS) parsed = MIN_TIMEOUT_MS;
    if (parsed > MAX_TIMEOUT_MS) parsed = MAX_TIMEOUT_MS;
    return parsed;
}

function isAllowedPlaylistUrl(parsedUrl) {
    if (!parsedUrl) return false;
    if (parsedUrl.protocol !== 'https:') return false;
    if (String(parsedUrl.hostname || '').toLowerCase() !== ALLOWED_HOST) return false;
    var path = String(parsedUrl.pathname || '').toLowerCase();
    if (!/\.m3u8$/.test(path)) return false;
    if (path.indexOf('/api/channel/hls/') === 0) return true;
    if (path.indexOf('/vod/') === 0) return true;
    return false;
}

function isLiveChannelPlaylistUrl(parsedUrl) {
    if (!parsedUrl) return false;
    var path = String(parsedUrl.pathname || '').toLowerCase();
    return path.indexOf('/api/channel/hls/') === 0 && /\.m3u8$/.test(path);
}

function normalizeList(value, fallback) {
    var items = [];
    var i;
    if (Array.isArray(value)) {
        for (i = 0; i < value.length; i++) items.push(value[i]);
    } else if (typeof value === 'string') {
        var trimmed = value.trim();
        if (trimmed.charAt(0) === '[') {
            try {
                var parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    for (i = 0; i < parsed.length; i++) items.push(parsed[i]);
                }
            } catch (eJson) {}
        }
        if (!items.length) items = trimmed.split(/[\n,;]+/);
    }
    var result = [];
    var seen = {};
    for (i = 0; i < items.length && result.length < MAX_PROXY_COUNT; i++) {
        var item = typeof items[i] === 'string' ? items[i].replace(/[\r\n]/g, '').trim() : '';
        if (!item || item.length > MAX_PROXY_LENGTH) continue;
        if (seen[item]) continue;
        seen[item] = true;
        result.push(item);
    }
    if (!result.length && Array.isArray(fallback)) return fallback.slice(0, MAX_PROXY_COUNT);
    return result;
}

function parseProxyInfo(entry) {
    if (typeof entry !== 'string') return null;
    var source = entry.trim();
    if (!source) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(source)) source = 'http://' + source;
    var parsed = urlLib.parse(source);
    var protocol = String(parsed.protocol || '').toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') return null;
    var port = parsed.port ? parseInt(parsed.port, 10) : (protocol === 'https:' ? 443 : 3128);
    if (!parsed.hostname || !isFinite(port) || port <= 0 || port > 65535) return null;
    return {
        source: entry,
        protocol: protocol,
        hostname: parsed.hostname,
        port: port,
        auth: parsed.auth || ''
    };
}

function basicAuthHeader(auth) {
    if (!auth) return '';
    try {
        if (Buffer.from) return 'Basic ' + Buffer.from(auth, 'utf8').toString('base64');
    } catch (eFrom) {}
    try {
        return 'Basic ' + new Buffer(auth, 'utf8').toString('base64');
    } catch (eBuffer) {}
    return '';
}

function openHttpsProxyTunnel(proxyInfo, targetHost, targetPort, timeoutMs, callback) {
    var settled = false;
    var socket = null;
    var buffered = '';
    var finish = function (err, tlsSocket) {
        if (settled) return;
        settled = true;
        if (socket) {
            try { socket.removeAllListeners('data'); } catch (eData) {}
            try { socket.removeAllListeners('error'); } catch (eError) {}
            try { socket.removeAllListeners('timeout'); } catch (eTimeout) {}
        }
        callback(err, tlsSocket);
    };
    var connectOptions = {host: proxyInfo.hostname, port: proxyInfo.port};
    var onConnected = function () {
        try { socket.setTimeout(timeoutMs); } catch (eTimeoutSet) {}
        var authority = targetHost + ':' + targetPort;
        var lines = [
            'CONNECT ' + authority + ' HTTP/1.1',
            'Host: ' + authority,
            'Proxy-Connection: Keep-Alive',
            'Connection: Keep-Alive'
        ];
        var authHeader = basicAuthHeader(proxyInfo.auth);
        if (authHeader) lines.push('Proxy-Authorization: ' + authHeader);
        socket.write(lines.join('\r\n') + '\r\n\r\n');
    };
    try {
        socket = proxyInfo.protocol === 'https:' ? tls.connect(connectOptions, onConnected) : net.connect(connectOptions, onConnected);
    } catch (eCreate) {
        finish(eCreate);
        return null;
    }
    socket.on('data', function (chunk) {
        if (settled) return;
        buffered += chunk.toString('latin1');
        var headerEnd = buffered.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        var header = buffered.slice(0, headerEnd);
        var statusMatch = header.match(/^HTTP\/\d+(?:\.\d+)?\s+(\d+)/i);
        var status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
        if (status !== 200) {
            finish(new Error('PROXY_CONNECT_STATUS_' + (status || 'UNKNOWN')));
            try { socket.destroy(); } catch (eDestroyBadStatus) {}
            return;
        }
        try { socket.setTimeout(0); } catch (eClearTimeout) {}
        var secureSocket = tls.connect({socket: socket, servername: targetHost}, function () {
            finish(null, secureSocket);
        });
        secureSocket.on('error', function (err) { finish(err); });
    });
    socket.on('timeout', function () {
        finish(new Error('PROXY_CONNECT_TIMEOUT'));
        try { socket.destroy(); } catch (eDestroyTimeout) {}
    });
    socket.on('error', function (err) { finish(err); });
    return socket;
}

function normalizeHeaderValue(value, maxLength) {
    if (typeof value !== 'string') return '';
    var cleaned = value.replace(/[\r\n]/g, ' ').trim();
    if (!cleaned) return '';
    if (maxLength > 0 && cleaned.length > maxLength) return cleaned.slice(0, maxLength);
    return cleaned;
}

function buildRequestHeaders(payload) {
    var requestOrigin = normalizeHeaderValue(payload.origin, 256);
    var requestReferer = normalizeHeaderValue(payload.referer, 1024);
    var requestUserAgent = normalizeHeaderValue(payload.userAgent, 512);
    var requestAcceptLanguage = normalizeHeaderValue(payload.acceptLanguage, 256) || DEFAULT_ACCEPT_LANGUAGE;
    var requestHeaders = {
        Accept: '*/*',
        'Accept-Encoding': 'identity',
        'Accept-Language': requestAcceptLanguage
    };
    if (requestOrigin) requestHeaders.Origin = requestOrigin;
    if (requestReferer) requestHeaders.Referer = requestReferer;
    if (requestUserAgent) requestHeaders['User-Agent'] = requestUserAgent;
    requestHeaders['Sec-Fetch-Mode'] = 'cors';
    requestHeaders['Sec-Fetch-Site'] = 'cross-site';
    return requestHeaders;
}

function requestPlaylistText(targetUrl, parsedUrl, headers, timeoutMs, proxyInfo, callback) {
    var finished = false;
    var reqOptions = {
        protocol: 'https:',
        hostname: parsedUrl.hostname,
        port: parsedUrl.port ? parsedUrl.port : 443,
        method: 'GET',
        path: parsedUrl.pathname + (parsedUrl.search || ''),
        headers: headers
    };
    if (proxyInfo) {
        reqOptions.agent = false;
        reqOptions.createConnection = function (options, oncreate) {
            return openHttpsProxyTunnel(proxyInfo, parsedUrl.hostname, parsedUrl.port ? parsedUrl.port : 443, timeoutMs, oncreate);
        };
    }
    var req = https.request(reqOptions, function (res) {
        var status = parseInt(res.statusCode, 10) || 0;
        if (status !== 200) {
            try { res.resume(); } catch (eResume) {}
            callback(new Error('UPSTREAM_STATUS_' + status), status, '', targetUrl);
            return;
        }
        var chunks = [];
        var totalBytes = 0;
        res.on('data', function (chunk) {
            if (finished) return;
            totalBytes += chunk.length;
            if (totalBytes > MAX_RESPONSE_BYTES) {
                req.destroy(new Error('RESPONSE_TOO_LARGE'));
                return;
            }
            chunks.push(chunk);
        });
        res.on('end', function () {
            if (finished) return;
            var body = '';
            try {
                body = Buffer.concat(chunks).toString('utf8');
            } catch (eConcat) {
                callback(new Error('DECODE_ERROR'), 500, '', targetUrl);
                return;
            }
            if (body.indexOf('#EXTM3U') === -1) {
                callback(new Error('INVALID_PLAYLIST'), 502, body, targetUrl);
                return;
            }
            callback(null, 200, body, targetUrl);
        });
    });
    req.setTimeout(timeoutMs, function () {
        req.destroy(new Error('TIMEOUT'));
    });
    req.on('error', function (err) {
        if (finished) return;
        finished = true;
        callback(err || new Error('NETWORK_ERROR'), 0, '', targetUrl);
    });
    req.end();
}

function isTtvLolEnabled(payload) {
    return payload.ttvLolEnabled !== false && payload.ttvLolEnabled !== 'false' && payload.ttvLolEnabled !== 0;
}

function buildFetchAttempts(parsedUrl, targetUrl, payload) {
    var attempts = [];
    if (isTtvLolEnabled(payload) && isLiveChannelPlaylistUrl(parsedUrl)) {
        var optimizedProxies = normalizeList(payload.optimizedProxies, DEFAULT_OPTIMIZED_PROXIES);
        var proxyIndex;
        for (proxyIndex = 0; proxyIndex < optimizedProxies.length; proxyIndex++) {
            var proxyInfo = parseProxyInfo(optimizedProxies[proxyIndex]);
            if (proxyInfo) attempts.push({type: 'ttvlol_proxy', proxy: proxyInfo, url: targetUrl});
        }
    }
    attempts.push({type: 'direct', proxy: null, url: targetUrl});
    return attempts;
}

function errorResult(lastError) {
    var lastMessage = lastError && lastError.message ? String(lastError.message) : 'Network request failed';
    var errorCode = lastMessage === 'RESPONSE_TOO_LARGE' ? 'RESPONSE_TOO_LARGE' : lastMessage === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK_ERROR';
    var statusCode = lastMessage === 'RESPONSE_TOO_LARGE' ? 413 : lastMessage === 'TIMEOUT' ? 504 : 502;
    return {
        returnValue: false,
        status: statusCode,
        errorCode: errorCode,
        errorText: lastMessage
    };
}

function fetchPlaylist(payload, callback) {
    payload = payload && typeof payload === 'object' ? payload : {};
    var targetUrl = typeof payload.url === 'string' ? payload.url : '';
    if (!targetUrl) {
        callback({returnValue: false, status: 400, errorCode: 'INVALID_URL', errorText: 'payload.url is required'});
        return;
    }

    var parsedUrl = null;
    try {
        parsedUrl = urlLib.parse(targetUrl);
    } catch (eUrl) {
        callback({returnValue: false, status: 400, errorCode: 'INVALID_URL', errorText: 'payload.url is not a valid URL'});
        return;
    }
    if (!parsedUrl || !parsedUrl.hostname) {
        callback({returnValue: false, status: 400, errorCode: 'INVALID_URL', errorText: 'payload.url is not a valid URL'});
        return;
    }

    if (!isAllowedPlaylistUrl(parsedUrl)) {
        callback({returnValue: false, status: 403, errorCode: 'URL_NOT_ALLOWED', errorText: 'Only usher Twitch playlist URLs are allowed'});
        return;
    }

    var timeoutMs = clampTimeout(payload.timeoutMs);
    var requestHeaders = buildRequestHeaders(payload);
    var attempts = buildFetchAttempts(parsedUrl, targetUrl, payload);
    var lastError = null;
    var done = false;
    var finish = function (result) {
        if (done) return;
        done = true;
        callback(result);
    };
    var tryAttempt = function (index) {
        if (done) return;
        if (index >= attempts.length) {
            finish(errorResult(lastError));
            return;
        }
        var attempt = attempts[index];
        requestPlaylistText(attempt.url, parsedUrl, requestHeaders, timeoutMs, attempt.proxy, function (err, status, body, responseUrl) {
            if (!err && status === 200 && body && body.indexOf('#EXTM3U') !== -1) {
                finish({
                    returnValue: true,
                    status: 200,
                    responseText: body,
                    url: responseUrl || targetUrl,
                    source: attempt.type,
                    proxy: attempt.proxy ? attempt.proxy.source : ''
                });
                return;
            }
            lastError = err || new Error('UPSTREAM_STATUS_' + (status || 0));
            tryAttempt(index + 1);
        });
    };
    tryAttempt(0);
}

module.exports = {
    ALLOWED_HOST: ALLOWED_HOST,
    DEFAULT_OPTIMIZED_PROXIES: DEFAULT_OPTIMIZED_PROXIES,
    clampTimeout: clampTimeout,
    isAllowedPlaylistUrl: isAllowedPlaylistUrl,
    isLiveChannelPlaylistUrl: isLiveChannelPlaylistUrl,
    normalizeList: normalizeList,
    parseProxyInfo: parseProxyInfo,
    buildRequestHeaders: buildRequestHeaders,
    buildFetchAttempts: buildFetchAttempts,
    requestPlaylistText: requestPlaylistText,
    fetchPlaylist: fetchPlaylist
};
