import readline from 'readline';
import fs from 'fs';

/**
 * Safety Deletion Guard
 * Intercepts any deletion operation (files, DB records, fixtures, WP options)
 * and requires explicit user confirmation before proceeding.
 */

// Danger command patterns that trigger mandatory confirmation
export const DANGEROUS_PATTERNS = [
  /\brm\b/i,
  /\brdir\b/i,
  /\bdel\b/i,
  /\bunlink\b/i,
  /wp\s+db\s+(reset|clean|drop)/i,
  /wp\s+(post|user|option|term|site|plugin|theme)\s+delete/i,
  /DROP\s+TABLE/i,
  /DELETE\s+FROM/i,
  /TRUNCATE/i
];

/**
 * Checks if a command line string contains dangerous deletion operations.
 */
export function isDangerousCommand(commandStr) {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(commandStr));
}

/**
 * Prompts user for interactive confirmation of deletion in terminal.
 * Returns true if user approves, false if rejected or non-interactive.
 */
export async function confirmDeletion(description) {
  console.warn(`\n========================================`);
  console.warn(` ⚠️ DELETION GUARD WARNING`);
  console.warn(` Target: ${description}`);
  console.warn(` Policy: Deletion requires explicit human confirmation.`);
  console.warn(`========================================\n`);

  // If env QA_ALLOW_DELETION is explicitly set to false or missing in automated CI
  if (process.env.CI && process.env.QA_ALLOW_DELETION !== 'true') {
    console.error(`[DELETION GUARD] BLOCKED: Automated deletion is denied in CI without QA_ALLOW_DELETION=true.`);
    return false;
  }

  // If running interactively, ask the user
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(`❓ Do you confirm deleting "${description}"? (y/N): `, (answer) => {
        rl.close();
        const approved = answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
        if (approved) {
          console.log(`[DELETION GUARD] Approved by user.`);
        } else {
          console.warn(`[DELETION GUARD] BLOCKED: Deletion cancelled by user.`);
        }
        resolve(approved);
      });
    });
  }

  // Default block for non-interactive execution unless explicitly allowed
  const allowed = process.env.QA_ALLOW_DELETION === 'true';
  if (!allowed) {
    console.warn(`[DELETION GUARD] BLOCKED: QA_ALLOW_DELETION is not enabled in .env.qa.`);
  }
  return allowed;
}

/**
 * Safely removes a file or directory with Deletion Guard protection.
 */
export async function safeRemove(targetPath, description = targetPath) {
  if (!fs.existsSync(targetPath)) {
    return true;
  }

  const approved = await confirmDeletion(`File/Folder: ${description}`);
  if (!approved) {
    return false;
  }

  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    console.log(`✓ Deleted: ${targetPath}`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to delete ${targetPath}:`, err.message);
    return false;
  }
}
