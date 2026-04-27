import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const client = require('../../webos/service/hls_playlist_client.js');

function parse(url) {
  return new URL(url);
}

const liveUrl = 'https://usher.ttvnw.net/api/channel/hls/somechannel.m3u8?sig=s&token=t';
const vodUrl = 'https://usher.ttvnw.net/vod/12345.m3u8?sig=s&token=t';

{
  const attempts = client.buildFetchAttempts(parse(liveUrl), liveUrl, {});
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].type, 'ttvlol_proxy');
  assert.equal(attempts[0].proxy.source, 'firefox.api.cdn-perfprod.com:2023');
  assert.equal(attempts[0].proxy.protocol, 'http:');
  assert.equal(attempts[0].proxy.hostname, 'firefox.api.cdn-perfprod.com');
  assert.equal(attempts[0].proxy.port, 2023);
  assert.equal(attempts[1].type, 'direct');
}

{
  const attempts = client.buildFetchAttempts(parse(liveUrl), liveUrl, {
    optimizedProxies: 'https://user:pass@example.test:9443; http://backup.test:8080, bad://ignored'
  });
  assert.equal(attempts.length, 3);
  assert.deepEqual(
    attempts.map(attempt => attempt.proxy && `${attempt.proxy.protocol}//${attempt.proxy.hostname}:${attempt.proxy.port}`),
    ['https://example.test:9443', 'http://backup.test:8080', null]
  );
  assert.equal(attempts[0].proxy.auth, 'user:pass');
}

{
  const attempts = client.buildFetchAttempts(parse(liveUrl), liveUrl, {
    ttvLolEnabled: false,
    optimizedProxies: ['custom.test:3128']
  });
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].type, 'direct');
}

{
  const attempts = client.buildFetchAttempts(parse(vodUrl), vodUrl, {
    optimizedProxies: ['custom.test:3128']
  });
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].type, 'direct');
}

{
  assert.equal(client.isAllowedPlaylistUrl(parse(liveUrl)), true);
  assert.equal(client.isAllowedPlaylistUrl(parse(vodUrl)), true);
  assert.equal(client.isAllowedPlaylistUrl(parse('https://usher.ttvnw.net/api/channel/hls/somechannel.ts')), false);
  assert.equal(client.isAllowedPlaylistUrl(parse('https://evil.example/api/channel/hls/somechannel.m3u8')), false);
}

{
  assert.deepEqual(
    client.normalizeList('["one.test:1", "two.test:2", "one.test:1"]', []),
    ['one.test:1', 'two.test:2']
  );
  assert.deepEqual(client.normalizeList('', ['fallback.test:3128']), ['fallback.test:3128']);
}

{
  const headers = client.buildRequestHeaders({
    origin: 'https://player.twitch.tv\r\nInjected: yes',
    referer: 'https://player.twitch.tv/',
    userAgent: 'UA\nInjected: yes',
    acceptLanguage: ''
  });
  assert.equal(headers.Origin, 'https://player.twitch.tv  Injected: yes');
  assert.equal(headers['User-Agent'], 'UA Injected: yes');
  assert.equal(headers['Accept-Language'], 'en-US,en;q=0.9');
}

{
  const fs = require('node:fs');
  const settingsSource = fs.readFileSync('app/specific/Settings.js', 'utf8');
  assert.match(settingsSource, /webos_ttv_lol_proxy_settings/);
  assert.match(settingsSource, /STTV_TTVLOL_ENABLED/);
  assert.match(settingsSource, /STTV_TTVLOL_PROXIES/);
  assert.match(settingsSource, /Settings_DialogShowWebOsTtvLolProxy/);

  const bridgeSource = fs.readFileSync('webos/bridge/webosCompatBridge.js', 'utf8');
  assert.match(bridgeSource, /webos_ttv_lol_proxy/);
  assert.match(bridgeSource, /webos_ttv_lol_proxy_url_value/);
  assert.match(bridgeSource, /3\.0\.379/);
  assert.match(bridgeSource, /remoteWebTag <= localWebTag/);

  const versionSource = fs.readFileSync('app/general/version.js', 'utf8');
  assert.match(versionSource, /April 28 2026/);
  assert.match(versionSource, /WebTag: 728/);
  assert.match(versionSource, /ApkUrl: ''/);
}

console.log('hlsPlaylistClient tests passed');
