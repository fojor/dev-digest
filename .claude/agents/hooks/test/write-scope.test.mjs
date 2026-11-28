// Allow/deny table for write-scope.mjs (test-writer → tests, doc-writer → docs).
// Run: node --test '.claude/agents/hooks/test/*.test.mjs'
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkWritePath } from '../write-scope.mjs';

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'write-scope.mjs');

// A throwaway project and scratch dir, realpath'd (macOS /var → /private/var).
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'write-scope-')));
const projectDir = path.join(base, 'repo');
const scratch = path.join(base, 'scratchpad');
for (const d of ['client/src/app/skills/_components/SkillCard', 'server/test/helpers', 'server/src/modules/repo-intel',
  'reviewer-core/test', 'docs/features/run-cost', 'docs/adr', 'docs/plans', 'docs/agent-prompts', scratch]) {
  fs.mkdirSync(path.isAbsolute(d) ? d : path.join(projectDir, d), { recursive: true });
}
after(() => fs.rmSync(base, { recursive: true, force: true }));
const opts = { projectDir, tempRoots: [base] };

const table = [
  // tests allow
  ['tests', 'client/src/app/skills/_components/SkillCard/SkillCard.test.tsx', true],
  ['tests', 'client/src/components/BlockList/BlockList.test.tsx', true],
  ['tests', 'server/test/foo.it.test.ts', true],
  ['tests', 'server/test/helpers/runs.ts', true],
  ['tests', 'reviewer-core/test/x.test.ts', true],
  ['tests', path.join(scratch, 'tsconfig.rc-tests.json'), true],
  // tests deny
  ['tests', 'server/src/adapters/mocks.ts', false],
  ['tests', 'client/src/lib/api.ts', false],
  ['tests', 'client/src/vendor/ui/x.test.tsx', false],
  ['tests', 'server/test/../src/app.ts', false],
  ['tests', 'server/package.json', false],
  ['tests', 'server/pnpm-lock.yaml', false],
  ['tests', 'server/INSIGHTS.md', false],
  ['tests', '/etc/hosts', false],
  ['tests', path.join(scratch, 'x.ts'), false],
  ['tests', '', false],
  ['foo', 'server/test/foo.test.ts', false],
  // docs allow
  ['docs', 'docs/features/run-cost/spec.md', true],
  ['docs', 'docs/adr/0005-x.md', true],
  ['docs', 'server/README.md', true],
  ['docs', 'server/src/modules/repo-intel/README.md', true],
  ['docs', 'TESTING.md', true],
  ['docs', 'docs/agent-prompts/README.md', true],
  ['docs', 'docs/ONBOARDING.md', true],
  // docs deny
  ['docs', 'CLAUDE.md', false],
  ['docs', 'server/CLAUDE.md', false],
  ['docs', 'INSIGHTS.md', false],
  ['docs', 'docs/plans/lab-03.md', false],
  ['docs', 'docs/research/x.md', false],
  ['docs', 'docs/demos/lab-02.md', false],
  ['docs', 'docs/agent-prompts/security-reviewer.md', false],
  ['docs', '.claude/agents/README.md', false],
  ['docs', 'server/src/app.ts', false],
  ['docs', 'docs/features/x/tasks.json', false],
  ['docs', 'client/src/vendor/ui/README.md', false],
  ['docs', path.join(scratch, 'x.json'), false],
];

for (const [profile, file, allow] of table) {
  test(`${profile}: ${allow ? 'allow' : 'deny'}: ${file || '<empty>'}`, () => {
    const reason = checkWritePath(file, profile, opts);
    if (allow) assert.equal(reason, null);
    else assert.equal(typeof reason, 'string');
  });
}

test('absolute repo paths are accepted like relative ones', () => {
  assert.equal(checkWritePath(path.join(projectDir, 'server/test/a.test.ts'), 'tests', opts), null);
});

if (process.platform === 'darwin') {
  test('the same temp file spelled /tmp/… and /private/tmp/… is treated alike', () => {
    const dir = fs.mkdtempSync('/tmp/claude-ws-');
    try {
      const real = fs.realpathSync(dir);
      const o = { projectDir, tempRoots: [real] };
      assert.equal(checkWritePath(path.join(dir, 't.json'), 'tests', o), null);
      assert.equal(checkWritePath(path.join(real, 't.json'), 'tests', o), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('stdin: a production file is denied for tests', () => {
  const out = execFileSync('node', [HOOK, 'tests'], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'server/src/app.ts' } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  }).toString();
  const decision = JSON.parse(out).hookSpecificOutput;
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /^test-writer may only write test files/);
});
test('stdin: a doc path is allowed for docs', () => {
  const out = execFileSync('node', [HOOK, 'docs'], {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'TESTING.md' } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  }).toString();
  assert.equal(out, '');
});
test('stdin: missing file_path is denied', () => {
  const out = execFileSync('node', [HOOK, 'docs'], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: {} }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  }).toString();
  assert.equal(JSON.parse(out).hookSpecificOutput.permissionDecision, 'deny');
});
