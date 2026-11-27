/**
 * M2 — the control-experiment PRs in the demo repo (acme/payments-api). Their
 * diffs live in pr_files patches, so a review runs without a clone (the diff
 * loader falls back to them). Run each review twice — skills off vs on — and
 * compare the findings and the trace's prompt assembly.
 *
 *  #501 Test Quality: a refund validator with four guard branches and a test
 *       that only walks the happy path.
 *  #502 API Contract: a route param rename, a new required query param and a
 *       changed response shape — a breaking change for every client.
 */

export interface ExperimentPr {
  number: number;
  title: string;
  author: string;
  branch: string;
  headSha: string;
  body: string;
  files: { path: string; additions: number; deletions: number; patch: string }[];
}

const REFUND_TS = [
  "import type { Charge } from './types.js';",
  '',
  'export interface RefundRequest {',
  '  amountCents: number;',
  '  currency: string;',
  '}',
  '',
  'export class RefundError extends Error {}',
  '',
  '/** Validate a refund against the original charge; returns the amount to refund. */',
  'export function validateRefund(charge: Charge, req: RefundRequest): number {',
  "  if (charge.status !== 'succeeded') {",
  "    throw new RefundError('Only succeeded charges can be refunded');",
  '  }',
  '  if (req.currency !== charge.currency) {',
  "    throw new RefundError('Currency mismatch');",
  '  }',
  '  if (req.amountCents <= 0) {',
  "    throw new RefundError('Refund amount must be positive');",
  '  }',
  '  const remaining = charge.amountCents - charge.refundedCents;',
  '  if (req.amountCents > remaining) {',
  "    throw new RefundError('Refund exceeds the remaining charge amount');",
  '  }',
  '  return req.amountCents;',
  '}',
];

const REFUND_TEST_TS = [
  "import { describe, it, expect } from 'vitest';",
  "import { validateRefund } from './refund.js';",
  '',
  "describe('validateRefund', () => {",
  "  it('refunds part of a succeeded charge', () => {",
  "    const charge = { id: 'ch_1', status: 'succeeded', currency: 'usd', amountCents: 5000, refundedCents: 0 };",
  "    expect(validateRefund(charge, { amountCents: 2000, currency: 'usd' })).toBe(2000);",
  '  });',
  '});',
];

/** A whole new file as a unified-diff hunk. */
function newFilePatch(lines: string[]): string {
  return [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`)].join('\n');
}

const USERS_ROUTE_PATCH = [
  '@@ -10,12 +10,13 @@',
  ' export async function registerUserRoutes(app: FastifyInstance, users: UsersRepo) {',
  "-  app.get('/users/:id', async (req, reply) => {",
  '-    const user = await users.findById(req.params.id);',
  "+  app.get('/users/:userId', async (req, reply) => {",
  '+    const { include } = req.query as { include: string };',
  "+    const user = await users.findById(req.params.userId, include.split(','));",
  "     if (!user) return reply.code(404).send({ error: 'not_found' });",
  '     return {',
  '       id: user.id,',
  '-      email: user.email,',
  '+      emailAddress: user.email,',
  '       name: user.name,',
  '-      createdAt: user.createdAt,',
  '+      created: user.createdAt.getTime(),',
  '     };',
  '   });',
  ' }',
].join('\n');

export const EXPERIMENT_PRS: ExperimentPr[] = [
  {
    number: 501,
    title: 'Add refund validation',
    author: 'dmytro.k',
    branch: 'feat/refund-validation',
    headSha: 'e501aa01',
    body: 'Validates refunds against the original charge before calling the provider. Covered by a unit test.',
    files: [
      { path: 'src/payments/refund.ts', additions: REFUND_TS.length, deletions: 0, patch: newFilePatch(REFUND_TS) },
      {
        path: 'src/payments/refund.test.ts',
        additions: REFUND_TEST_TS.length,
        deletions: 0,
        patch: newFilePatch(REFUND_TEST_TS),
      },
    ],
  },
  {
    number: 502,
    title: 'Tidy the user lookup route',
    author: 'olena.s',
    branch: 'chore/user-route-naming',
    headSha: 'e502bb02',
    body: 'Renames the route param for consistency with the other routes and tidies the response fields.',
    files: [{ path: 'src/api/routes/users.ts', additions: 5, deletions: 4, patch: USERS_ROUTE_PATCH }],
  },
];
