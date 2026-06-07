const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const appInfoPath = path.join(root, 'webos', 'app', 'appinfo.json');

function readAppInfo() {
    if (!fs.existsSync(appInfoPath)) {
        throw new Error('Missing appinfo: ' + appInfoPath);
    }
    return JSON.parse(fs.readFileSync(appInfoPath, 'utf8'));
}

function bumpPatch(version) {
    const match = String(version || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) {
        throw new Error('Unsupported app version format: ' + version + '. Expected x.y.z.');
    }
    return match[1] + '.' + match[2] + '.' + String(Number(match[3]) + 1);
}

function main() {
    const appInfo = readAppInfo();
    const previousVersion = appInfo.version;
    appInfo.version = bumpPatch(previousVersion);
    fs.writeFileSync(appInfoPath, JSON.stringify(appInfo, null, 2) + '\n');
    console.log('Bumped local webOS app version: ' + previousVersion + ' -> ' + appInfo.version);
}

main();
