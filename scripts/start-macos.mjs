import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { NodeApiClient, unwrap } from '../src/dsh-client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
if (process.platform !== 'darwin') throw new Error('此启动器仅适用于 macOS');
const configPath = path.join(root, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const ports = execFileSync('/usr/sbin/lsof', ['-nP', '-a', '-c', 'DeepSeek', '-iTCP', '-sTCP:LISTEN', '-Fpcn'], { encoding: 'utf8' });
const urls = [...new Set([...ports.matchAll(/^n127\.0\.0\.1:(\d+)$/gm)].map(match => `http://127.0.0.1:${match[1]}`))];
const available = [];
for (const url of urls) {
  try {
    const api = new NodeApiClient(url, 5000);
    unwrap(await api.agentPresets.list({}), 'DSH 探测');
    available.push(url);
  } catch (error) {
    console.error(`[macOS] ${url} 未通过 DSH 探测：${error.message}`);
  }
}
if (available.length !== 1) throw new Error(`需要一个正在运行的 DSH 桌面服务，实际找到 ${available.length} 个`);
const baseUrl = available[0];
if (config.dsh.baseUrl !== baseUrl) {
  config.dsh.baseUrl = baseUrl;
  fs.writeFileSync(`${configPath}.new`, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(`${configPath}.new`, configPath);
}
console.log(`[macOS] DSH 已连接 ${baseUrl}`);
const child = spawn(process.execPath, ['src/bridge.js'], { cwd: root, stdio: 'inherit' });
let stopping = false;
let checking = false;
let failures = 0;
let forceStop;
function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(monitor);
  child.kill('SIGTERM');
  forceStop = setTimeout(() => child.kill('SIGKILL'), 10000);
}
const api = new NodeApiClient(baseUrl, 5000);
const monitor = setInterval(async () => {
  if (checking || stopping) return;
  checking = true;
  try {
    unwrap(await api.agentPresets.list({}), 'DSH 健康检查');
    failures = 0;
  } catch (error) {
    console.error(`[macOS] DSH 健康检查失败 ${++failures}/3：${error.message}`);
    if (failures >= 3) stop();
  } finally {
    checking = false;
  }
}, 15000);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('error', error => { console.error(error); process.exitCode = 1; clearInterval(monitor); });
child.on('exit', code => { clearInterval(monitor); clearTimeout(forceStop); process.exitCode = failures >= 3 ? 1 : (code ?? 1); });
