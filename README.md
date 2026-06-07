# SmartTwitchWebOSTV

`xenking/SmartTwitchWebOSTV` is a webOS Twitch TV app maintained for the local webOS runtime and the packaged IPK flow in this repository.

The app is built from the tracked `app/` sources into `release/`, then packaged into `webos/app/release/` with the webOS compatibility bridge injected before `main.js`. webOS features can live in `app/specific/**`, `webos/bridge/**`, and `webos/app/**` when that is the cleanest implementation point.

## Install

### Local TV Install

```bash
npm install
npm run webos:install
```

`npm run webos:install` bumps `webos/app/appinfo.json`, rebuilds the release bundle, packages a new IPK, installs over the existing app, and preserves app storage.

### Manual IPK Install

```bash
npm install
npm run webos:package
```

The IPK is written to `build/`.

## Development

Common commands:

- `npm test` - run webOS/local VOD regression tests.
- `npm run lint` - validate generated JavaScript and the webOS bridge.
- `npm run release:build` - rebuild `release/githubio/js/main.js` from `app/`.
- `npm run webos:prepare-release` - stage the release artifact and inject the webOS bridge.
- `npm run webos:package` - rebuild and package the IPK.
- `npm run webos:install` - bump version, rebuild, package, and install to the configured TV.
- `npm run webos:restart` - close and relaunch the installed TV app.
- `npm run webos:inspect` - open the webOS inspector.

Default device resolution for webOS commands:

```text
STTV_WEBOS_DEVICE -> WEBOS_DEVICE -> tv-wired
```

## Runtime Scope

- Core app logic: `app/`
- Local Twitch archive VOD integration: `app/specific/LocalVod.js`
- WTV integration: `app/specific/WTV.js`
- VOD playback/chat/preview behavior: `app/specific/PlayVod.js`, `app/specific/ChatVod.js`
- webOS bridge/runtime compatibility: `webos/bridge/webosCompatBridge.js`
- webOS wrapper/app metadata: `webos/app/`
- Release and packaging tools: `release/scripts/`, `tools/webos/`, `tools/release/`

## Documentation

- Build/package/deploy operations: [docs/WEBOS_DEPLOYMENT.md](docs/WEBOS_DEPLOYMENT.md)
- Current implementation status: [docs/WEBOS_PORTING_STATUS.md](docs/WEBOS_PORTING_STATUS.md)
- Platform limits: [docs/WEBOS_LIMITATIONS.md](docs/WEBOS_LIMITATIONS.md)
- Android to webOS compatibility map: [docs/ANDROID_TO_WEBOS_FLOW_MAPPING.md](docs/ANDROID_TO_WEBOS_FLOW_MAPPING.md)
- Bridge performance notes: [docs/WEBOS_BRIDGE_PERFORMANCE_AUDIT.md](docs/WEBOS_BRIDGE_PERFORMANCE_AUDIT.md)
- AI/codebase orientation: [docs/AI_DOCUMENTATION.md](docs/AI_DOCUMENTATION.md)

## Repository Hygiene

Generated and local agent artifacts are intentionally ignored:

- `webos/app/release/`
- `.tmp/`
- `build/`
- `.ai_context/`
- `.omx/`
- `.codebase-memory/`
- `.beads/`

Do not clear TV app storage during normal install/debug loops. Install over the existing app so local settings, users, and watch history remain intact.
