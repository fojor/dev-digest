// Frontmatter sanity check for every .claude/agents/*.md (dependency-free: line regexes, no YAML lib).
// Run: node --test '.claude/agents/hooks/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = path.resolve(AGENTS_DIR, '..', '..');
const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
const READ_ONLY_AGENTS = ['researcher', 'planner', 'architecture-reviewer', 'plan-verifier'];
const HOOK_PROFILES = {
  'check-bash.mjs': ['arch', 'verify', 'test'],
  'write-scope.mjs': ['tests', 'docs'],
  'readonly-bash.mjs': [undefined, 'planner', 'doc-writer'],
};

export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const lines = m[1].split('\n');
  const fm = { skills: [], hookCommands: [], hookMatchers: [] };
  let inSkills = false;
  for (const line of lines) {
    const top = line.match(/^([A-Za-z]\w*):\s*(.*)$/);
    if (top) {
      inSkills = top[1] === 'skills';
      if (top[2] !== '') fm[top[1]] = top[2].trim();
      continue;
    }
    const item = line.match(/^\s+-\s+(\S.*)$/);
    if (inSkills && item && !item[1].includes(':')) fm.skills.push(item[1].trim());
    const cmd = line.match(/^\s+command:\s*'(.*)'\s*$/);
    if (cmd) fm.hookCommands.push(cmd[1]);
    const matcher = line.match(/^\s+-\s+matcher:\s*"(.*)"\s*$/);
    if (matcher) fm.hookMatchers.push(matcher[1]);
  }
  return fm;
}

const list = (s) => (s ? s.split(',').map((t) => t.trim()).filter(Boolean) : []);

const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md');

test('all seven agents are present', () => {
  for (const name of ['researcher', 'planner', 'implementer', 'test-writer', 'architecture-reviewer', 'plan-verifier', 'doc-writer']) {
    assert.ok(files.includes(`${name}.md`), `${name}.md missing`);
  }
});

for (const file of files) {
  const name = file.replace(/\.md$/, '');
  const fm = parseFrontmatter(fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8'));

  test(`${name}: frontmatter is well-formed`, () => {
    assert.ok(fm, 'no frontmatter block');
    assert.equal(fm.name, name, 'name must equal the file name');
    assert.ok(fm.description && fm.description.length > 20, 'description is empty');
    assert.ok(['sonnet', 'opus', 'haiku', 'inherit'].includes(fm.model), `unknown model ${fm.model}`);
    const tools = list(fm.tools);
    const disallowed = list(fm.disallowedTools);
    assert.ok(tools.length > 0, 'tools must be an explicit allowlist');
    assert.deepEqual(tools.filter((t) => disallowed.includes(t)), [], 'tools and disallowedTools overlap');
  });

  if (READ_ONLY_AGENTS.includes(name)) {
    test(`${name}: has no write tool`, () => {
      const tools = list(fm.tools);
      const disallowed = list(fm.disallowedTools);
      for (const t of WRITE_TOOLS) {
        assert.ok(!tools.includes(t), `${t} in tools`);
        assert.ok(disallowed.includes(t), `${t} not in disallowedTools`);
      }
    });
  }

  test(`${name}: preloaded skills exist`, () => {
    for (const s of fm.skills) {
      assert.ok(fs.existsSync(path.join(REPO, '.claude/skills', s, 'SKILL.md')), `skill ${s} not found`);
    }
  });

  test(`${name}: hook commands point to existing hooks with known profiles`, () => {
    for (const cmd of fm.hookCommands) {
      const m = cmd.match(/\.claude\/agents\/hooks\/([\w-]+\.mjs)(?:\s+(\S+))?\s*$/);
      assert.ok(m, `unrecognized hook command: ${cmd}`);
      assert.ok(fs.existsSync(path.join(AGENTS_DIR, 'hooks', m[1])), `${m[1]} does not exist`);
      assert.ok(HOOK_PROFILES[m[1]], `${m[1]} has no known profiles`);
      assert.ok(HOOK_PROFILES[m[1]].includes(m[2]), `${m[1]}: unknown profile ${m[2]}`);
    }
  });
}

for (const name of ['test-writer', 'doc-writer']) {
  test(`${name}: writes go through a Write|Edit|MultiEdit hook`, () => {
    const fm = parseFrontmatter(fs.readFileSync(path.join(AGENTS_DIR, `${name}.md`), 'utf8'));
    assert.ok(fm.hookMatchers.includes('Write|Edit|MultiEdit'), 'missing write hook matcher');
    assert.ok(fm.hookCommands.some((c) => c.includes('write-scope.mjs')), 'missing write-scope hook');
  });
}
for (const name of ['test-writer', 'architecture-reviewer', 'plan-verifier', 'doc-writer', 'planner']) {
  test(`${name}: Bash goes through a hook`, () => {
    const fm = parseFrontmatter(fs.readFileSync(path.join(AGENTS_DIR, `${name}.md`), 'utf8'));
    assert.ok(fm.hookMatchers.includes('Bash'), 'missing Bash hook matcher');
  });
}
