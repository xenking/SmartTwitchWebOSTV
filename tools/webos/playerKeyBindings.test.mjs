import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = fs.readFileSync('app/specific/PlayEtc.js', 'utf8');
const playVodSource = fs.readFileSync('app/specific/PlayVod.js', 'utf8');

function functionBody(fileSource, name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(fileSource);
  assert.ok(match, `${name} exists`);
  const start = match.index;
  let depth = 0;
  let bodyStart = -1;
  for (let i = start; i < fileSource.length; i++) {
    if (fileSource[i] === '{') {
      if (bodyStart === -1) bodyStart = i + 1;
      depth++;
    } else if (fileSource[i] === '}') {
      depth--;
      if (bodyStart !== -1 && depth === 0) return fileSource.slice(bodyStart, i);
    }
  }
  throw new Error(`${name} body not found`);
}

assert.match(source, /function Play_ChannelRockerSwitchLive\(direction\)/);
assert.match(source, /Main_OpenLiveStream\(nextData, nextPos, UserLiveFeed_side_ids, Sidepannel_handleKeyDown, false, 'Side_Panel'\)/);

const pageUpBlock = source.match(/case KEY_PG_UP:\n([\s\S]*?)break;/);
assert.ok(pageUpBlock, 'KEY_PG_UP block exists');
assert.match(pageUpBlock[1], /Play_ChannelRockerSwitchLive\(-1\);/);
assert.doesNotMatch(pageUpBlock[1], /Play_KeyChatPosChage|UserLiveFeed_KeyUpDown|UserLiveFeed_ShowFeed/);

const pageDownBlock = source.match(/case KEY_PG_DOWN:\n([\s\S]*?)break;/);
assert.ok(pageDownBlock, 'KEY_PG_DOWN block exists');
assert.match(pageDownBlock[1], /Play_ChannelRockerSwitchLive\(1\);/);
assert.doesNotMatch(pageDownBlock[1], /Play_KeyChatSizeChage|UserLiveFeed_KeyUpDown|UserLiveFeed_ShowFeed/);

{
  const context = {
    captured: '',
    PlayVod_addToJump: 0,
    PlayVod_PanelY: 0,
    PlayVod_isOn: false,
    PlayVod_jumpStepsIncreaseLock: false,
    PlayVod_last_multiplier: '',
    Play_BottonIcons_Progress_Steps: { style: {} },
    STR_JUMPING_STEP: 'Jump step ',
    STR_BR: '<br>',
    STR_LOCKED: 'locked',
    STR_UP_LOCKED: 'up locked',
    STR_SECONDS: ' seconds',
    Settings_value: {
      vod_seek_min: {
        values: ['5 seconds', '10 seconds'],
      },
    },
    Main_innerHTMLWithEle(_element, value) {},
  };
  context.Main_innerHTMLWithEle = (_element, value) => {
    context.captured = value;
  };
  vm.createContext(context);
  if (playVodSource.includes('function PlayVod_JumpStepLabel')) {
    vm.runInContext(`function PlayVod_JumpStepLabel(pos) {${functionBody(playVodSource, 'PlayVod_JumpStepLabel')}}`, context);
  }
  vm.runInContext(`function PlayVod_jumpSteps(pos, signal) {${functionBody(playVodSource, 'PlayVod_jumpSteps')}}`, context);

  context.PlayVod_jumpSteps(1);

  assert.equal(context.captured, 'Jump step 10 seconds', 'live archive seek label uses configured jump step, not hardcoded one second');
}
