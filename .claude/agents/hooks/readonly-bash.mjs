#!/usr/bin/env node
// PreToolUse hook (Bash) for read-only subagents (planner, doc-writer): the agent's frontmatter wires it
// in as `node readonly-bash.mjs [agent-name]`; the name only changes the deny message (default: planner).
// Allowlist, not denylist: every segment of the command (split on && || ; | and newlines) must start
// with a read-only program, and the command must not redirect output, substitute commands, run in the
// background or edit in place. Fails CLOSED: anything it cannot parse is denied — this is a permission
// boundary, the prompt is only the first line of defence (code.claude.com/docs/en/sub-agents).
// check-bash.mjs builds on the exported functions below; run the tables with
//   node --test '.claude/agents/hooks/test/*.test.mjs'
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const READ_ONLY = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'jq', 'find', 'sed', 'sort', 'uniq',
  'cut', 'tr', 'diff', 'file', 'stat', 'pwd', 'echo', 'printf', 'basename', 'dirname', 'realpath',
  'tree', 'du', 'test', 'true', 'git',
]);

export const GIT_READ_ONLY = new Set([
  'log', 'show', 'diff', 'status', 'blame', 'grep', 'rev-parse', 'ls-files', 'ls-tree',
  'branch', 'describe', 'shortlog', 'cat-file', 'merge-base', 'name-rev', 'reflog',
]);

/** Environment prefixes a command may carry (`VAR=value cmd`); any other name is denied. */
export const ENV_ALLOW = ['DOCKER_HOST', 'TESTCONTAINERS_RYUK_DISABLED', 'CI', 'NO_COLOR', 'FORCE_COLOR'];

const SECRET_PATHS = [/\.devdigest\/secrets\.json/, /(^|[\s/'"])\.env(\.[\w-]+)?(?=$|[\s'"])/];

// Harmless redirects that are blanked out before splitting: 2>&1, >&2, 2>/dev/null, >/dev/null.
const SAFE_REDIRECT = /\d?>&\d|\d?>\s*\/dev\/null/g;

const GIT_BRANCH_LIST_FLAGS = new Set(['--list', '-l', '--contains', '--merged', '--no-merged', '--points-at']);
const SED_PRINT_SCRIPT = /^(\d+|\$)(,(\d+|\$))?p$/;

/**
 * Masks quoted text so shell operators inside quotes are not mistaken for real ones. The result has
 * the same length as the input. Single-quoted text is fully inert; double-quoted text keeps $( and `
 * because the shell still expands them there. Returns null on an unterminated quote.
 */
export function maskQuotes(cmd) {
  let out = '';
  let quote = null;
  for (let i = 0; i < cmd.length; i += 1) {
    const ch = cmd[i];
    if (quote) {
      if (ch === '\\' && quote === '"') { out += '__'; i += 1; continue; }
      if (ch === quote) { quote = null; out += ch; continue; }
      if (quote === '"' && ch === '`') { out += ch; continue; }
      if (quote === '"' && ch === '$' && cmd[i + 1] === '(') { out += '$('; i += 1; continue; }
      out += '_';
      continue;
    }
    if (ch === '\\') { out += '__'; i += 1; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    out += ch;
  }
  return quote ? null : out;
}

/** Strips quotes and backslashes, so '--update' or \-\-update cannot hide a flag. */
export function normalizeWord(w) {
  return String(w ?? '').replace(/['"\\]/g, '');
}

/** Splits a segment into words (whitespace-separated, as typed). */
export function words(segment) {
  return String(segment ?? '').trim().split(/\s+/).filter(Boolean);
}

/**
 * Splits a command into segments on && || ; | and newlines found outside quotes.
 * Returns { segments } or { reason } when the command as a whole is not acceptable.
 */
export function splitSegments(command) {
  let cmd = String(command ?? '').trim();
  if (!cmd) return { reason: 'empty command' };
  let masked = maskQuotes(cmd);
  if (masked === null) return { reason: 'unterminated quote' };
  if (/\$\(|`|<\(|>\(/.test(masked)) return { reason: 'command/process substitution is not allowed' };
  // Blank harmless redirects in both strings (same positions), so `2>&1` is not split on its `&`.
  for (const m of masked.matchAll(SAFE_REDIRECT)) {
    const blank = ' '.repeat(m[0].length);
    cmd = cmd.slice(0, m.index) + blank + cmd.slice(m.index + m[0].length);
  }
  masked = masked.replace(SAFE_REDIRECT, (s) => ' '.repeat(s.length));
  if (/>/.test(masked)) return { reason: 'output redirection is not allowed' };
  if (SECRET_PATHS.some((re) => re.test(cmd))) {
    return { reason: 'reading secrets (.env*, ~/.devdigest/secrets.json) is not allowed' };
  }

  const segments = [];
  const opRe = /&&|\|\||;|\||\n|&/g;
  let last = 0;
  for (let m = opRe.exec(masked); m; m = opRe.exec(masked)) {
    if (m[0] === '&') return { reason: 'background jobs (&) are not allowed' };
    segments.push(cmd.slice(last, m.index));
    last = m.index + m[0].length;
  }
  segments.push(cmd.slice(last));
  return { segments: segments.map((s) => s.trim()).filter(Boolean) };
}

/**
 * Drops leading `VAR=value` words. Only names in allowedNames are accepted.
 * Returns { rest } (the segment without the prefix) or { reason }.
 */
export function stripEnvPrefix(segment, allowedNames = ENV_ALLOW) {
  const w = words(segment);
  let i = 0;
  while (i < w.length && /^[A-Za-z_]\w*=/.test(w[i])) {
    const name = w[i].slice(0, w[i].indexOf('='));
    if (!allowedNames.includes(name)) return { reason: `environment prefix '${name}=' is not allowed` };
    i += 1;
  }
  return { rest: w.slice(i).join(' ') };
}

const isFlag = (w) => w.startsWith('-');

/** Returns a reason string when one segment is not a read-only command, otherwise null. */
export function checkReadOnlySegment(segment) {
  const env = stripEnvPrefix(segment);
  if (env.reason) return env.reason;
  const raw = words(env.rest);
  const w = raw.map(normalizeWord);
  const prog = w[0];
  if (!prog) return 'empty command';
  if (!READ_ONLY.has(prog)) return `'${prog}' is not in the read-only allowlist`;
  const args = w.slice(1);

  if (prog === 'git') {
    const subIdx = args.findIndex((a) => !isFlag(a));
    const sub = args[subIdx];
    if (!GIT_READ_ONLY.has(sub)) return `'git ${sub ?? ''}' is not read-only`;
    const rest = args.slice(subIdx + 1);
    if (args.some((a) => a === '--output' || a.startsWith('--output='))) return "'git --output' writes a file";
    if (sub === 'grep' && rest.some((a) => /^-[^-]*O/.test(a) || a.startsWith('--open-files-in-pager'))) {
      return "'git grep -O' runs a pager command";
    }
    if (sub === 'reflog') {
      const action = rest.find((a) => !isFlag(a));
      if (action !== undefined && action !== 'show') return "'git reflog' may only show";
    }
    if (sub === 'branch') {
      if (rest.some((a) => /^-(d|D|m|M|c|C)$|^--(delete|move|copy|set-upstream|unset-upstream|edit-description)/.test(a))) {
        return "'git branch' may only list branches";
      }
      const listing = rest.some((a) => GIT_BRANCH_LIST_FLAGS.has(a.split('=')[0]));
      if (!listing && rest.some((a) => !isFlag(a))) return "'git branch <name>' creates a branch";
    }
  }

  if (prog === 'sed') {
    if (args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) return "'sed -i' edits files";
    if (args.some((a) => a === '-e' || a === '-f' || a.startsWith('--expression') || a.startsWith('--file'))) {
      return "'sed' may only print line ranges (sed -n 'N,Mp' file)";
    }
    const hasN = args.some((a) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a) || a === '--quiet' || a === '--silent');
    const script = args.find((a) => !isFlag(a));
    if (!hasN || script === undefined || !SED_PRINT_SCRIPT.test(script)) {
      return "'sed' may only print line ranges (sed -n 'N,Mp' file)";
    }
  }

  if (prog === 'find' && args.some((a) => /^-(delete|exec|execdir|ok|okdir|fprint\w*|fls)$/.test(a))) {
    return "'find' may not delete, exec or write";
  }
  if (prog === 'sort' && args.some((a) => /^-[^-]*o/.test(a) || a.startsWith('--output'))) return "'sort -o' writes a file";
  if (prog === 'tree' && args.some((a) => /^-[^-]*o/.test(a))) return "'tree -o' writes a file";
  if (prog === 'uniq' && args.filter((a) => !isFlag(a)).length >= 2) return "'uniq in out' writes a file";
  if (prog === 'rg' && args.some((a) => a.startsWith('--pre'))) return "'rg --pre' runs a command";
  if (prog === 'file' && args.some((a) => /^-[^-]*C/.test(a) || a.startsWith('--compile'))) return "'file -C' writes a file";
  return null;
}

/** Returns a reason string when the command is not read-only, otherwise null. */
export function checkCommand(command) {
  const split = splitSegments(command);
  if (split.reason) return split.reason;
  for (const seg of split.segments) {
    const reason = checkReadOnlySegment(seg);
    if (reason) return reason;
  }
  return null;
}

/** Writes a PreToolUse deny decision and exits. */
export function deny(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
    },
  }));
  process.exit(0);
}

export async function readStdinJson() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return JSON.parse(data);
}

/** True when the module is run directly (node readonly-bash.mjs …), not imported. */
export function isMain(metaUrl) {
  try {
    return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === metaUrl;
  } catch {
    return false;
  }
}

if (isMain(import.meta.url)) {
  const agent = process.argv[2] ?? 'planner';
  const hint = 'Use Read/Grep/Glob, or a read-only command (git log|show|diff|status|blame, ls, cat, grep, jq, find, sed -n \'N,Mp\').';
  try {
    const input = await readStdinJson();
    if (input.tool_name === 'Bash') {
      const reason = checkCommand(input.tool_input?.command);
      if (reason) deny(`${agent} is read-only: ${reason}. ${hint}`);
    }
  } catch {
    deny(`${agent} is read-only: the hook could not parse the tool call. ${hint}`);
  }
  process.exit(0);
}
