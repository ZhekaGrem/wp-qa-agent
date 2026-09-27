import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../support/run-process.mjs';

// Works in a throwaway repository under the OS temp dir; no project file is touched.
async function repoWithProtectedFileStagedForDeletion() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpqa-hook-'));
  const git = (...args) => runProcess('git', args, { cwd: dir });
  await git('init', '-q');
  await git('config', 'user.email', 'qa@example.test');
  await git('config', 'user.name', 'QA');
  fs.mkdirSync(path.join(dir, '.githooks'));
  fs.copyFileSync('.githooks/pre-commit', path.join(dir, '.githooks', 'pre-commit'));
  fs.chmodSync(path.join(dir, '.githooks', 'pre-commit'), 0o755);
  await git('config', 'core.hooksPath', '.githooks');
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'rules\n');
  await git('add', '.');
  await git('commit', '-q', '-m', 'init');
  await git('rm', '-q', 'AGENTS.md');
  return dir;
}

test('deleting a protected file is blocked by default', async () => {
  const dir = await repoWithProtectedFileStagedForDeletion();
  const { status, output } = await runProcess('git', ['commit', '-m', 'remove'], { cwd: dir });
  assert.notEqual(status, 0);
  assert.match(output, /DELETION BLOCKED/);
});

test('QA_ALLOW_DELETION=true lets an intended deletion through', async () => {
  const dir = await repoWithProtectedFileStagedForDeletion();
  const { status, output } = await runProcess('git', ['commit', '-m', 'remove'], { cwd: dir, env: { QA_ALLOW_DELETION: 'true' } });
  assert.equal(status, 0, output);
});
