import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

if (process.platform !== 'darwin') throw new Error('此服务仅适用于 macOS');
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(os.homedir(), 'Library', 'Application Support', 'qq-bridge');
const label = 'local.qq-bridge.xiaojing';
const domain = `gui/${process.getuid()}`;
const target = `${domain}/${label}`;
const plist = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
const action = process.argv[2];
if (!['install', 'start', 'stop', 'status'].includes(action)) throw new Error('用法：node scripts/macos-service.mjs install|start|stop|status');
if (action === 'install') {
  if (spawnSync('/bin/launchctl', ['print', target]).status === 0) {
    execFileSync('/bin/launchctl', ['bootout', target]);
  }
  if (sourceRoot !== root) {
    const preserve = new Set(['state', 'config.json', 'roles'].filter(name => fs.existsSync(path.join(root, name))));
    fs.cpSync(sourceRoot, root, {
      recursive: true,
      filter: file => {
        const relative = path.relative(sourceRoot, file);
        const first = relative.split(path.sep)[0];
        if (['.git', 'work'].includes(first)) return false;
        if (preserve.has(first)) return false;
        return true;
      },
    });
  }
  execFileSync(process.execPath, ['scripts/setup-dsh.mjs', 'desktop'], { cwd: root, stdio: 'inherit' });
  const log = path.join(root, 'state', 'macos-service.log');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.closeSync(fs.openSync(log, 'a', 0o600));
  fs.chmodSync(log, 0o600);
  fs.mkdirSync(path.dirname(plist), { recursive: true });
  const data = {
    Label: label,
    ProgramArguments: [process.execPath, path.join(root, 'scripts', 'start-macos.mjs')],
    WorkingDirectory: root,
    RunAtLoad: true,
    KeepAlive: true,
    ThrottleInterval: 30,
    StandardOutPath: log,
    StandardErrorPath: log,
    EnvironmentVariables: { PATH: `${path.dirname(process.execPath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin` },
  };
  const xml = execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '-'], { input: JSON.stringify(data) });
  fs.writeFileSync(plist, xml, { mode: 0o600 });
  console.log(`已安装 ${label}`);
}
if (action === 'install' || action === 'start') {
  const current = spawnSync('/bin/launchctl', ['print', target]);
  if (current.status !== 0) execFileSync('/bin/launchctl', ['bootstrap', domain, plist]);
  console.log('小鲸后台服务已启动');
} else if (action === 'stop') {
  execFileSync('/bin/launchctl', ['bootout', target]);
  console.log('小鲸后台服务已停止');
} else {
  const result = spawnSync('/bin/launchctl', ['print', target], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('小鲸后台服务未加载');
  console.log(result.stdout.split('\n').filter(line => /^\s*(state|pid|runs|last exit code) =/.test(line)).join('\n'));
}
