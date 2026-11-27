#!/usr/bin/env node
// Writes a video's status into its scenario file, under its "## Video N" heading.
//
//   node mark.mjs <scenario.md> <N> recorded <video.mp4>
//   node mark.mjs <scenario.md> <N> failed "<short reason>"
//   node mark.mjs <scenario.md> <N> pending
//   node mark.mjs <scenario.md> --list            # print every video's status
//
// The status is one line right below the heading:
//   **Status:** ✅ recorded 2026-11-27 · [01-skills.mp4](../../demo/lab-02/01-skills.mp4) · 47 s
//   **Status:** ❌ failed 2026-11-27 — step 9: "Agent runs" not found
//   **Status:** ⏳ not recorded
// An existing status line is replaced; a missing one is inserted.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, basename } from 'node:path';

const [file, nArg, state, extra] = process.argv.slice(2);
if (!file || !nArg) {
  console.error('usage: node mark.mjs <scenario.md> <N> recorded|failed|pending [video.mp4 | reason]\n       node mark.mjs <scenario.md> --list');
  process.exit(2);
}
const text = readFileSync(file, 'utf8');
const lines = text.split('\n');
const HEADING = /^## Video (\d+)\b/;
const STATUS = /^\*\*Status:\*\*/;

if (nArg === '--list') {
  let current = null;
  for (const l of lines) {
    const h = l.match(HEADING);
    if (h) { if (current) console.log(`${current}  ⏳ not recorded`); current = l.replace(/^## /, ''); continue; }
    if (current && STATUS.test(l)) { console.log(`${current}  ${l.replace(STATUS, '').trim()}`); current = null; }
    else if (current && l.startsWith('## ')) { console.log(`${current}  ⏳ not recorded`); current = null; }
  }
  if (current) console.log(`${current}  ⏳ not recorded`);
  process.exit(0);
}

const n = Number(nArg);
const start = lines.findIndex((l) => l.match(HEADING)?.[1] === String(n));
if (start < 0) {
  console.error(`no "## Video ${n}" heading in ${file}`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
if (end < 0) end = lines.length;

const today = new Date().toISOString().slice(0, 10);
let status;
if (state === 'recorded') {
  if (!extra || !existsSync(extra)) {
    console.error(`video file not found: ${extra}`);
    process.exit(1);
  }
  const link = relative(dirname(resolve(file)), resolve(extra));
  let dur = '';
  try {
    const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', extra], { encoding: 'utf8' });
    dur = ` · ${Math.round(Number(s))} s`;
  } catch { /* ffprobe missing: no duration */ }
  status = `**Status:** ✅ recorded ${today} · [${basename(extra)}](${link})${dur}`;
} else if (state === 'failed') {
  status = `**Status:** ❌ failed ${today}${extra ? ` — ${extra}` : ''}`;
} else if (state === 'pending') {
  status = '**Status:** ⏳ not recorded';
} else {
  console.error(`unknown state "${state}" (recorded | failed | pending)`);
  process.exit(2);
}

const at = lines.slice(start + 1, end).findIndex((l) => STATUS.test(l));
if (at >= 0) lines[start + 1 + at] = status;
else lines.splice(start + 1, 0, '', status);
writeFileSync(file, lines.join('\n'));
console.log(`Video ${n}: ${status.replace(STATUS, '').trim()}`);
