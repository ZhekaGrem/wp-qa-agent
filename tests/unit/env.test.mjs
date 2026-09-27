import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv, loadEnvFile } from '../../lib/env.mjs';

test('parseEnv reads keys, skips comments and blanks, strips quotes, keeps = in values, handles CRLF', () => {
  const env = parseEnv('# comment\r\nA=1\r\nB = "two words"\nC=x=y\n\nBROKEN\n');
  assert.deepEqual(env, { A: '1', B: 'two words', C: 'x=y' });
});

test('loadEnvFile sets missing keys but never overrides existing ones', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpqa-env-'));
  const file = path.join(dir, '.env.qa');
  fs.writeFileSync(file, 'QA_BASE_URL=https://from-file.test\nQA_ONLY_IN_FILE=yes\n');
  const target = { QA_BASE_URL: 'https://from-shell.test' };
  const result = loadEnvFile(file, target);
  assert.deepEqual(result, { loaded: true, keys: ['QA_BASE_URL', 'QA_ONLY_IN_FILE'] });
  assert.equal(target.QA_BASE_URL, 'https://from-shell.test');
  assert.equal(target.QA_ONLY_IN_FILE, 'yes');
});

test('loadEnvFile reports a missing file without throwing', () => {
  assert.deepEqual(loadEnvFile(path.join(os.tmpdir(), 'does-not-exist.env'), {}), { loaded: false, keys: [] });
});
