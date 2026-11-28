import type { Finding } from '@devdigest/shared';

/**
 * Scope policy: drops out-of-scope noise after grounding. Pure + deterministic.
 * `out_of_scope` tags are attacker-influenced (the PR author writes the
 * description), so protected findings are never dropped, collapsed or downgraded.
 */

export interface ScopeOutcome {
  enabled: boolean;
  filtered: { finding: Finding; reason: 'out_of_scope' | 'collapsed' }[];
  collapsedCount: number;
  summary: string;
}

const SEVERITY_RANK: Record<Finding['severity'], number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

function isProtected(f: Finding): boolean {
  return (
    f.category === 'security' || f.kind === 'secret_leak' || f.kind === 'lethal_trifecta'
  );
}

function isSerious(f: Finding): boolean {
  return f.severity === 'CRITICAL' || (f.category === 'bug' && f.severity === 'WARNING');
}

function compareSerious(a: Finding, b: Finding): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    b.confidence - a.confidence ||
    (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
    a.start_line - b.start_line ||
    (a.title < b.title ? -1 : a.title > b.title ? 1 : 0)
  );
}

export function applyScopePolicy(
  findings: Finding[],
  opts: { enabled: boolean },
): { kept: Finding[] } & ScopeOutcome {
  if (!opts.enabled) {
    return {
      kept: findings.map((f) => ({ ...f, scope: null })),
      enabled: false,
      filtered: [],
      collapsedCount: 0,
      summary: 'Scope filter off: no findings dropped',
    };
  }
  const filtered: ScopeOutcome['filtered'] = [];
  const serious: Finding[] = [];
  const drop = new Set<Finding>();
  for (const f of findings) {
    if (f.scope !== 'out_of_scope' || isProtected(f)) continue;
    if (isSerious(f)) serious.push(f);
    else {
      drop.add(f);
      filtered.push({ finding: f, reason: 'out_of_scope' });
    }
  }

  const replace = new Map<Finding, Finding>();
  let collapsedCount = 0;
  if (serious.length > 0) {
    const sorted = [...serious].sort(compareSerious);
    const [keep, ...rest] = sorted as [Finding, ...Finding[]];
    let note = "_Out of scope for this PR's stated intent._";
    if (rest.length > 0) {
      const list = rest.map((r) => `${r.title} (${r.file}:${r.start_line})`).join('; ');
      note =
        `_Out of scope for this PR's stated intent. ${rest.length} more serious out-of-scope ` +
        `issue(s) collapsed into this signal: ${list}_`;
    }
    replace.set(keep, { ...keep, rationale: `${keep.rationale}\n\n${note}` });
    for (const r of rest) {
      drop.add(r);
      filtered.push({ finding: r, reason: 'collapsed' });
    }
    collapsedCount = rest.length;
  }

  const kept = findings.filter((f) => !drop.has(f)).map((f) => replace.get(f) ?? f);
  const dropped = filtered.filter((x) => x.reason === 'out_of_scope').length;
  return {
    kept,
    enabled: true,
    filtered,
    collapsedCount,
    summary: `Scope filter: ${dropped} dropped, ${collapsedCount} collapsed, ${kept.length} kept`,
  };
}
