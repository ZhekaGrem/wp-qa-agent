import { once } from 'node:events';

/**
 * PreToolUse hook: gates MCP browser-automation tool calls (Playwright MCP,
 * Chrome DevTools MCP) that drive the agent through wp-admin.
 *
 * Read-only actions (screenshots, snapshots, navigation, console/network
 * inspection) are explicitly allowed so they never prompt. Anything that can
 * change data on the site (click, type, fill, drag, select, upload, dialog
 * handling, script evaluation) is routed to "ask" so a human must approve it
 * before it runs - the agent never saves/changes site data on its own.
 * Unrecognized/new MCP tool actions default to "ask" (fail-safe).
 *
 * See AGENTS.md "Write / Mutation Protection Policy".
 */

const WRITE_ACTIONS = [
  'click', 'type', 'fill', 'fill_form', 'press_key', 'drag',
  'select_option', 'upload_file', 'file_upload', 'handle_dialog',
  'evaluate_script', 'evaluate'
];

const READ_ACTIONS = [
  'navigate', 'navigate_back', 'navigate_page_history', 'navigate_page',
  'take_screenshot', 'screenshot', 'snapshot', 'take_snapshot', 'wait_for',
  'console_messages', 'list_console_messages', 'network_requests',
  'list_network_requests', 'get_network_request', 'list_pages', 'tabs',
  'resize', 'resize_page', 'hover', 'close', 'close_page', 'new_page',
  'select_page', 'install'
];

function matches(actionWords, toolName) {
  return actionWords.some((kw) => new RegExp(`(^|_)${kw}($|_)`).test(toolName));
}

function decide(toolName) {
  if (matches(WRITE_ACTIONS, toolName)) {
    return {
      permissionDecision: 'ask',
      permissionDecisionReason: `Write Guard: "${toolName}" can change data on the WordPress site. Human confirmation required before it runs (AGENTS.md Write / Mutation Protection Policy).`
    };
  }
  if (matches(READ_ACTIONS, toolName)) {
    return {
      permissionDecision: 'allow',
      permissionDecisionReason: `Write Guard: "${toolName}" is read-only browser activity, not gated.`
    };
  }
  return {
    permissionDecision: 'ask',
    permissionDecisionReason: `Write Guard: "${toolName}" is not a recognized read-only action. Defaulting to human confirmation (fail-safe).`
  };
}

async function main() {
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  await once(process.stdin, 'end');

  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    input = {};
  }

  const toolName = input.tool_name || '';
  const { permissionDecision, permissionDecisionReason } = decide(toolName);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision,
      permissionDecisionReason
    }
  }));
}

main();
