'use strict';
/* Run generator and actual HTTP-handler checks without launching a server. */
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
for (const args of [['scripts/build_pwa.py', '--check'], ['scripts/test_pwa_server.py']]) {
  const result = spawnSync('python3', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  assert.equal(result.status, 0, args.join(' ') + ' must pass');
}
console.log('PASS PWA package: current asset version and real HTTP handler routing/headers, without sockets.');
