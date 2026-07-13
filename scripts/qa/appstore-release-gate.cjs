#!/usr/bin/env node
/*
 * Top-level App Store release gate.
 * Runs required QA checks sequentially, records timing, and prints a final summary.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

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

const releaseGatePlaywrightSpecs = [
  ['playwright:auth', ['e2e/specs/auth/full-auth.spec.ts']],
  ['playwright:trip-creation', ['e2e/specs/trips/trip-crud.spec.ts', 'e2e/trip-creation.spec.ts']],
  ['playwright:invite-join', ['e2e/invite-links.spec.ts', 'e2e/trip-flow.spec.ts']],
  ['playwright:payments', ['e2e/specs/payments']],
  [
    'playwright:concierge',
    ['e2e/specs/chat/messaging.spec.ts', 'e2e/specs/concierge/mobile-device-smoke.spec.ts'],
  ],
  ['playwright:events', ['e2e/specs/events/event-recap-export.spec.ts']],
  ['playwright:pro-trips', ['e2e/specs/pro', 'e2e/specs/chat/messaging.spec.ts']],
  ['playwright:media', ['e2e/specs/media']],
];

function existingTargets(targets) {
  return targets.filter(target => fs.existsSync(path.join(repoRoot, target)));
}

const steps = [
  ...requiredSteps,
  ...releaseGatePlaywrightSpecs.flatMap(([label, targets]) => {
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
    return [[label, ['npx', ['playwright', 'test', ...existing, '--project=chromium']]]];
  }),
];

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

const startedAt = Date.now();
const results = [];

console.log('🚦 Chravel App Store release gate starting');
console.log(`Steps: ${steps.length}`);
console.log('');

for (const [label, [command, args]] of steps) {
  const stepStartedAt = Date.now();
  console.log(`▶ ${label}`);
  console.log(`  $ ${[command, ...args].join(' ')}`);

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const durationMs = Date.now() - stepStartedAt;
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  results.push({ label, command: [command, ...args].join(' '), durationMs, exitCode });

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
  console.log(`${icon} ${result.label} — ${formatDuration(result.durationMs)} — ${result.command}`);
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
