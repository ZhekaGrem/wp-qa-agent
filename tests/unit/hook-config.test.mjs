import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const configs = {
  project: JSON.parse(fs.readFileSync('.claude/settings.json', 'utf8')),
  plugin: JSON.parse(fs.readFileSync('hooks/hooks.json', 'utf8')),
};

const guarded = [
  'mcp__playwright__browser_click',
  'mcp__plugin_playwright_playwright__browser_click',
  'mcp__chrome-devtools__fill',
  'mcp__plugin_chrome-devtools-mcp_chrome-devtools__click',
];
const unguarded = ['Bash', 'Read', 'mcp__claude_ai_Gmail__authenticate'];

for (const [name, config] of Object.entries(configs)) {
  test(`${name} hook matcher covers browser MCP servers however they are installed`, () => {
    const re = new RegExp(`^(?:${config.hooks.PreToolUse[0].matcher})$`);
    for (const tool of guarded) assert.ok(re.test(tool), `${tool} should be guarded`);
    for (const tool of unguarded) assert.ok(!re.test(tool), `${tool} should not be guarded`);
  });
}

const decide = (tool) => {
  const out = spawnSync('node', ['scripts/wp-admin-write-guard.mjs'], { input: JSON.stringify({ tool_name: tool }), encoding: 'utf8' });
  return JSON.parse(out.stdout).hookSpecificOutput.permissionDecision;
};

test('guard script asks for writes and unknown actions, allows read-only ones', () => {
  assert.equal(decide('mcp__playwright__browser_click'), 'ask');
  assert.equal(decide('mcp__playwright__browser_run_code'), 'ask');
  assert.equal(decide('mcp__playwright__browser_navigate'), 'allow');
  assert.equal(decide('mcp__chrome-devtools__take_screenshot'), 'allow');
});
