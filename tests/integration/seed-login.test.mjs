import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeWp } from '../support/fake-wp.mjs';
import { runProcess } from '../support/run-process.mjs';

for (const locale of ['en', 'uk']) {
  test(`seed test logs in on a ${locale} login page`, async (t) => {
    const wp = createFakeWp({ locale });
    const url = await wp.start();
    t.after(() => wp.stop());
    const { status, output } = await runProcess('npx', ['playwright', 'test', 'tests/seed.spec.ts', '--project=chromium-desktop', '--reporter=line'], {
      env: { QA_BASE_URL: url, QA_ADMIN_USER: 'qa-admin', QA_ADMIN_PASSWORD: 'secret' },
    });
    assert.equal(status, 0, output);
    assert.ok(wp.hits.includes('POST /wp-login.php'), 'login form was submitted');
  });
}
