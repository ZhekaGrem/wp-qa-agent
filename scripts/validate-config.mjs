import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Load .env.qa if exists
const envFile = process.argv[2] || '.env.qa';
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...val] = trimmed.split('=');
      process.env[key.trim()] = val.join('=').trim();
    }
  }
} else {
  console.warn(`WARNING: Missing ${envFile}. Copy config/wordpress-qa.example.env first.`);
}

console.log('=== WordPress QA Setup & Toolchain Validation ===');

function checkCmd(cmd, label) {
  try {
    const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    console.log(`✓ ${label}: ${out.split('\n')[0]}`);
    return true;
  } catch {
    console.log(`✗ ${label}: Not found or failed`);
    return false;
  }
}

checkCmd('node --version', 'Node.js');
checkCmd('npm --version', 'npm');
checkCmd('npx playwright --version', 'Playwright');
checkCmd('php --version', 'PHP');
checkCmd('composer --version', 'Composer');
checkCmd('wp --version', 'WP-CLI');

console.log('\n=== Project Files & Directories ===');
const hasSeed = fs.existsSync(path.join(process.cwd(), 'tests', 'seed.spec.ts'));
console.log(hasSeed ? '✓ Seed test: found (tests/seed.spec.ts)' : '✗ Seed test: missing (tests/seed.spec.ts)');

// Ensure qa/ directory structure
const qaDir = path.join(process.cwd(), 'qa');
const runsDir = path.join(qaDir, 'runs');
if (!fs.existsSync(runsDir)) {
  fs.mkdirSync(runsDir, { recursive: true });
}

const catalogFile = path.join(qaDir, 'test-catalog.json');
if (!fs.existsSync(catalogFile)) {
  fs.writeFileSync(catalogFile, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), tests: [] }, null, 2));
  console.log('✓ Created empty qa/test-catalog.json');
}

const findingsFile = path.join(qaDir, 'findings.json');
if (!fs.existsSync(findingsFile)) {
  fs.writeFileSync(findingsFile, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), findings: [] }, null, 2));
  console.log('✓ Created empty qa/findings.json');
}

console.log('\n✓ Setup validation complete.');
