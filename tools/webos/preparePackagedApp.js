const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const stagedReleaseDir = path.join(root, '.tmp', 'webos-release-artifact', 'release');
const packagedReleaseDir = path.join(root, 'webos', 'app', 'release');
const stagedIndex = path.join(stagedReleaseDir, 'index.html');
const stagedBridge = path.join(stagedReleaseDir, 'githubio', 'js', 'webosCompatBridge.js');

function ensureExists(target, label) {
    if (!fs.existsSync(target)) {
        throw new Error('Missing ' + label + ': ' + target + '. Run npm run webos:prepare-release first.');
    }
}

ensureExists(stagedIndex, 'staged release index');
ensureExists(stagedBridge, 'staged webOS bridge');

fs.rmSync(packagedReleaseDir, {recursive: true, force: true});
fs.cpSync(stagedReleaseDir, packagedReleaseDir, {recursive: true});

console.log('Prepared packaged webOS release at: ' + packagedReleaseDir);
