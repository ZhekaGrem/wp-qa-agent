import fs from 'fs';
import path from 'path';

const gitHooksDir = path.join(process.cwd(), '.git', 'hooks');

if (!fs.existsSync(gitHooksDir)) {
  console.log('Not a git repository or .git/hooks directory missing. Skipping Git hook installation.');
  process.exit(0);
}

// 1. Pre-commit hook: prevents committing deletion of persistent tracking files
const preCommitHook = `#!/bin/sh
# WordPress QA Agent - Pre-commit Deletion Protection Hook

# Check if persistent tracking files or core specs are deleted in this commit
DELETED_PROTECTED=$(git diff --cached --name-only --diff-filter=D | grep -E "^(qa/test-catalog\.json|qa/findings\.json|qa/status\.md|tests/seed\.spec\.ts|AGENTS\.md)$")

if [ -n "$DELETED_PROTECTED" ]; then
  echo ""
  echo "===================================================="
  echo " 🛑 GIT PRE-COMMIT HOOK: DELETION BLOCKED"
  echo " Attempting to commit deletion of protected file(s):"
  echo "$DELETED_PROTECTED"
  echo "===================================================="
  echo "To delete protected QA catalog/finding files, you must stage them"
  echo "and explicitly confirm with QA_ALLOW_DELETION=true."
  echo ""
  exit 1
fi

exit 0
`;

const hookPath = path.join(gitHooksDir, 'pre-commit');
fs.writeFileSync(hookPath, preCommitHook, { mode: 0o755 });
console.log('✓ Installed Git pre-commit deletion protection hook into .git/hooks/pre-commit');
