const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const appInfoPath = path.join(root, 'webos', 'app', 'appinfo.json');

function loadAppInfo() {
    if (!fs.existsSync(appInfoPath)) {
        throw new Error('Missing appinfo: ' + appInfoPath);
    }
    return JSON.parse(fs.readFileSync(appInfoPath, 'utf8'));
}

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32'
    });
    process.exit(result.status || 0);
}

function nodeMajor() {
    return Number((process.versions.node || '0').split('.')[0]) || 0;
}

function runAres(command, args) {
    const localBin = path.join(root, 'node_modules', '@webos-tools', 'cli', 'bin', command + '.js');
    if (process.env.STTV_WEBOS_ARES_NODE) {
        run(process.env.STTV_WEBOS_ARES_NODE, [localBin].concat(args));
        return;
    }

    // @webos-tools/cli 3.2.x device/novacom commands currently crash under Node 25
    // with `isDate is not a function`. Use Node 20 for device operations when the
    // active shell Node is newer than the CLI supports.
    if (nodeMajor() >= 23 && fs.existsSync(localBin)) {
        run('npx', ['-y', '-p', 'node@20', 'node', localBin].concat(args));
        return;
    }

    run(command, args);
}

function main() {
    const action = process.argv[2];
    if (!action) {
        throw new Error('Usage: node tools/webos/runAresCommand.js <install|launch|inspect|remove>');
    }

    const appInfo = loadAppInfo();
    const id = appInfo.id;
    const version = appInfo.version;
    const ipkFile = path.join(root, 'build', id + '_' + version + '_all.ipk');

    if (action === 'install') {
        runAres('ares-install', [ipkFile]);
        return;
    }

    if (action === 'launch') {
        runAres('ares-launch', [id]);
        return;
    }

    if (action === 'inspect') {
        runAres('ares-inspect', ['--device', 'webos', id]);
        return;
    }

    if (action === 'remove') {
        runAres('ares-install', ['--device', 'webos', '-r', id]);
        return;
    }

    throw new Error('Unsupported action: ' + action);
}

main();

