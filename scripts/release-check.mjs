#!/usr/bin/env node
/**
 * Production release check. Does not print secret values.
 * Exits 1 when a production-readiness requirement is missing.
 *
 * Usage: node scripts/release-check.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER_HOST = 'YOUR_PRODUCTION_BACKEND_DOMAIN';

/** @type {{ name: string, status: 'PASS' | 'BLOCKED' | 'FAIL', detail: string }[]} */
const checks = [];

function record(name, status, detail) {
  checks.push({ name, status, detail });
}

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

// --- Android / EAS structural checks (no secrets) ---
const appConfig = read('frontend/app.config.ts');
const packageMatch = appConfig.match(/package:\s*'([^']+)'/);
const versionMatch = appConfig.match(/version:\s*'([^']+)'/);
const versionCodeMatch = appConfig.match(/versionCode:\s*(\d+)/);
const nameMatch = appConfig.match(/name:\s*'([^']+)'/);

if (nameMatch?.[1] === 'MusicMix') {
  record('app.name', 'PASS', 'MusicMix');
} else {
  record('app.name', 'FAIL', 'Expected MusicMix');
}

if (packageMatch?.[1] === 'com.musicmix.app') {
  record('android.package', 'PASS', 'com.musicmix.app');
} else {
  record('android.package', 'FAIL', 'package missing');
}

if (versionMatch?.[1] === '1.0.0') {
  record('app.version', 'PASS', '1.0.0');
} else {
  record('app.version', 'FAIL', 'version missing');
}

if (versionCodeMatch?.[1] === '1') {
  record('android.versionCode', 'PASS', '1');
} else {
  record('android.versionCode', 'FAIL', 'versionCode missing');
}

const eas = JSON.parse(read('frontend/eas.json'));
const profiles = eas.build ?? {};
if (profiles.development && profiles.preview && profiles.production) {
  record('eas.profiles', 'PASS', 'development, preview, production');
} else {
  record('eas.profiles', 'FAIL', 'missing profile');
}

const productionBuildType = profiles.production?.android?.buildType;
if (productionBuildType === 'app-bundle') {
  record('eas.production.buildType', 'PASS', 'app-bundle');
} else {
  record('eas.production.buildType', 'FAIL', String(productionBuildType ?? 'missing'));
}

const previewType = profiles.preview?.android?.buildType;
const devType = profiles.development?.android?.buildType;
if (previewType === 'apk' && devType === 'apk') {
  record('eas.apk.profiles', 'PASS', 'development and preview use apk');
} else {
  record('eas.apk.profiles', 'FAIL', 'development/preview must use apk');
}

const forbiddenEasKeys = [
  'DATABASE_URL',
  'JWT_SECRET',
  'TOKEN_ENCRYPTION_KEY',
  'SPOTIFY_CLIENT_SECRET',
  'GOOGLE_CLIENT_SECRET',
  'AI_API_KEY',
  'AMAZON_LWA_CLIENT_SECRET',
  'AMAZON_MUSIC_CLIENT_SECRET',
  'INTERNAL_CLEANUP_KEY',
];
const easText = JSON.stringify(eas);
const leaked = forbiddenEasKeys.filter((key) => easText.includes(key));
if (leaked.length === 0) {
  record('eas.noBackendSecrets', 'PASS', 'no backend secret keys in eas.json');
} else {
  record('eas.noBackendSecrets', 'FAIL', leaked.join(', '));
}

const prodApi = String(profiles.production?.env?.EXPO_PUBLIC_API_URL ?? '');
const previewApi = String(profiles.preview?.env?.EXPO_PUBLIC_API_URL ?? '');
function classifyPublicApi(url, label) {
  if (!url) {
    record(label, 'BLOCKED', 'EXPO_PUBLIC_API_URL missing');
    return;
  }
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|10\.0\.2\.2/i.test(url)) {
    record(label, 'FAIL', 'localhost is not allowed for this profile');
    return;
  }
  if (!url.startsWith('https://')) {
    record(label, 'FAIL', 'must be https');
    return;
  }
  if (url.includes(PLACEHOLDER_HOST)) {
    record(label, 'BLOCKED', `placeholder ${PLACEHOLDER_HOST} (CFG-2)`);
    return;
  }
  record(label, 'PASS', 'https origin set');
}
classifyPublicApi(prodApi, 'EXPO_PUBLIC_API_URL.production');
classifyPublicApi(previewApi, 'EXPO_PUBLIC_API_URL.preview');

const frontendExample = existsSync(path.join(root, 'frontend/.env.production.example'))
  ? read('frontend/.env.production.example')
  : '';
if (/EXPO_PUBLIC_(JWT|DATABASE|TOKEN|SECRET|AI_API_KEY)/.test(frontendExample)) {
  record('frontend.env.publicLeak', 'FAIL', 'backend secret name in EXPO_PUBLIC_* example');
} else {
  record('frontend.env.publicLeak', 'PASS', 'no backend secrets in EXPO_PUBLIC_* examples');
}

if (!existsSync(path.join(root, '.env.production.example'))) {
  record('backend.env.example', 'FAIL', '.env.production.example missing');
} else {
  record('backend.env.example', 'PASS', 'placeholders only');
}

// --- Secret scan (paths only; never print matched values) ---
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.expo',
  'android',
  'ios',
  '.cursor',
  'agent-tools',
]);
const SKIP_FILES = /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|mp4|lock)$/i;
const EXAMPLE_FILE = /\.example$|docs\/|scripts\/release-check/;

/** @type {{ id: string, re: RegExp, allowExample: boolean }[]} */
const PATTERNS = [
  { id: 'private_key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, allowExample: false },
  { id: 'aws_access_key', re: /\bAKIA[0-9A-Z]{16}\b/, allowExample: false },
  { id: 'openai_live', re: /\bsk-(?:live|proj)-[A-Za-z0-9_-]{16,}\b/, allowExample: false },
  { id: 'google_api_key', re: /\bAIza[0-9A-Za-z_-]{35}\b/, allowExample: false },
  { id: 'assigned_jwt', re: /\bJWT_SECRET\s*=\s*[^\s#]{32,}/, allowExample: true },
  { id: 'assigned_enc_key', re: /\bTOKEN_ENCRYPTION_KEY\s*=\s*[0-9a-fA-F]{64}\b/, allowExample: true },
  { id: 'postgres_inline', re: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/, allowExample: true },
];

const TEST_FIXTURE =
  /test-jwt-secret-value-32chars-min|ab['"]\.repeat\(32\)|'ab'\.repeat\(32\)|0123456789abcdef0123456789abcdef/;

/** @type {string[]} */
const foundPaths = [];
/** @type {string[]} */
const fixturePaths = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (SKIP_FILES.test(entry)) {
      continue;
    }
    if (st.size > 1_000_000) {
      continue;
    }
    let text = '';
    try {
      text = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    const rel = path.relative(root, full);
    if (TEST_FIXTURE.test(text) && /\.test\.ts$|\.env\.test\.example$/.test(rel)) {
      fixturePaths.push(rel);
    }
    for (const pattern of PATTERNS) {
      if (!pattern.re.test(text)) {
        continue;
      }
      if (pattern.allowExample && (EXAMPLE_FILE.test(rel) || /\.env\.(example|development\.example|production\.example|test\.example)$/.test(rel))) {
        continue;
      }
      if (/\.test\.ts$/.test(rel) && TEST_FIXTURE.test(text)) {
        continue;
      }
      foundPaths.push(`${rel} (${pattern.id})`);
    }
  }
}

walk(root);

if (foundPaths.length === 0) {
  record('secretScan', 'PASS', 'NOT FOUND');
} else {
  record('secretScan', 'FAIL', `FOUND in ${foundPaths.length} path(s)`);
}

// --- Report ---
console.log('MusicMix release-check (no secret values printed)\n');
for (const check of checks) {
  console.log(`[${check.status}] ${check.name}: ${check.detail}`);
}

if (foundPaths.length > 0) {
  console.log('\nSecret scan FOUND (paths only):');
  for (const item of foundPaths) {
    console.log(`  - ${item}`);
  }
}

console.log('\nSecret scan summary: ' + (foundPaths.length > 0 ? 'FOUND' : 'NOT FOUND'));
if (fixturePaths.length > 0) {
  console.log('Test fixtures (not production secrets): listed only as files with known test markers.');
}

const failed = checks.filter((item) => item.status === 'FAIL');
const blocked = checks.filter((item) => item.status === 'BLOCKED');
if (failed.length > 0 || blocked.length > 0) {
  fail(
    `\nrelease-check incomplete: ${failed.length} FAIL, ${blocked.length} BLOCKED. CFG-2 remains BLOCKED until EXPO_PUBLIC_API_URL is a real https origin.`,
  );
} else {
  console.log('\nrelease-check: all structural production requirements passed.');
}
