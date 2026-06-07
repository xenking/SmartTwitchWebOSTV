# webOS Build, Package, Deploy, and Release

This is the operations guide for `xenking/SmartTwitchWebOSTV`.

## Prerequisites
- Node.js installed.
- Dependencies installed with `npm install`.
- webOS CLI available through `@webos-tools/cli`.
- Configured webOS device profile. Scripts resolve device as `STTV_WEBOS_DEVICE`, then `WEBOS_DEVICE`, then `tv-wired`.

## Local Build and Validation

```bash
npm run release:build
npm run webos:prepare-release
npm run lint
npm run webos:package
npm run release:artifacts
```

Outputs:
- `build/com.tbsniller.smarttwitchwebostv_<version>_all.ipk`
- `build/com.tbsniller.smarttwitchwebostv.manifest.json`
- `build/com.tbsniller.smarttwitchwebostv.apps-repo.yml`

## Device Operations

```bash
npm run webos:install
npm run webos:launch
npm run webos:close
npm run webos:restart
npm run webos:inspect
```

`npm run webos:install` is the normal local TV path. It bumps `webos/app/appinfo.json`, rebuilds the release bundle, packages the IPK, and installs over the existing app without removing app data.

Use `npm run webos:install:ipk` only when installing an already-built IPK without changing the app version.

`npm run webos:remove` is destructive for app data and should only be used when explicitly requested.

## Release Artifact Flow

1. `npm run release:build` rebuilds `release/githubio/js/main.js` and `main_uncompressed.js` from `app/`.
2. `npm run webos:prepare-release` stages `.tmp/webos-release-artifact/release` and injects `webosCompatBridge.js` before `main.js`.
3. `npm run webos:prepare-app` copies the staged release into `webos/app/release/`.
4. `npm run webos:package` creates the IPK under `build/`.

## GitHub Release Automation

Workflow: `.github/workflows/release.yml`
- Trigger: tag push matching `v*`.
- Enforced gate: tag must match `webos/app/appinfo.json` version (`vX.Y.Z`).
- Pipeline:
  1. `npm ci`
  2. `npm run webos:prepare-release`
  3. `npm run lint`
  4. `npm run webos:package`
  5. `npm run release:artifacts`
  6. publish release assets (`*.ipk`, `*.manifest.json`, `*.apps-repo.yml`)

Stable manifest URL:

```text
https://github.com/xenking/SmartTwitchWebOSTV/releases/latest/download/com.tbsniller.smarttwitchwebostv.manifest.json
```

## Related Docs
- Live adroll/proxy logging: `docs/WEBOS_ADROLL_REPRO.md`
- Current implementation/parity snapshot: `docs/WEBOS_PORTING_STATUS.md`
- Platform limits: `docs/WEBOS_LIMITATIONS.md`
