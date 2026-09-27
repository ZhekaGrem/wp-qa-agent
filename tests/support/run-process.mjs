import { spawn } from 'node:child_process';

// Async on purpose: a synchronous spawn would block the event loop and
// deadlock against a fake server running in the same test process.
export function runProcess(command, args, { env = {}, cwd } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, cwd, shell: process.platform === 'win32' });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('close', (status) => resolve({ status, output }));
  });
}
