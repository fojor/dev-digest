// Allow/deny table for readonly-bash.mjs (planner, doc-writer).
// Run: node --test '.claude/agents/hooks/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkCommand } from '../readonly-bash.mjs';

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'readonly-bash.mjs');

const ALLOW = [
  // regression: planner commands that worked before the refactor
  'git log --oneline -5 -- docs/plans/lab-03.md',
  "git branch --show-current | tr '/' '-'",
  "jq '.skills|keys' .claude/skills/pr-self-review/skill-map.json",
  'grep -rn "a|b" server/src',
  "sed -n '1,80p' TESTING.md",
  'ls -la 2>/dev/null',
  "find . -name '*.ts' -not -path '*/node_modules/*'",
  'git diff main...HEAD --stat',
  'head -50 a && wc -l b',
  'git status --short -- docs/features/x',
  'git branch --list',
  'git branch --contains abc123',
  'git reflog',
  'git reflog show HEAD',
  'sort -u a.txt',
  'uniq a.txt',
  "sed -n '$p' f",
  // new: harmless redirect fixed, allowed env prefix
  'git log 2>&1 | head -5',
  'DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock ls',
];

const DENY = [
  // regression
  'echo "$(rm x)"',
  'echo `id`',
  'cat a > b',
  'cat a >> b',
  'sed -i s/a/b/ f',
  'find . -delete',
  'find . -exec rm {} \\;',
  'git checkout x',
  'git branch -D x',
  'cat ~/.devdigest/secrets.json',
  'cat .env.local',
  "echo 'unterminated",
  'rm x',
  'node -e 1',
  'npm i',
  'pnpm install',
  // new hardening H1–H6
  'git log --output=x',
  'git diff --output x',
  'git grep -Orm foo',
  'git grep --open-files-in-pager=rm foo',
  'git reflog expire --all',
  'git reflog delete HEAD@{0}',
  'git branch newname',
  'sort -o out in',
  'uniq in out',
  'tree -o out',
  'rg --pre touch x',
  'file -C -m x',
  "sed -n 'w out' f",
  "sed -n '1p;w out' f",
  "sed 's/a/b/' f",
  "awk '{print}' f",
  'GIT_EXTERNAL_DIFF=touch git diff',
  'ls &',
  "sed -n '1,5p' f '--in-place'",
  '',
];

for (const cmd of ALLOW) {
  test(`allow: ${cmd}`, () => assert.equal(checkCommand(cmd), null));
}
for (const cmd of DENY) {
  test(`deny: ${cmd || '<empty>'}`, () => assert.equal(typeof checkCommand(cmd), 'string'));
}

function runHook(command, ...args) {
  return execFileSync('node', [HOOK, ...args], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
  }).toString();
}

test('stdin: an allowed command prints nothing', () => {
  assert.equal(runHook('git log 2>&1 | head -1'), '');
});
test('stdin: a denied command names planner by default', () => {
  const out = JSON.parse(runHook('rm x'));
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^planner is read-only/);
});
test('stdin: the agent name comes from argv', () => {
  const out = JSON.parse(runHook('cat x > y', 'doc-writer'));
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^doc-writer is read-only/);
});
test('stdin: unparseable input is denied', () => {
  const out = execFileSync('node', [HOOK], { input: 'not json' }).toString();
  assert.equal(JSON.parse(out).hookSpecificOutput.permissionDecision, 'deny');
});
