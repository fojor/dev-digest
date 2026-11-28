// Allow/deny table for check-bash.mjs (architecture-reviewer, plan-verifier, test-writer).
// Run: node --test '.claude/agents/hooks/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkCheckCommand } from '../check-bash.mjs';

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'check-bash.mjs');

const ARCH_ALLOW = [
  'cd /abs/server && pnpm exec vitest run test/architecture.test.ts 2>&1 | tail -30',
  'cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known --output-type err-long',
  'cd client && npx eslint .',
  'cd reviewer-core && npx eslint src/review/run.ts --format json',
  './scripts/check-contracts.sh',
  'git diff main...HEAD --name-only',
];
const ARCH_DENY = [
  'cd server && pnpm exec vitest run',
  'pnpm typecheck',
  'npx eslint --fix .',
  "npx eslint . '--fix'",
  'npx eslint . -o out.txt',
  'npx eslint --cache .',
  'npx eslint -c other.mjs .',
  'pnpm exec depcruise src --output-to x.html',
  'pnpm exec depcruise-baseline src --config .dependency-cruiser.cjs',
  'npx -y some-pkg',
  'pnpm install',
  'cd server && rm -rf x',
  'true || npx eslint --fix .',
  'cd a b',
];
const VERIFY_ALLOW = [
  'cd server && pnpm typecheck',
  "cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'",
  'cd server && DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock TESTCONTAINERS_RYUK_DISABLED=true pnpm exec vitest run .it.test',
  "cd client && npx -y pnpm@10 vitest run 'src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx'",
  'cd client && npx -y pnpm@10 test',
  'cd reviewer-core && npm run typecheck && npm test',
  "cd reviewer-core && npx vitest run test/run.test.ts -t 'grounds findings'",
];
const VERIFY_DENY = [
  'pnpm exec vitest run -u',
  "pnpm exec vitest run '--update'",
  'pnpm exec vitest',
  'npx vitest run --coverage',
  'pnpm exec vitest run --outputFile=x.json',
  'pnpm exec vitest run --config other.ts',
  'npx tsc --noEmit -p /tmp/claude-1/t.json',
  'FOO=1 pnpm typecheck',
  'pnpm test',
  'npm install',
  'npx -y pnpm@10 install',
  'pnpm db:migrate',
  'pnpm db:generate',
  'docker compose down -v',
  '../scripts/e2e.sh',
  'node --test x',
];
const TEST_ALLOW = [
  'npx tsc --noEmit -p /private/tmp/claude-501/s/scratchpad/tsconfig.rc-tests.json',
  'cd server && pnpm exec vitest run test/foo.test.ts',
];
const TEST_DENY = [
  'npx tsc -p /tmp/claude-1/t.json',
  'npx tsc --noEmit -p reviewer-core/tsconfig.json',
  'npx tsc --noEmit -p /tmp/claude-1/t.ts',
  'npx tsc --noEmit -p /tmp/claude-1/../../etc/t.json',
];

const table = [
  ...ARCH_ALLOW.map((c) => [c, 'arch', true]),
  ...ARCH_DENY.map((c) => [c, 'arch', false]),
  ...VERIFY_ALLOW.map((c) => [c, 'verify', true]),
  ...VERIFY_DENY.map((c) => [c, 'verify', false]),
  ...TEST_ALLOW.map((c) => [c, 'test', true]),
  ...TEST_DENY.map((c) => [c, 'test', false]),
  ['ls', 'foo', false],
  ['ls', undefined, false],
];

for (const [cmd, profile, allow] of table) {
  test(`${profile}: ${allow ? 'allow' : 'deny'}: ${cmd}`, () => {
    const reason = checkCheckCommand(cmd, profile);
    if (allow) assert.equal(reason, null);
    else assert.equal(typeof reason, 'string');
  });
}

test('stdin: eslint --fix is denied for arch with the agent name', () => {
  const out = execFileSync('node', [HOOK, 'arch'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npx eslint --fix .' } }),
  }).toString();
  const decision = JSON.parse(out).hookSpecificOutput;
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /^architecture-reviewer may run only/);
});
test('stdin: an allowed check prints nothing', () => {
  const out = execFileSync('node', [HOOK, 'verify'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'cd server && pnpm typecheck' } }),
  }).toString();
  assert.equal(out, '');
});
