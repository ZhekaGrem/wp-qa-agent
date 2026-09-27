import readline from 'readline';

/**
 * Safety Write Guard
 * Intercepts any operation that would change data on the target site
 * (posts, options, users, plugins, themes, checkout/payment actions, form
 * submissions that mutate state) and requires explicit human confirmation
 * before proceeding. Read-only browsing, screenshots, and GET requests are
 * never blocked.
 */

// Mutation command patterns that trigger mandatory confirmation
export const WRITE_PATTERNS = [
  /wp\s+(post|page|user|option|term|comment|site)\s+(create|update|generate|meta\s+(add|update|delete))/i,
  /wp\s+plugin\s+(install|activate|deactivate|update|uninstall)/i,
  /wp\s+theme\s+(install|activate|update|delete)/i,
  /wp\s+core\s+update/i,
  /wp\s+option\s+(set|update)/i,
  /curl\s+.*(-X\s*(POST|PUT|PATCH|DELETE))/i,
  /INSERT\s+INTO/i,
  /UPDATE\s+.*\s+SET/i
];

/**
 * Checks if a command line string would mutate site data.
 */
export function isWriteCommand(commandStr) {
  return WRITE_PATTERNS.some((pattern) => pattern.test(commandStr));
}

/**
 * Prompts user for interactive confirmation before writing/mutating data
 * on the target site. Returns true if approved, false if rejected or
 * non-interactive without explicit opt-in.
 */
export async function confirmWrite(description) {
  console.warn(`\n========================================`);
  console.warn(` ⚠️ WRITE GUARD WARNING`);
  console.warn(` Action: ${description}`);
  console.warn(` Policy: Changing data on the site requires explicit human confirmation.`);
  console.warn(`========================================\n`);

  // Automated / CI execution: never silently mutate data
  if (process.env.CI && process.env.QA_ALLOW_WRITES !== 'true') {
    console.error(`[WRITE GUARD] BLOCKED: Automated writes are denied in CI without QA_ALLOW_WRITES=true.`);
    return false;
  }

  // Interactive execution: always ask, even if QA_ALLOW_WRITES=true
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(`❓ Do you confirm this change on the site: "${description}"? (y/N): `, (answer) => {
        rl.close();
        const approved = answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
        if (approved) {
          console.log(`[WRITE GUARD] Approved by user.`);
        } else {
          console.warn(`[WRITE GUARD] BLOCKED: Change cancelled by user.`);
        }
        resolve(approved);
      });
    });
  }

  // Default block for non-interactive execution unless explicitly allowed
  const allowed = process.env.QA_ALLOW_WRITES === 'true';
  if (!allowed) {
    console.warn(`[WRITE GUARD] BLOCKED: QA_ALLOW_WRITES is not enabled in .env.qa.`);
  }
  return allowed;
}
