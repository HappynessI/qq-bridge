import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { onebotRequest } from '../src/onebot-request.js';
import { NodeApiClient, unwrap } from '../src/dsh-client.js';

const root = path.join(os.homedir(), 'Library', 'Application Support', 'qq-bridge');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const token = config.consoleToken || fs.readFileSync(path.join(root, 'state', 'console-token'), 'utf8').trim();
const base = `http://127.0.0.1:${config.consolePort || 3100}`;
const headers = { 'x-console-token': token, 'content-type': 'application/json' };
const status = await onebotRequest(config, 'get_status');
assert.equal(status.online, true);
const login = await onebotRequest(config, 'get_login_info');
const groups = await onebotRequest(config, 'get_group_list');
for (const id of config.allow.groups) assert.ok(groups.some(group => group.group_id === id), `QQ 尚未加入白名单群 ${id}`);
await assert.rejects(onebotRequest(config, 'qq_bridge_invalid_action'), /失败/);
console.log(`NapCat 在线：${login.nickname}；白名单群均已加入；错误响应会明确抛出`);
const api = new NodeApiClient(config.dsh.baseUrl, 10000);
const presets = unwrap(await api.agentPresets.list({}), 'DSH presets').presets;
assert.ok(presets.some(preset => preset.id === 'qq-chat-v2' && !preset.broken));
console.log('DSH 认证与 QQ 预设正常');
assert.equal((await fetch(`${base}/api/status`)).status, 401);
const response = await fetch(`${base}/api/status`, { headers });
assert.equal(response.status, 200);
const bridge = await response.json();
assert.equal(bridge.dshReady, true);
assert.equal(bridge.mode, 'reserved2');
assert.ok(bridge.role);
for (const id of config.deny.groups) {
  const refused = await fetch(`${base}/api/socialV2/wake`, { method: 'POST', headers, body: JSON.stringify({ key: `group:${id}` }) });
  assert.equal(refused.status, 403);
}
console.log(`控制台认证、群白名单与角色正常：${bridge.role}`);
const client = new Client({ name: 'macos-live-check', version: '1.0.0' });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src/mcp-snowluma-safe.js')], cwd: root, stderr: 'pipe' }));
  const result = await client.callTool({ name: 'qq_status', arguments: {} });
  assert.ok(!result.isError, 'QQ MCP 状态调用失败');
  assert.equal(JSON.parse(result.content.find(item => item.type === 'text').text).online, true);
  console.log('MCP → NapCat 真实调用正常');
} finally {
  await client.close();
}
