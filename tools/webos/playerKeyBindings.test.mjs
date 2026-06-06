import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('app/specific/PlayEtc.js', 'utf8');

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
