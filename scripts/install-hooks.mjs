import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const gitDir = path.join(process.cwd(), '.git');
const trackedHooksDir = path.join(process.cwd(), '.githooks');

if (!fs.existsSync(gitDir)) {
  console.log('Not a git repository. Skipping Git hook installation.');
  process.exit(0);
}

if (!fs.existsSync(trackedHooksDir)) {
  console.error(`✗ Missing ${trackedHooksDir}. This directory is version-controlled and ships with the repo — do not delete it.`);
  process.exit(1);
}

// Make the tracked hook scripts executable (no-op on Windows, required on macOS/Linux/CI).
for (const hookFile of fs.readdirSync(trackedHooksDir)) {
  try {
    fs.chmodSync(path.join(trackedHooksDir, hookFile), 0o755);
  } catch {
    // chmod is best-effort; Git for Windows runs hooks via its bundled sh regardless.
  }
}

// Point Git at the version-controlled hooks directory instead of the
// untracked, per-clone .git/hooks/ folder. This is a one-time local config
// (run automatically by `npm install` via the `prepare` script), so every
// clone/CI checkout gets the same Deletion Guard hook without manual steps.
execSync('git config core.hooksPath .githooks', { stdio: 'inherit' });
console.log('✓ Configured Git to use version-controlled hooks in .githooks/ (core.hooksPath)');
