const fs = require('fs');
const path = require('path');
const UglifyJS = require('uglify-js');

const root = path.resolve(__dirname, '..', '..');
const releaseSourceDir = path.join(root, 'release');
const bridgeSource = path.join(root, 'webos', 'bridge', 'webosCompatBridge.js');
const defaultOutputRoot = path.join(root, '.tmp', 'hosted-release-artifact');
const defaultChannel = 'release';
const bridgeTag = '<script src="githubio/js/webosCompatBridge.js"></script>';
const mainScriptRegex = /<script\b(?=[^>]*\bsrc\s*=\s*['"][^'"]*githubio\/js\/main\.js(?:\?[^'"]*)?['"])[^>]*>\s*<\/script>/i;
const anyBridgeTagRegex = /<script\b(?=[^>]*\bsrc\s*=\s*['"][^'"]*webos(?:Hosted|Compat)Bridge\.js(?:\?[^'"]*)?['"])[^>]*>\s*<\/script>\s*/gi;
const bridgeTagGlobalRegex = /<script\b(?=[^>]*\bsrc\s*=\s*['"][^'"]*githubio\/js\/webosCompatBridge\.js(?:\?[^'"]*)?['"])[^>]*>\s*<\/script>/gi;
const bridgeTagSingleRegex = /<script\b(?=[^>]*\bsrc\s*=\s*['"][^'"]*githubio\/js\/webosCompatBridge\.js(?:\?[^'"]*)?['"])[^>]*>\s*<\/script>/i;
const validChannelRegex = /^[A-Za-z0-9._-]+$/;

function parseArgs(argv) {
    let outputRoot = defaultOutputRoot;
    let channel = defaultChannel;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--help' || arg === '-h') {
            console.log('Usage: node tools/upstream/prepareHostedRelease.js [--out-dir <dir>] [--channel <name>]');
            process.exit(0);
        }

        if (arg === '--out-dir') {
            const next = argv[index + 1];
            if (!next) {
                throw new Error('Missing value for --out-dir');
            }
            outputRoot = resolveOutputRoot(next);
            index += 1;
            continue;
        }

        if (arg.indexOf('--out-dir=') === 0) {
            outputRoot = resolveOutputRoot(arg.slice('--out-dir='.length));
            continue;
        }

        if (arg === '--channel') {
            const next = argv[index + 1];
            if (!next) {
                throw new Error('Missing value for --channel');
            }
            channel = resolveChannel(next);
            index += 1;
            continue;
        }

        if (arg.indexOf('--channel=') === 0) {
            channel = resolveChannel(arg.slice('--channel='.length));
            continue;
        }

        throw new Error('Unknown argument: ' + arg);
    }

    return {outputRoot, channel};
}

function resolveOutputRoot(value) {
    if (!value) {
        throw new Error('Invalid output directory argument');
    }
    if (path.isAbsolute(value)) {
        return value;
    }
    return path.resolve(root, value);
}

function resolveChannel(value) {
    if (!value || !validChannelRegex.test(value)) {
        throw new Error('Invalid channel value: ' + value);
    }
    return value;
}

function ensureSourceInputs() {
    const releaseIndexPath = path.join(releaseSourceDir, 'index.html');
    if (!fs.existsSync(releaseSourceDir)) {
        throw new Error('Missing tracked release directory: ' + releaseSourceDir);
    }
    if (!fs.existsSync(releaseIndexPath)) {
        throw new Error('Missing tracked release index: ' + releaseIndexPath);
    }
    if (!fs.existsSync(bridgeSource)) {
        throw new Error('Missing bridge source: ' + bridgeSource);
    }
}

function replaceRequired(content, pattern, replacement, label) {
    const next = content.replace(pattern, replacement);
    if (next === content) {
        throw new Error('Failed to patch staged bridge for channel: missing ' + label);
    }
    return next;
}


function replaceOnce(content, search, replacement, label) {
    if (content.indexOf(search) < 0) {
        throw new Error('Failed to patch staged main script: missing ' + label);
    }
    return content.replace(search, replacement);
}

function patchWebosMainScript(stagedChannelDir) {
    const mainUncompressedPath = path.join(stagedChannelDir, 'githubio', 'js', 'main_uncompressed.js');
    const mainPath = path.join(stagedChannelDir, 'githubio', 'js', 'main.js');

    if (!fs.existsSync(mainUncompressedPath)) {
        throw new Error('Missing staged main_uncompressed.js: ' + mainUncompressedPath);
    }

    let source = fs.readFileSync(mainUncompressedPath, 'utf8');
    if (source.indexOf('local_archive_settings') >= 0) {
        return;
    }

    source = replaceOnce(
        source,
        "        webos_ttv_lol_proxy_settings: {\n            values: ['None'],\n            set_values: [''],\n            defaultValue: 1\n        },\n",
        "        webos_ttv_lol_proxy_settings: {\n            values: ['None'],\n            set_values: [''],\n            defaultValue: 1\n        },\n        local_archive_settings: {\n            values: ['Open'],\n            defaultValue: 1\n        },\n",
        'local archive setting value'
    );

    source = replaceOnce(
        source,
        "        div += Settings_Content('preview_settings', [STR_ENTER_TO_OPEN], STR_SIDE_PANEL_PLAYER, null);\n        div += Settings_Content('vod_seek', [STR_ENTER_TO_OPEN], STR_VOD_SEEK, null);\n        div += Settings_Content('playerend_opt', [STR_ENTER_TO_OPEN], STR_END_DIALOG_OPT, null);\n",
        "        div += Settings_Content('preview_settings', [STR_ENTER_TO_OPEN], STR_SIDE_PANEL_PLAYER, null);\n        div += Settings_Content('vod_seek', [STR_ENTER_TO_OPEN], STR_VOD_SEEK, null);\n        div += Settings_Content(\n            'local_archive_settings',\n            [STR_ENTER_TO_OPEN],\n            'Local VOD archive endpoint',\n            'LAN archiver URL used to auto-match and override Twitch VOD playback.'\n        );\n        div += Settings_Content('playerend_opt', [STR_ENTER_TO_OPEN], STR_END_DIALOG_OPT, null);\n",
        'local archive setting row'
    );

    source = replaceOnce(
        source,
        "function Settings_check_min_seek() {\n",
        "function Settings_GetLocalArchiveEndpoint() {\n    return Main_getItemString('sttv_webos_local_archive_endpoint', '');\n}\n\nfunction Settings_LocalArchiveEndpointPrompt() {\n    var currentValue = Settings_GetLocalArchiveEndpoint();\n    var nextValue = window.prompt('Local VOD archive endpoint', currentValue || 'http://192.168.1.50:8080');\n    if (nextValue === null) return;\n    nextValue = String(nextValue || '').replace(/[\\r\\n]+/g, '').trim().replace(/\\/+$/, '');\n    Main_setItem('sttv_webos_local_archive_endpoint', nextValue);\n    Main_setItem('localArchiveEndpoint', nextValue);\n    OSInterface_showToast(nextValue ? 'Local VOD archive endpoint saved' : 'Local VOD archive disabled');\n}\n\nfunction Settings_check_min_seek() {\n",
        'local archive prompt helper anchor'
    );

    source = replaceOnce(
        source,
        "        else if (Main_A_includes_B(Settings_value_keys[Settings_cursorY], 'webos_ttv_lol_proxy_settings')) Settings_DialogShowWebOsTtvLolProxy(click);\n        else if (Main_A_includes_B(Settings_value_keys[Settings_cursorY], 'proxy_settings')) Settings_DialogShowProxy(click);\n",
        "        else if (Main_A_includes_B(Settings_value_keys[Settings_cursorY], 'webos_ttv_lol_proxy_settings')) Settings_DialogShowWebOsTtvLolProxy(click);\n        else if (Main_A_includes_B(Settings_value_keys[Settings_cursorY], 'local_archive_settings')) Settings_LocalArchiveEndpointPrompt();\n        else if (Main_A_includes_B(Settings_value_keys[Settings_cursorY], 'proxy_settings')) Settings_DialogShowProxy(click);\n",
        'local archive enter handler'
    );

    fs.writeFileSync(mainUncompressedPath, source);

    const minified = UglifyJS.minify(source, {
        compress: {arrows: false},
        mangle: {toplevel: true, eval: true}
    });
    if (minified.error) {
        throw minified.error;
    }
    fs.writeFileSync(mainPath, minified.code + '\n');
}

function adaptBridgeForChannel(stagedBridgePath, channel) {
    if (channel !== 'dev') {
        return;
    }

    let bridge = fs.readFileSync(stagedBridgePath, 'utf8');
    bridge = replaceRequired(
        bridge,
        /var\s+FORK_RELEASE_URL\s*=\s*FORK_BASE_URL\s*\+\s*'\/release\/index\.html';/,
        "var FORK_RELEASE_URL = FORK_BASE_URL + '/dev/index.html';",
        'FORK_RELEASE_URL'
    );
    bridge = replaceRequired(
        bridge,
        /var\s+FORK_VERSION_URL\s*=\s*FORK_BASE_URL\s*\+\s*'\/release\/githubio\/version\/version\.json';/,
        "var FORK_VERSION_URL = FORK_BASE_URL + '/dev/githubio/version/version.json';",
        'FORK_VERSION_URL'
    );
    bridge = replaceRequired(
        bridge,
        /var\s+markers\s*=\s*\['\/release\/',\s*'\/hosted\/',\s*'\/webos\/app\/'\];/,
        "var markers = ['/dev/', '/hosted/', '/webos/app/'];",
        'normalizeReloadUrl markers'
    );
    fs.writeFileSync(stagedBridgePath, bridge);
}

function buildArtifact(outputRoot, channel) {
    const stagedChannelDir = path.join(outputRoot, channel);
    const stagedBridgePath = path.join(stagedChannelDir, 'githubio', 'js', 'webosCompatBridge.js');
    const stagedIndexPath = path.join(stagedChannelDir, 'index.html');

    fs.rmSync(stagedChannelDir, {recursive: true, force: true});
    fs.mkdirSync(outputRoot, {recursive: true});
    fs.cpSync(releaseSourceDir, stagedChannelDir, {recursive: true});
    fs.mkdirSync(path.dirname(stagedBridgePath), {recursive: true});
    fs.copyFileSync(bridgeSource, stagedBridgePath);
    adaptBridgeForChannel(stagedBridgePath, channel);
    patchWebosMainScript(stagedChannelDir);

    let html = fs.readFileSync(stagedIndexPath, 'utf8');
    html = html.replace(anyBridgeTagRegex, '');

    if (!mainScriptRegex.test(html)) {
        throw new Error('Cannot find main.js script tag in staged ' + channel + '/index.html');
    }
    html = html.replace(mainScriptRegex, bridgeTag + '$&');
    fs.writeFileSync(stagedIndexPath, html);

    return {
        channel,
        stagedChannelDir,
        stagedBridgePath,
        stagedIndexPath
    };
}

function validateArtifact(paths) {
    if (!fs.existsSync(paths.stagedBridgePath)) {
        throw new Error('Staged bridge file missing: ' + paths.stagedBridgePath);
    }

    const html = fs.readFileSync(paths.stagedIndexPath, 'utf8');
    const bridgeMatches = html.match(bridgeTagGlobalRegex) || [];
    const bridgePosition = html.search(bridgeTagSingleRegex);
    const mainPosition = html.search(mainScriptRegex);

    if (bridgeMatches.length !== 1) {
        throw new Error('Expected exactly one staged bridge script tag, found ' + bridgeMatches.length);
    }
    if (mainPosition < 0) {
        throw new Error('Cannot find staged main.js script tag');
    }
    if (bridgePosition < 0 || bridgePosition >= mainPosition) {
        throw new Error('Staged bridge script tag is missing or not before main.js');
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    ensureSourceInputs();
    const staged = buildArtifact(args.outputRoot, args.channel);
    validateArtifact(staged);
    console.log('Prepared hosted release artifact at: ' + path.join(args.outputRoot, staged.channel));
}

main();

