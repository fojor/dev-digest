#!/usr/bin/env node
// PreToolUse hook (Write|Edit|MultiEdit|NotebookEdit) that limits WHERE an agent may write:
//   node write-scope.mjs tests   → test-writer: test files only (+ throwaway *.json in a temp dir)
//   node write-scope.mjs docs    → doc-writer: the Markdown docs listed in PROFILES.docs only
// Paths are resolved against CLAUDE_PROJECT_DIR (fallback: the hook input's cwd), symlinks are resolved
// through the nearest existing parent (macOS /tmp → /private/tmp), and `..` cannot escape the repo.
// Fails CLOSED: unknown profile, missing path or unparseable input → deny.
// Run the table: node --test '.claude/agents/hooks/test/*.test.mjs'
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { deny, readStdinJson, isMain } from './readonly-bash.mjs';

export const AGENTS = { tests: 'test-writer', docs: 'doc-writer' };

/** Denied for every profile, even when an allow pattern matches. */
export const ALWAYS_DENY = [
  '**/vendor/**',
  '**/node_modules/**',
  '**/INSIGHTS*.md',
  '**/CLAUDE.md',
  '.claude/**',
  '**/package.json',
  '**/{pnpm-lock.yaml,package-lock.json,yarn.lock,npm-shrinkwrap.json}',
];

export const PROFILES = {
  tests: {
    label: 'test files',
    allow: [
      'client/src/**/*.test.{ts,tsx}',
      'client/src/test/**/*.{ts,tsx}',
      'server/test/**/*.ts',
      'reviewer-core/test/**/*.ts',
    ],
    tempJson: true,
  },
  docs: {
    label: 'Markdown docs',
    allow: [
      'docs/features/**/*.md',
      'docs/adr/*.md',
      'docs/agent-prompts/README.md',
      'docs/agent-prompts/choosing-a-model.md',
      'docs/ONBOARDING.md',
      'docs/skills/README.md',
      'README.md',
      'TESTING.md',
      '{client,server,reviewer-core,e2e}/README.md',
      'server/src/modules/*/README.md',
    ],
    tempJson: false,
  },
};

/** Minimal glob → RegExp: `**` (any dirs), `*` (within a segment), `{a,b}` (alternatives). */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|')})`;
      i = end;
    } else re += ch.replace(/[.+^$()|[\]\\?]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const matchesAny = (rel, globs) => globs.some((g) => globToRegExp(g).test(rel));

/** Resolves symlinks through the nearest existing ancestor; the rest of the path is kept as is. */
export function realish(p) {
  let dir = path.resolve(p);
  const tail = [];
  while (!fs.existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    tail.unshift(path.basename(dir));
    dir = parent;
  }
  let real = dir;
  try { real = fs.realpathSync(dir); } catch { /* keep */ }
  return path.join(real, ...tail);
}

export function defaultTempRoots() {
  const roots = [];
  try { roots.push(fs.realpathSync(os.tmpdir())); } catch { /* ignore */ }
  for (const p of ['/tmp', '/private/tmp']) {
    try { roots.push(path.join(fs.realpathSync(p), 'claude-')); } catch { /* ignore */ }
  }
  return roots;
}

function underTemp(real, tempRoots) {
  return tempRoots.some((root) => (root.endsWith('-') ? real.startsWith(root) : real.startsWith(root + path.sep)));
}

/** Returns a reason when the agent may not write filePath, otherwise null. */
export function checkWritePath(filePath, profile, { projectDir, tempRoots = defaultTempRoots() } = {}) {
  const spec = PROFILES[profile];
  if (!spec) return `unknown profile '${profile ?? ''}'`;
  if (!filePath || typeof filePath !== 'string') return 'no file path in the tool call';
  if (!projectDir) return 'no project directory';
  const root = realish(projectDir);
  const real = realish(path.resolve(root, filePath));
  const rel = path.relative(root, real);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    if (spec.tempJson && real.endsWith('.json') && underTemp(real, tempRoots)) return null;
    return `${real} is outside the repository`;
  }
  const posix = rel.split(path.sep).join('/');
  if (matchesAny(posix, ALWAYS_DENY)) return `${posix} is never writable by agents`;
  if (!matchesAny(posix, spec.allow)) return `${posix} is outside its scope`;
  return null;
}

if (isMain(import.meta.url)) {
  const profile = process.argv[2];
  const agent = AGENTS[profile] ?? `unknown profile '${profile ?? ''}'`;
  const label = PROFILES[profile]?.label ?? 'nothing';
  const msg = (reason) => `${agent} may only write ${label}: ${reason}. Report the change you need instead.`;
  try {
    const input = await readStdinJson();
    const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
    const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd;
    const reason = checkWritePath(file, profile, { projectDir });
    if (reason) deny(msg(reason));
  } catch {
    deny(msg('the hook could not parse the tool call'));
  }
  process.exit(0);
}
