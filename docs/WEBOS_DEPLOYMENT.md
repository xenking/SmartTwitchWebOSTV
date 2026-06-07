# webOS Build, Package, Deploy, and Release (Canonical)

This document is the canonical operations guide for building and releasing this fork.

## Prerequisites
- Node.js installed
- Dependencies installed with `npm install`
- webOS CLI available (`@webos-tools/cli`, includes `ares-*`)
- Configured webOS device profile named `webos` for install/launch/inspect/remove commands

## Local Build and Validation

From repository root:

```bash
npm run hosted:prepare
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
npm run webos:bump-local-version
npm run webos:package
npm run webos:install
npm run webos:launch
npm run webos:close
npm run webos:restart
npm run webos:inspect
npm run webos:remove
```

`npm run webos:install` is the normal local TV path. It bumps `webos/app/appinfo.json`, rebuilds the IPK, and installs it to the configured webOS device without removing app data.

Use `npm run webos:install:ipk` only when you intentionally want to install the already-built IPK without changing the app version.

Device commands target `STTV_WEBOS_DEVICE`, then `WEBOS_DEVICE`, then `tv-wired`.

## Release Artifacts
- Homebrew metadata template source:
  - `webos/homebrew/packages/com.tbsniller.smarttwitchwebostv.yml`
- Artifact generation script:
  - `npm run release:artifacts`
- Stable manifest URL contract:
  - `https://github.com/xenking/SmartTwitchWebOSTV/releases/latest/download/com.tbsniller.smarttwitchwebostv.manifest.json`

## GitHub Release Automation

Workflow: `.github/workflows/release.yml`
- Trigger: tag push matching `v*`
- Enforced gate: tag must match `webos/app/appinfo.json` version (`vX.Y.Z`)
- Pipeline:
  1. `npm ci`
  2. `npm run hosted:prepare`
  3. `npm run lint`
  4. `npm run webos:package`
  5. `npm run release:artifacts`
  6. publish release assets (`*.ipk`, `*.manifest.json`, `*.apps-repo.yml`)

## Related Docs
- Live adroll/proxy logging: `docs/WEBOS_ADROLL_REPRO.md`
- Upstream sync procedure: `docs/UPSTREAM_SYNC_PLAYBOOK.md`
- Current implementation/parity snapshot: `docs/WEBOS_PORTING_STATUS.md`
- Platform limits: `docs/WEBOS_LIMITATIONS.md`
