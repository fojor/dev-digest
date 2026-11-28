#!/usr/bin/env node
// PreToolUse hook (Bash) for agents that must run the project's checks but never write:
//   node check-bash.mjs <arch|verify|test>
//   arch   → architecture-reviewer   verify → plan-verifier   test → test-writer
// Every segment of the command (see readonly-bash.mjs splitSegments) must be read-only, `cd <dir>`, or
// one of the check forms below allowed for the profile. Every check form has an ARGUMENT ALLOWLIST:
// any other flag is denied (notably --fix, -u/--update, --coverage, --output*, -c/--config, watch mode).
// Unknown or missing profile → everything is denied (fails closed).
//
// | ID  | Form                                                        | arch | verify | test |
// |-----|-------------------------------------------------------------|:----:|:------:|:----:|
// | K1  | npx eslint … / npx --no eslint …                            |  ✓   |   ✓    |  ✓   |
// | K2  | pnpm exec depcruise …                                       |  ✓   |   ✓    |  ✓   |
// | K3a | pnpm exec vitest run test/architecture.test.ts (exact)      |  ✓   |   ✓    |  ✓   |
// | K3b | pnpm exec vitest run <vitest args>                          |  —   |   ✓    |  ✓   |
// | K4  | [bash] [./|/abs/]scripts/check-contracts.sh                 |  ✓   |   ✓    |  ✓   |
// | K5  | pnpm typecheck · npx -y pnpm@10 typecheck · npm run typecheck|  —   |   ✓    |  ✓   |
// | K6  | npx -y pnpm@10 test|vitest run … · npm test [-- …] · npx vitest run … | — | ✓ |  ✓   |
// | K7  | npx tsc --noEmit -p <temp-dir *.json>                       |  —   |   —    |  ✓   |
// | K8  | cd <dir>                                                    |  ✓   |   ✓    |  ✓   |
//
// Vitest args: positional filters, --exclude <glob>, -t/--testNamePattern <pat>,
// --reporter <default|verbose|dot|basic>, --bail <n>, --no-file-parallelism, --passWithNoTests, --silent.
// Run the table: node --test '.claude/agents/hooks/test/*.test.mjs'
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  splitSegments, checkReadOnlySegment, normalizeWord, stripEnvPrefix, words, deny, readStdinJson, isMain,
} from './readonly-bash.mjs';

export const AGENTS = { arch: 'architecture-reviewer', verify: 'plan-verifier', test: 'test-writer' };

export const PROFILES = {
  arch: ['K1', 'K2', 'K3a', 'K4', 'K8'],
  verify: ['K1', 'K2', 'K3a', 'K3b', 'K4', 'K5', 'K6', 'K8'],
  test: ['K1', 'K2', 'K3a', 'K3b', 'K4', 'K5', 'K6', 'K7', 'K8'],
};

const ESLINT_FLAGS = {
  '-f': ['stylish', 'json', 'compact', 'unix'],
  '--format': ['stylish', 'json', 'compact', 'unix'],
  '--quiet': null,
  '--max-warnings': /^\d+$/,
  '--no-warn-ignored': null,
};
const DEPCRUISE_FLAGS = {
  '--config': /.+/,
  '--ignore-known': null,
  '-T': ['err', 'err-long', 'text', 'json'],
  '--output-type': ['err', 'err-long', 'text', 'json'],
  '--no-progress': null,
  '--focus': /.+/,
};
const VITEST_FLAGS = {
  '--exclude': /.+/,
  '-t': /.+/,
  '--testNamePattern': /.+/,
  '--reporter': ['default', 'verbose', 'dot', 'basic'],
  '--bail': /^\d+$/,
  '--no-file-parallelism': null,
  '--passWithNoTests': null,
  '--silent': null,
};

/**
 * Checks args against a flag allowlist. spec[flag] = null (no value), an array of allowed values,
 * or a RegExp for the value. Positional args are always allowed. Returns a reason or null.
 */
function checkArgs(args, spec, tool) {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a.startsWith('-')) continue;
    const eq = a.indexOf('=');
    const flag = eq > 0 ? a.slice(0, eq) : a;
    if (!Object.hasOwn(spec, flag)) return `'${tool} ${flag}' is not an allowed flag`;
    const rule = spec[flag];
    if (rule === null) {
      if (eq > 0) return `'${tool} ${flag}' takes no value`;
      continue;
    }
    let value;
    if (eq > 0) value = a.slice(eq + 1);
    else { i += 1; value = args[i]; }
    if (value === undefined) return `'${tool} ${flag}' needs a value`;
    const ok = Array.isArray(rule) ? rule.includes(value) : rule.test(value);
    if (!ok) return `'${tool} ${flag} ${value}' is not an allowed value`;
  }
  return null;
}

const startsWith = (w, prefix) => prefix.every((p, i) => w[i] === p);

function realTempRoots() {
  const roots = [];
  try { roots.push(fs.realpathSync(os.tmpdir())); } catch { /* ignore */ }
  return roots;
}

/** True when p (absolute) is inside the system temp dir or a /tmp/claude-* scratch dir. */
export function isUnderTemp(p) {
  let real = path.resolve(p);
  try { real = path.join(fs.realpathSync(path.dirname(real)), path.basename(real)); } catch { /* keep */ }
  if (/^\/(private\/)?tmp\/claude-[^/]+\//.test(real)) return true;
  return realTempRoots().some((root) => real.startsWith(root + path.sep));
}

/**
 * Matches one segment (env prefix already stripped, normalized words) against the check forms of the
 * profile. Returns { form, reason } when a form recognizes the command, or null when none does.
 */
function matchCheckForm(w, allowed) {
  const has = (id) => allowed.includes(id);

  // K8 cd <dir>
  if (w[0] === 'cd') {
    if (w.length !== 2 || w[1].startsWith('-')) return { form: 'K8', reason: "'cd' takes exactly one directory" };
    return { form: 'K8', reason: null };
  }
  // K1 eslint
  if (startsWith(w, ['npx', 'eslint']) || startsWith(w, ['npx', '--no', 'eslint'])) {
    const args = w.slice(w[1] === '--no' ? 3 : 2);
    return { form: 'K1', reason: checkArgs(args, ESLINT_FLAGS, 'eslint') };
  }
  // K2 depcruise
  if (startsWith(w, ['pnpm', 'exec', 'depcruise'])) {
    return { form: 'K2', reason: checkArgs(w.slice(3), DEPCRUISE_FLAGS, 'depcruise') };
  }
  // K3a / K3b pnpm exec vitest
  if (startsWith(w, ['pnpm', 'exec', 'vitest'])) {
    if (w[3] !== 'run') return { form: 'K3', reason: "'vitest' without 'run' starts watch mode" };
    if (w.length === 5 && w[4] === 'test/architecture.test.ts') return { form: 'K3a', reason: null };
    if (!has('K3b')) return { form: 'K3b', reason: 'only the architecture test (pnpm exec vitest run test/architecture.test.ts) is allowed' };
    return { form: 'K3b', reason: checkArgs(w.slice(4), VITEST_FLAGS, 'vitest') };
  }
  // K4 check-contracts
  const script = w[0] === 'bash' ? w[1] : w[0];
  const scriptArgs = w.slice(w[0] === 'bash' ? 2 : 1);
  if (script && (script === 'scripts/check-contracts.sh' || script === './scripts/check-contracts.sh'
    || (script.startsWith('/') && script.endsWith('/scripts/check-contracts.sh')))) {
    return { form: 'K4', reason: scriptArgs.length ? "'check-contracts.sh' takes no arguments" : null };
  }
  // K5 typecheck
  const joined = w.join(' ');
  if (['pnpm typecheck', 'npx -y pnpm@10 typecheck', 'npm run typecheck'].includes(joined)) {
    return { form: 'K5', reason: null };
  }
  // K6 test runners
  if (startsWith(w, ['npx', '-y', 'pnpm@10', 'test'])) {
    return { form: 'K6', reason: checkArgs(w.slice(4), VITEST_FLAGS, 'vitest') };
  }
  if (startsWith(w, ['npx', '-y', 'pnpm@10', 'vitest'])) {
    if (w[4] !== 'run') return { form: 'K6', reason: "'vitest' without 'run' starts watch mode" };
    return { form: 'K6', reason: checkArgs(w.slice(5), VITEST_FLAGS, 'vitest') };
  }
  if (startsWith(w, ['npm', 'test'])) {
    const rest = w.slice(2);
    if (rest.length && rest[0] !== '--') return { form: 'K6', reason: "'npm test' takes vitest args only after '--'" };
    return { form: 'K6', reason: checkArgs(rest.slice(1), VITEST_FLAGS, 'vitest') };
  }
  if (startsWith(w, ['npx', 'vitest'])) {
    if (w[2] !== 'run') return { form: 'K6', reason: "'vitest' without 'run' starts watch mode" };
    return { form: 'K6', reason: checkArgs(w.slice(3), VITEST_FLAGS, 'vitest') };
  }
  // K7 throwaway tsc
  if (startsWith(w, ['npx', 'tsc'])) {
    const args = w.slice(2);
    const pIdx = args.indexOf('-p');
    const file = pIdx >= 0 ? args[pIdx + 1] : undefined;
    const ok = args.length === 3 && args.includes('--noEmit') && file !== undefined
      && file.endsWith('.json') && path.isAbsolute(file) && isUnderTemp(file);
    return { form: 'K7', reason: ok ? null : "'tsc' is allowed only as: npx tsc --noEmit -p <temp-dir tsconfig .json>" };
  }
  return null;
}

/** Returns a reason when the command is not allowed for the profile, otherwise null. */
export function checkCheckCommand(command, profile) {
  const allowed = PROFILES[profile];
  if (!allowed) return `unknown profile '${profile ?? ''}'`;
  const split = splitSegments(command);
  if (split.reason) return split.reason;
  for (const seg of split.segments) {
    const env = stripEnvPrefix(seg);
    if (env.reason) return env.reason;
    const w = words(env.rest).map(normalizeWord);
    const match = matchCheckForm(w, allowed);
    if (match) {
      const formId = match.form === 'K3' ? 'K3b' : match.form;
      if (match.reason) return match.reason;
      if (!allowed.includes(formId) && formId !== 'K3a') return `'${w.slice(0, 3).join(' ')}' is not allowed for ${AGENTS[profile]}`;
      continue;
    }
    const reason = checkReadOnlySegment(seg);
    if (reason) return reason;
  }
  return null;
}

if (isMain(import.meta.url)) {
  const profile = process.argv[2];
  const agent = AGENTS[profile] ?? `unknown profile '${profile ?? ''}'`;
  const checks = profile === 'arch'
    ? 'eslint, depcruise, architecture test, check-contracts'
    : 'eslint, depcruise, architecture test, check-contracts, typecheck, vitest run';
  const msg = (reason) => `${agent} may run only read-only commands and the documented checks (${checks}): ${reason}.`;
  try {
    const input = await readStdinJson();
    if (input.tool_name === 'Bash') {
      const reason = checkCheckCommand(input.tool_input?.command, profile);
      if (reason) deny(msg(reason));
    }
  } catch {
    deny(msg('the hook could not parse the tool call'));
  }
  process.exit(0);
}
