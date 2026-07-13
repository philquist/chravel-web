#!/usr/bin/env node
/*
 * Top-level App Store release gate.
 * Runs required QA checks sequentially, records timing, and prints a final summary.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const releaseGate = process.env.CHRAVEL_APPSTORE_RELEASE_GATE === '1';
const includeScreenshots = process.env.CHRAVEL_APPSTORE_INCLUDE_SCREENSHOTS === '1';
const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const parsedTimeout = Number(process.env.CHRAVEL_APPSTORE_STEP_TIMEOUT_MS || 15 * 60 * 1000);
const DEFAULT_STEP_TIMEOUT_MS =
  Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 15 * 60 * 1000;

const requiredSteps = [
  ['validate-env', ['npm', ['run', 'validate-env']]],
  ['qa:guardrails', ['npm', ['run', 'qa:guardrails']]],
  ['permissions:drift', ['npm', ['run', 'permissions:drift']]],
  ['iap:parity', ['npm', ['run', 'iap:parity']]],
  ['iap:validate', ['npm', ['run', 'iap:validate']]],
  ['lint:check', ['npm', ['run', 'lint:check']]],
  ['typecheck', ['npm', ['run', 'typecheck']]],
  ['test:run', ['npm', ['run', 'test:run']]],
  ['build', ['npm', ['run', 'build']]],
  ['qa:mobile-perf-budget', ['npm', ['run', 'qa:mobile-perf-budget']]],
  ['qa:chat-production-readiness', ['npm', ['run', 'qa:chat-production-readiness']]],
  ['test:e2e:smoke', ['npm', ['run', 'test:e2e:smoke']]],
];

// Authenticated fixture suites require SUPABASE_SERVICE_ROLE_KEY. When the key is
// absent, run demo/UI smoke coverage so the gate still exercises the surface
// without silently skipping launch-critical authenticated paths when secrets exist.

function existingTargets(targets) {
  return targets.filter(target => fs.existsSync(path.join(repoRoot, target)));
}

function playwrightStep(label, targets, extraArgs = []) {
  const existing = existingTargets(targets);
  if (existing.length === 0) {
    return [
      [
        `${label}:coverage-missing`,
        [
          'node',
          [
            '-e',
            `console.error(${JSON.stringify(`Missing App Store release-gate Playwright coverage for ${label.replace('playwright:', '')}. Add a spec under: ${targets.join(', ')}`)}); process.exit(1);`,
          ],
        ],
      ],
    ];
  }
  return [[label, ['npx', ['playwright', 'test', ...existing, ...extraArgs, '--project=chromium']]]];
}

const steps = [
  ...requiredSteps,
  ...playwrightStep(
    'playwright:auth',
    hasServiceRole
      ? ['e2e/specs/auth/full-auth.spec.ts', 'e2e/specs/auth/auth-smoke.spec.ts']
      : ['e2e/specs/auth/auth-smoke.spec.ts'],
  ),
  ...playwrightStep(
    'playwright:trip-creation',
    hasServiceRole
      ? ['e2e/specs/trips/trip-crud.spec.ts', 'e2e/trip-creation.spec.ts']
      : ['e2e/trip-creation.spec.ts'],
  ),
  ...playwrightStep('playwright:invite-join', [
    'e2e/invite-links.spec.ts',
    'e2e/trip-flow.spec.ts',
  ]),
  ...playwrightStep('playwright:payments', ['e2e/specs/payments']),
  ...(hasServiceRole
    ? playwrightStep('playwright:concierge', [
        'e2e/specs/chat/messaging.spec.ts',
        'e2e/specs/concierge/mobile-device-smoke.spec.ts',
      ])
    : [
        ...playwrightStep(
          'playwright:concierge-chat-smoke',
          ['e2e/specs/chat/messaging.spec.ts'],
          ['-g', 'CHAT-SMOKE'],
        ),
        [
          'playwright:concierge-device-smoke',
          [
            'npx',
            [
              'playwright',
              'test',
              'e2e/specs/concierge/mobile-device-smoke.spec.ts',
              '--project=Mobile Chrome',
              '--workers=1',
              '-g',
              'demo mobile controls|pending tool cards',
            ],
          ],
        ],
      ]),
  ...playwrightStep('playwright:events', ['e2e/specs/events/event-recap-export.spec.ts']),
  ...playwrightStep(
    'playwright:pro-trips',
    hasServiceRole ? ['e2e/specs/pro', 'e2e/specs/chat/messaging.spec.ts'] : ['e2e/specs/pro'],
  ),
  ...playwrightStep('playwright:media', ['e2e/specs/media']),
];

if (includeScreenshots) {
  steps.push(['screenshots:appstore:all', ['npm', ['run', 'screenshots:appstore:all']]]);
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function buildGateEnv() {
  const env = { ...process.env };
  // Playwright fixtures accept either SUPABASE_* or VITE_SUPABASE_*; mirror for CI/local.
  if (!env.SUPABASE_URL && env.VITE_SUPABASE_URL) env.SUPABASE_URL = env.VITE_SUPABASE_URL;
  if (!env.SUPABASE_ANON_KEY && (env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY)) {
    env.SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  }
  env.CHRAVEL_E2E_RELEASE_GATE = releaseGate ? '1' : env.CHRAVEL_E2E_RELEASE_GATE;
  // Concierge device smoke projects are gated behind PLAYWRIGHT_MOBILE_SMOKE.
  env.PLAYWRIGHT_MOBILE_SMOKE = env.PLAYWRIGHT_MOBILE_SMOKE || '1';
  return env;
}

const startedAt = Date.now();
const results = [];

console.log('🚦 Chravel App Store release gate starting');
console.log(`Steps: ${steps.length}`);
console.log(`Per-step timeout: ${formatDuration(DEFAULT_STEP_TIMEOUT_MS)}`);
console.log(
  hasServiceRole
    ? 'SUPABASE_SERVICE_ROLE_KEY present → authenticated Playwright suites enabled'
    : 'SUPABASE_SERVICE_ROLE_KEY absent → demo/UI smoke Playwright suites only',
);
if (releaseGate) {
  console.log('CHRAVEL_APPSTORE_RELEASE_GATE=1 → Concierge device smoke uses fail-closed skips');
}
console.log('');

for (const [label, [command, args]] of steps) {
  const stepStartedAt = Date.now();
  console.log(`▶ ${label}`);
  console.log(`  $ ${[command, ...args].join(' ')}`);

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: buildGateEnv(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    timeout: DEFAULT_STEP_TIMEOUT_MS,
  });

  const durationMs = Date.now() - stepStartedAt;
  const timedOut = result.error?.code === 'ETIMEDOUT';
  const exitCode = timedOut ? 124 : typeof result.status === 'number' ? result.status : 1;
  results.push({
    label,
    command: [command, ...args].join(' '),
    durationMs,
    exitCode,
    timedOut,
  });

  if (timedOut) {
    console.error(`⏱️  ${label} exceeded ${formatDuration(DEFAULT_STEP_TIMEOUT_MS)} timeout.`);
  }

  if (exitCode !== 0) {
    console.error(`✖ ${label} failed after ${formatDuration(durationMs)} (exit ${exitCode})`);
    break;
  }

  console.log(`✓ ${label} passed in ${formatDuration(durationMs)}`);
  console.log('');
}

const failed = results.find(result => result.exitCode !== 0);
const totalDurationMs = Date.now() - startedAt;

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('App Store release gate summary');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
for (const result of results) {
  const icon = result.exitCode === 0 ? '✅' : '❌';
  const timeoutNote = result.timedOut ? ' (timeout)' : '';
  console.log(
    `${icon} ${result.label} — ${formatDuration(result.durationMs)}${timeoutNote} — ${result.command}`,
  );
}
const notRun = steps.slice(results.length);
for (const [label] of notRun) {
  console.log(`⏭️  ${label} — not run because an earlier step failed`);
}
console.log(`Total elapsed: ${formatDuration(totalDurationMs)}`);

if (failed) {
  console.error(`\n❌ App Store release gate failed at ${failed.label}.`);
  process.exit(failed.exitCode);
}

console.log('\n✅ App Store release gate passed.');
if (!hasServiceRole) {
  console.warn(
    '\n⚠️  Authenticated Playwright suites were not run (missing SUPABASE_SERVICE_ROLE_KEY).',
  );
  console.warn(
    '   Final App Store submission still requires SERVICE_ROLE-backed auth/trip E2E in CI.',
  );
}
