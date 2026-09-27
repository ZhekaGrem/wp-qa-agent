import { createFakeWp } from './fake-wp.mjs';

const port = Number(process.argv[2] || 9555);
const wp = createFakeWp({ locale: process.argv[3] || 'uk' });
const url = await wp.start(port);
console.log(`Fake WordPress at ${url} — login qa-admin / secret. Ctrl+C to stop.`);
