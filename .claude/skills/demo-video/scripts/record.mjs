#!/usr/bin/env node
// Demo video runner: executes a steps file with agent-browser in its own Chrome session
// and records it to an .mp4 with paced pauses, captions and click ripples.
//
//   node record.mjs <steps.json> [--dry-run] [--headed] [--keep-open] [--out <file.mp4>]
//
// --dry-run   run every step with short pauses and no recording (checks locators fast)
// --headed    show the Chrome window while it runs
// --keep-open leave the browser session open at the end (for debugging a failed step)
// --out       output path (default: the steps file's "output", else <steps dir>/<steps name>.mp4)
//
// Layout: one folder per scenario — demo/<scenario>/NN-name.steps.json → NN-name.mp4,
// NN-name.sheet.png (contact sheet), NN-name.failed.png (on failure).
//
// Step schema: ../references/steps.md. Exit code 1 + the failing step on any error.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const BIN = process.env.AGENT_BROWSER_BIN ?? 'agent-browser';
const SESSION = 'demo-video';

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const stepsPath = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');
if (!stepsPath) {
  console.error('usage: node record.mjs <steps.json> [--dry-run] [--headed] [--keep-open] [--out <file.mp4>]');
  process.exit(2);
}
const DRY = flag('--dry-run');
const spec = JSON.parse(readFileSync(stepsPath, 'utf8'));
const fromRoot = (p) => (isAbsolute(p) ? p : join(ROOT, p));
const baseUrl = (spec.baseUrl ?? 'http://localhost:3000').replace(/\/$/, '');
const pace = { afterAction: 1200, beforeClick: 600, caption: 2500, ...(spec.pace ?? {}) };
// Default: next to the steps file — demo/<scenario>/<NN-name>.steps.json → demo/<scenario>/<NN-name>.mp4
const stepsDir = dirname(resolve(stepsPath));
const output = opt('--out') || spec.output
  ? fromRoot(opt('--out') ?? spec.output)
  : join(stepsDir, `${basename(stepsPath).replace(/(\.steps)?\.json$/, '')}.mp4`);
const [vw, vh] = spec.viewport ?? [1440, 900];
const DEFAULT_TIMEOUT = spec.timeout ?? 15000;

// ---------- agent-browser ----------
const env = {
  ...process.env,
  AGENT_BROWSER_SESSION: SESSION,
  AGENT_BROWSER_INIT_SCRIPTS: join(HERE, 'overlay.js'),
  ...(flag('--headed') ? { AGENT_BROWSER_HEADED: '1' } : {}),
};

function ab(args, { timeout = 120000 } = {}) {
  const r = spawnSync(BIN, args, { env, cwd: ROOT, encoding: 'utf8', timeout });
  if (r.status !== 0) {
    const msg = `${(r.stderr || '').trim()} ${(r.stdout || '').trim()}`.trim();
    throw new Error(`agent-browser ${args.join(' ')} → ${msg || `exit ${r.status}`}`);
  }
  return r.stdout ?? '';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wait = (ms) => sleep(DRY ? Math.min(ms, 150) : ms);

/** Retry a command until it succeeds or the timeout passes (find does not wait for elements). */
async function retry(args, timeout = DEFAULT_TIMEOUT) {
  const until = Date.now() + timeout;
  for (;;) {
    try {
      return ab(args);
    } catch (e) {
      if (Date.now() > until) throw e;
      await sleep(400);
    }
  }
}

/** Locator → agent-browser args for an action. Locator: "text" | {role,name,exact} | {text|label|placeholder|testid|title|alt} | {css}. */
function locate(loc, action, value) {
  const extra = value === undefined ? [] : [value];
  if (typeof loc === 'string') return ['find', 'text', loc, action, ...extra];
  if (loc.css) return action === 'fill' ? ['fill', loc.css, value] : [action, loc.css, ...extra];
  const exact = loc.exact ? ['--exact'] : [];
  if (loc.role) return ['find', 'role', loc.role, action, ...extra, ...(loc.name ? ['--name', loc.name] : []), ...exact];
  for (const k of ['text', 'label', 'placeholder', 'testid', 'title', 'alt']) {
    if (loc[k]) return ['find', k, loc[k], action, ...extra, ...exact];
  }
  throw new Error(`bad locator: ${JSON.stringify(loc)}`);
}

const js = (code) => ab(['eval', '-b', Buffer.from(code).toString('base64')]);
const url = (u) => (/^https?:/.test(u) ? u : `${baseUrl}${u.startsWith('/') ? '' : '/'}${u}`);

// ---------- recording (segments, so offCamera steps can be cut) ----------
const segDir = join(dirname(output), `.segments-${basename(output, '.mp4')}`);
const segments = [];
let recording = false;
function recStart() {
  if (DRY || recording) return;
  const seg = join(segDir, `seg-${String(segments.length).padStart(3, '0')}.mp4`);
  ab(['record', 'start', seg, '--cursor']);
  segments.push(seg);
  recording = true;
}
function recStop() {
  if (DRY || !recording) return;
  ab(['record', 'stop']);
  recording = false;
}

// ---------- steps ----------
/** Dry run of a step that changes data: only check that its target is there, do not act. */
async function probeSideEffect(s) {
  const t = s.timeout ?? DEFAULT_TIMEOUT;
  const target = s.click ?? s.fill ?? s.type;
  if (target !== undefined) await retry(locate(target, 'hover'), t);
  else if (s.upload !== undefined) {
    for (const f of (s.files ?? []).map(fromRoot)) if (!existsSync(f)) throw new Error(`upload file not found: ${f}`);
    await retry(['wait', s.upload, '--state', 'attached'], t);
  }
}

async function runStep(s) {
  const t = s.timeout ?? DEFAULT_TIMEOUT;
  if (DRY && s.sideEffect) return probeSideEffect(s);
  if (s.open !== undefined) {
    ab(['open', url(s.open)]);
    if (s.waitText) await retry(['wait', '--text', s.waitText], t);
  } else if (s.waitText !== undefined) {
    ab(['wait', '--text', s.waitText], { timeout: t + 5000 });
  } else if (s.waitUrl !== undefined) {
    ab(['wait', '--url', s.waitUrl], { timeout: t + 5000 });
  } else if (s.click !== undefined) {
    try { await retry(locate(s.click, 'hover'), t); } catch { /* hover is cosmetic */ }
    await wait(pace.beforeClick);
    await retry(locate(s.click, 'click'), t);
  } else if (s.hover !== undefined) {
    await retry(locate(s.hover, 'hover'), t);
  } else if (s.fill !== undefined) {
    await retry(locate(s.fill, 'fill', s.value ?? ''), t);
  } else if (s.type !== undefined) {
    await retry(locate(s.type, 'click'), t);
    ab(['keyboard', 'type', s.value ?? '']);
  } else if (s.press !== undefined) {
    ab(['press', s.press]);
  } else if (s.upload !== undefined) {
    const files = (s.files ?? []).map(fromRoot);
    for (const f of files) if (!existsSync(f)) throw new Error(`upload file not found: ${f}`);
    await retry(['upload', s.upload, ...files], t);
  } else if (s.scroll !== undefined) {
    ab(['scroll', s.scroll, String(s.px ?? 400)]);
  } else if (s.scrollTo !== undefined) {
    await retry(locate(s.scrollTo, 'hover'), t);
  } else if (s.caption !== undefined) {
    js(`window.__demo && window.__demo.caption(${JSON.stringify(s.caption)})`);
    await wait(s.hold ?? pace.caption);
    return;
  } else if (s.captionClear) {
    js('window.__demo && window.__demo.clear()');
  } else if (s.pause !== undefined) {
    await wait(s.pause);
    return;
  } else {
    throw new Error(`unknown step: ${JSON.stringify(s)}`);
  }
  await wait(s.hold ?? pace.afterAction);
}

function describe(s) {
  return s.label ?? JSON.stringify(s).slice(0, 110);
}

// ---------- main ----------
async function main() {
  for (const tool of [BIN, 'ffmpeg']) {
    if (spawnSync('which', [tool]).status !== 0) throw new Error(`${tool} not found on PATH`);
  }
  try {
    const res = await fetch(baseUrl);
    if (!res.ok && res.status >= 500) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    throw new Error(`app is not reachable at ${baseUrl} (${e.message}) — start the stack first`);
  }

  try { ab(['close']); } catch { /* no session yet */ }
  if (!DRY) {
    rmSync(segDir, { recursive: true, force: true });
    mkdirSync(segDir, { recursive: true });
  }
  ab(['set', 'viewport', String(vw), String(vh)]);
  if (spec.colorScheme) ab(['set', 'media', spec.colorScheme]);
  ab(['open', url(spec.start ?? '/')]);
  if (spec.startWaitText) await retry(['wait', '--text', spec.startWaitText]);
  await sleep(500);

  console.log(`${DRY ? 'DRY RUN' : 'RECORDING'} ${spec.title ?? stepsPath} → ${DRY ? '(no file)' : output}`);
  recStart();
  const steps = spec.steps ?? [];
  let skippedEffect = 0; // dry run: index+1 of the first side-effect step that was only probed
  const unverified = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const label = `${String(i + 1).padStart(2)}/${steps.length} ${describe(s)}`;
    try {
      if (s.offCamera) recStop();
      await runStep(s);
      if (s.offCamera) recStart();
      if (DRY && s.sideEffect) {
        skippedEffect ||= i + 1;
        console.log(`  ~ ${label}  (side effect: target found, not executed)`);
      } else {
        console.log(`  ✓ ${label}`);
      }
    } catch (e) {
      if (DRY && skippedEffect) {
        // This step may need the result of a side effect the dry run did not perform.
        unverified.push(i + 1);
        console.log(`  ? ${label}  (unverified after step ${skippedEffect}: ${e.message.split('\n')[0].slice(0, 140)})`);
        continue;
      }
      console.error(`  ✗ ${label}\n    ${e.message}`);
      const shot = output.replace(/\.mp4$/, '.failed.png');
      try { ab(['screenshot', shot]); console.error(`    screenshot: ${relative(ROOT, shot)}`); } catch {}
      recStop();
      if (!flag('--keep-open')) try { ab(['close']); } catch {}
      process.exit(1);
    }
  }
  await wait(pace.afterAction);
  recStop();
  if (!flag('--keep-open')) ab(['close']);
  if (DRY) {
    console.log(unverified.length
      ? `dry run OK, but steps ${unverified.join(', ')} could not be checked without the side effects — watch them in the recording`
      : 'dry run OK');
    return;
  }

  mkdirSync(dirname(output), { recursive: true });
  const parts = segments.filter((f) => existsSync(f));
  if (parts.length === 1) {
    renameSync(parts[0], output);
  } else {
    const list = join(segDir, 'list.txt');
    writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', output]);
  }
  rmSync(segDir, { recursive: true, force: true });

  // Contact sheet: one frame every 3 s, for a quick visual check without watching the video.
  const sheet = output.replace(/\.mp4$/, '.sheet.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', output, '-vf', 'fps=1/3,scale=480:-1,tile=4x6', '-frames:v', '1', sheet]);
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', output], { encoding: 'utf8' }).trim();
  console.log(`saved ${output} (${Number(dur).toFixed(1)} s, ${parts.length} segment(s))\ncontact sheet ${sheet}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
