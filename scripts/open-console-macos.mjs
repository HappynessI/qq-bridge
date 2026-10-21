import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.join(os.homedir(), 'Library', 'Application Support', 'qq-bridge');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const token = config.consoleToken || fs.readFileSync(path.join(root, 'state', 'console-token'), 'utf8').trim();
const url = new URL(`http://127.0.0.1:${config.consolePort || 3100}`);
url.searchParams.set('token', token);
execFileSync('/usr/bin/open', [url.href]);
