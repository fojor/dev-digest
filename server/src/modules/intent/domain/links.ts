import type { SourceRef } from './types.js';

/**
 * Reference extraction from a PR description. Pure; never fetches.
 * Bare Jira keys (ABC-123) are deliberately not detected: they collide with
 * UTF-8 / SHA-256.
 */

const MAX_PER_KIND = 10;
const DOC_EXT = new Set(['md', 'mdx', 'txt', 'rst', 'adoc']);

/** Trackers that need credentials: recorded as unavailable / auth_required, never fetched. */
const AUTH_TRACKER_HOSTS = ['atlassian.net', 'linear.app', 'notion.so', 'docs.google.com'];

const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+((?:[\w.-]+\/[\w.-]+)?#\d+)/gi;
const URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/gi;
const BARE_ISSUE = /(?<![\w/&#])#(\d+)\b/g;
const MD_LINK_PATH = /\]\(\s*(?![a-z][a-z0-9+.-]*:|#|\/\/)([^)\s]+)\s*\)/gi;
const BARE_DOC_PATH = /(?:^|[\s("'`])((?:\.\/)?[\w.-]+(?:\/[\w.@-]+)+\.(?:md|mdx|txt|rst|adoc))(?=$|[\s)"'`,.;:])/gim;

function parseIssueToken(
  token: string,
  repo: { owner: string; name: string },
): { owner: string; name: string; number: number } | null {
  const m = token.match(/^(?:([\w.-]+)\/([\w.-]+))?#(\d+)$/);
  if (!m) return null;
  const number = Number(m[3]);
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  return { owner: m[1] ?? repo.owner, name: m[2] ?? repo.name, number };
}

/** Relative after stripping one leading `/`, normalized, no `..`, no NUL/newline/`:`, ≤300 chars, doc extension. */
export function isSafeRepoPath(p: string): boolean {
  if (p.length === 0 || p.length > 300) return false;
  if (/[\0\n\r:\\]/.test(p)) return false;
  const rel = p.startsWith('/') ? p.slice(1) : p;
  if (rel.length === 0 || rel.startsWith('/')) return false;
  const segs = rel.split('/');
  if (segs.some((s) => s === '..' || s === '' || s === '.')) return false;
  const ext = rel.includes('.') ? rel.slice(rel.lastIndexOf('.') + 1).toLowerCase() : '';
  return DOC_EXT.has(ext);
}

/** Normalize a doc path candidate (strip `./` and one leading `/`). */
export function normalizeRepoPath(p: string): string {
  let out = p.trim();
  if (out.startsWith('./')) out = out.slice(2);
  if (out.startsWith('/')) out = out.slice(1);
  return out;
}

/** `scheme://host/path` — userinfo, query and fragment stripped. */
export function sanitizeRef(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`.slice(0, 200);
  } catch {
    return '(invalid url)';
  }
}

export function trackerHintFor(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return AUTH_TRACKER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? 'auth_required' : undefined;
  } catch {
    return undefined;
  }
}

/** Plan/spec files changed in the PR (DevDigest conventions). */
const PLAN_DOC_GLOBS = [/^docs\/plans\/.+\.md$/i, /^specs\/.+\.md$/i, /^docs\/features\/.+\.md$/i];

export function changedPlanDocs(paths: string[]): string[] {
  return paths.filter((p) => PLAN_DOC_GLOBS.some((re) => re.test(p)));
}

export function extractReferences(
  body: string,
  repo: { owner: string; name: string },
): SourceRef[] {
  const issues = new Map<string, SourceRef>();
  const docs = new Map<string, SourceRef>();
  const externals = new Map<string, SourceRef>();

  const addIssue = (
    i: { owner: string; name: string; number: number },
    relation: 'closing' | 'referenced',
  ) => {
    const key = `${i.owner}/${i.name}#${i.number}`.toLowerCase();
    const existing = issues.get(key);
    if (existing) {
      if (relation === 'closing' && existing.type === 'issue') existing.relation = 'closing';
      return;
    }
    issues.set(key, { type: 'issue', ...i, relation });
  };
  const addDoc = (path: string) => {
    const p = normalizeRepoPath(path);
    if (!docs.has(p)) docs.set(p, { type: 'repoDoc', path: p, relation: 'linked' });
  };
  const addExternal = (url: string) => {
    const key = sanitizeRef(url);
    if (externals.has(key)) return;
    const hint = trackerHintFor(url);
    externals.set(key, { type: 'external', url, ...(hint ? { trackerHint: hint } : {}) });
  };

  // 1. Closing keywords (before URLs are blanked: `fixes owner/repo#3`).
  for (const m of body.matchAll(CLOSING)) {
    const parsed = parseIssueToken(m[1]!, repo);
    if (parsed) addIssue(parsed, 'closing');
  }

  // 2. URLs; blank them out so bare-#N / path scans don't re-match their insides.
  let rest = body;
  for (const m of body.matchAll(URL_RE)) {
    const raw = m[0].replace(/[.,;:!?]+$/, '');
    rest = rest.replace(m[0], ' ');
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (u.protocol !== 'https:') continue;
    const host = u.hostname.toLowerCase();
    const segs = u.pathname.split('/').filter(Boolean);
    if (host === 'github.com' && segs.length >= 4 && (segs[2] === 'issues' || segs[2] === 'pull')) {
      const number = Number(segs[3]);
      if (Number.isSafeInteger(number) && number > 0) {
        addIssue({ owner: segs[0]!, name: segs[1]!, number }, 'referenced');
      }
      continue;
    }
    if (host === 'github.com' && segs.length >= 5 && segs[2] === 'blob') {
      const [o, n, , gitRef] = segs as [string, string, string, string, ...string[]];
      const path = segs.slice(4).join('/');
      if (o.toLowerCase() === repo.owner.toLowerCase() && n.toLowerCase() === repo.name.toLowerCase()) {
        addDoc(decodeURIComponentSafe(path));
      } else {
        addExternal(`https://raw.githubusercontent.com/${o}/${n}/${gitRef}/${path}`);
      }
      continue;
    }
    if (host === 'github.com') continue; // other GitHub pages are never fetched as HTML
    addExternal(`${u.protocol}//${u.host}${u.pathname}${u.search}`);
  }

  // 3. Bare #N / owner/repo#N → referenced.
  for (const m of rest.matchAll(BARE_ISSUE)) {
    addIssue({ owner: repo.owner, name: repo.name, number: Number(m[1]) }, 'referenced');
  }
  for (const m of rest.matchAll(/(?<![\w/])([\w.-]+)\/([\w.-]+)#(\d+)\b/g)) {
    addIssue({ owner: m[1]!, name: m[2]!, number: Number(m[3]) }, 'referenced');
  }

  // 4. Repo-relative doc paths: markdown links, then bare paths.
  for (const m of rest.matchAll(MD_LINK_PATH)) {
    const target = m[1]!.split('#')[0]!.split('?')[0]!;
    const ext = target.includes('.') ? target.slice(target.lastIndexOf('.') + 1).toLowerCase() : '';
    if (DOC_EXT.has(ext)) addDoc(target);
  }
  for (const m of rest.matchAll(BARE_DOC_PATH)) addDoc(m[1]!);

  const cap = (m: Map<string, SourceRef>) => [...m.values()].slice(0, MAX_PER_KIND);
  return [...cap(issues), ...cap(docs), ...cap(externals)];
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
