import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { modelImageContent } from '../src/model-images.js';
import { onebotRequest } from '../src/onebot-request.js';
import { normalizeStickerEntry } from '../src/sticker-lib.js';

// 只读取真实消息和收藏库，不生成假图片，也不发送或收藏表情。
const { values } = parseArgs({ options: {
  root: { type: 'string', default: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') },
  key: { type: 'string' }, message: { type: 'string' }, sticker: { type: 'string' },
} });
if (!values.key || !values.message) throw new Error('用法：node scripts/check-media-live.mjs --root 运行目录 --key group:群号 --message 消息ID [--sticker 收藏ID]');
const config = JSON.parse(fs.readFileSync(path.join(values.root, 'config.json'), 'utf8'));
const state = JSON.parse(fs.readFileSync(path.join(values.root, 'state/social-v2.json'), 'utf8'));
const token = state.conversations?.[values.key]?.agentToken;
assert.ok(token, '目标会话没有可用令牌');
const consoleToken = config.consoleToken || fs.readFileSync(path.join(values.root, 'state/console-token'), 'utf8').trim();
const query = new URLSearchParams({ key: values.key, messageId: values.message });
const response = await fetch(`http://127.0.0.1:${config.consolePort || 3100}/api/images/message?${query}`, {
  headers: { 'x-console-token': consoleToken, 'x-agent-token': token }, signal: AbortSignal.timeout(180000),
});
assert.equal(response.status, 200, '读取真实消息图片失败');
const original = await response.json();
assert.ok(original.images?.length, '消息未返回图片');
let expectedImages = 0;
for (const image of original.images) {
  assert.ok(image.data, '真实图片下载失败');
  const preview = await modelImageContent(image);
  const images = preview.filter(item => item.type === 'image');
  assert.ok(images.length >= 1 && images.length <= 3);
  if (['image/gif', 'image/webp'].includes(image.mimeType)) assert.ok(images.every(item => item.mimeType === 'image/png'));
  expectedImages += images.length;
}
const client = new Client({ name: 'qq-bridge-media-check', version: '1.0.0' });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(values.root, 'src/mcp-snowluma-safe.js')], cwd: values.root, stderr: 'pipe' }));
  const result = await client.callTool({ name: 'qq_get_message_images', arguments: { key: values.key, token, messageId: values.message } }, undefined, { timeout: 180000 });
  assert.ok(!result.isError, 'MCP 取图失败');
  assert.equal(result.content.filter(item => item.type === 'image').length, expectedImages);
  assert.ok(result.content.filter(item => item.type === 'image').every(item => ['image/png', 'image/jpeg'].includes(item.mimeType)));
  console.log(`PASS 真实消息 → 桥接 → MCP：${expectedImages} 张静态预览`);
  if (values.sticker) {
    const favorites = await onebotRequest(config, 'fetch_custom_face_detail', { count: 500 });
    assert.ok(Array.isArray(favorites));
    const entry = favorites.map(normalizeStickerEntry).find(item => item?.id === values.sticker);
    assert.ok(entry, 'QQ 收藏列表中没有指定表情');
    const version = await onebotRequest(config, 'get_version_info');
    if (/napcat/i.test(version.app_name)) assert.ok(/^\d+$/.test(entry.emojiId), 'NapCat 原生 emoId 未保留');
    const sticker = await client.callTool({ name: 'qq_get_sticker_image', arguments: { key: values.key, token, stickerId: values.sticker } }, undefined, { timeout: 180000 });
    assert.ok(!sticker.isError && sticker.content.some(item => item.type === 'image'), '收藏表情预览失败');
    console.log('PASS QQ 收藏回读、原生资源字段及 MCP 表情预览');
  }
} finally {
  await client.close();
}
