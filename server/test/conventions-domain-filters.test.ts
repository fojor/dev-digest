import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SECRET_PATTERNS,
  GENERIC_SECRET,
  containsSecret,
  dropSecrets,
} from '../src/modules/conventions/domain/secret-filter.js';
import { dropRepeats, doNotRepeatList } from '../src/modules/conventions/domain/dedupe.js';
import {
  SAMPLE_LIMIT,
  LINE_LIMIT,
  TOKEN_BUDGET,
  STORE_LIMIT,
  MODEL_TIMEOUT_MS,
  keepMostConfident,
  truncateLines,
  fitBudget,
  isAllowedStyleConfig,
} from '../src/modules/conventions/domain/policies.js';
import type { AnalysedFile, NormalizedCandidate } from '../src/modules/conventions/domain/types.js';

const cand = (o: Partial<NormalizedCandidate> = {}): NormalizedCandidate => ({
  rule: 'Use the shared API client',
  category: 'api layer',
  evidencePath: 'src/api.ts',
  evidenceSnippet: "import { client } from './client';",
  confidence: 0.5,
  ...o,
});

// Fake credentials are assembled at runtime — never a literal key in git.
const FAKE = {
  anthropic: `sk-ant-${'a1B2'.repeat(8)}`,
  openai: `sk-${'Xy9z'.repeat(10)}`,
  github: `ghp_${'Ab1C'.repeat(10)}`,
  aws: `AKIA${'ABCD1234'.repeat(2)}`,
  generic: `api_key = "${'q1w2e3r4'.repeat(3)}"`,
  pem: ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' '),
};

describe('secret filter (AC-24)', () => {
  it('matches each credential kind', () => {
    for (const v of Object.values(FAKE)) expect(containsSecret(v)).toBe(true);
    expect(containsSecret('const token = getToken();')).toBe(false);
    expect(containsSecret('Use the shared API client')).toBe(false);
  });

  it('drops a candidate whose rule, category or fragment carries a credential', () => {
    const kept = dropSecrets([
      cand({ rule: `Keys look like ${FAKE.anthropic}` }),
      cand({ category: FAKE.aws }),
      cand({ evidenceSnippet: `const k = "${FAKE.github}";` }),
      cand(),
    ]);
    expect(kept.kept).toHaveLength(1);
    expect(kept.discarded).toBe(3);
  });

  it('stays in sync with the pr-self-review checks.mjs patterns', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(here, '../../.claude/skills/pr-self-review/scripts/checks.mjs'),
      'utf8',
    );
    const block = src.slice(src.indexOf('const SECRET_PATTERNS = ['), src.indexOf('];', src.indexOf('const SECRET_PATTERNS = [')));
    const upstream = [...block.matchAll(/,\s*(\/.+\/[a-z]*)\],/g)].map((m) => m[1]);
    expect(upstream.length).toBeGreaterThan(0);
    expect(SECRET_PATTERNS.map((re) => re.toString())).toEqual(upstream);
    const generic = /const GENERIC_SECRET = (\/.+\/[a-z]*);/.exec(src)?.[1];
    expect(GENERIC_SECRET.toString()).toBe(generic);
  });
});

describe('repeat suppression (AC-13)', () => {
  const decided = [
    { rule: 'Errors are shown via   toast', originalRule: 'Errors are surfaced by toast' },
    { rule: 'Use named exports', originalRule: 'Use named exports' },
  ];

  it('drops a candidate equal to the current or original text, ignoring case and whitespace', () => {
    const { kept, discarded } = dropRepeats(
      [
        cand({ rule: 'errors are shown via toast' }),
        cand({ rule: '  ERRORS ARE SURFACED BY\ttoast ' }),
        cand({ rule: 'Errors are surfaced through toasts' }),
      ],
      decided,
    );
    expect(kept.map((c) => c.rule)).toEqual(['Errors are surfaced through toasts']);
    expect(discarded).toBe(2);
  });

  it('do-not-repeat list holds both texts once each', () => {
    expect(doNotRepeatList(decided)).toEqual([
      'Errors are shown via   toast',
      'Errors are surfaced by toast',
      'Use named exports',
    ]);
  });
});

describe('run limits (spec §6)', () => {
  it('limits are the spec numbers', () => {
    expect([SAMPLE_LIMIT, LINE_LIMIT, TOKEN_BUDGET, STORE_LIMIT, MODEL_TIMEOUT_MS]).toEqual([
      12, 400, 40_000, 20, 120_000,
    ]);
  });

  it('keeps the 20 most confident, dropping lowest confidence first', () => {
    const many = Array.from({ length: 25 }, (_, i) => cand({ rule: `r${i}`, confidence: i / 100 }));
    const { kept, discarded } = keepMostConfident(many, 20);
    expect(kept).toHaveLength(20);
    expect(discarded).toBe(5);
    expect(kept.map((c) => c.rule)).not.toContain('r4');
    expect(kept.map((c) => c.rule)).toContain('r5');
  });

  it('truncates a file to 400 lines', () => {
    const long = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    expect(truncateLines(long, 400).split('\n')).toHaveLength(400);
    expect(truncateLines('a\nb', 400)).toBe('a\nb');
  });

  it('drops the lowest-ranked samples whole until under budget; configs and do-not-repeat list kept', () => {
    const f = (path: string, n: number, kind: AnalysedFile['kind'] = 'sample'): AnalysedFile => ({
      path,
      kind,
      content: 'x'.repeat(n),
    });
    const files = [f('a.ts', 100), f('b.ts', 100), f('c.ts', 100), f('.editorconfig', 10, 'config')];
    const count = (s: string) => s.length; // 1 char = 1 token for the test
    const kept = fitBudget(files, 'DNR'.repeat(10), count, 200);
    expect(kept.map((x) => x.path)).toEqual(['a.ts', '.editorconfig']);
    expect(fitBudget(files, '', count, 10_000)).toHaveLength(4);
  });

  it('allow-lists only root style configs', () => {
    for (const p of ['.eslintrc', '.eslintrc.json', 'eslint.config.mjs', 'tsconfig.json', 'tsconfig.base.json', '.prettierrc', '.prettierrc.yaml', 'prettier.config.js', '.editorconfig', 'biome.json']) {
      expect(isAllowedStyleConfig(p)).toBe(true);
    }
    for (const p of ['.env', '.env.local', '.npmrc', '.yarnrc.yml', '.github/workflows/ci.yml', 'packages/a/tsconfig.json', 'package.json', '../tsconfig.json']) {
      expect(isAllowedStyleConfig(p)).toBe(false);
    }
  });
});
