/**
 * M2 — skills seeded for the Test Quality Reviewer, in prompt order. Text only:
 * a skill is markdown that is appended to the agent's prompt, never executed.
 * The DB row is the source of truth at run time; editing here only affects
 * freshly seeded workspaces. The API-contract skill is NOT seeded — it is the
 * import sample in docs/skills/api-contract-guard (import it through the UI).
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
}

export const TEST_QUALITY_SKILLS: SeedSkill[] = [
  {
    name: 'untested-branches',
    description:
      'Flag every new branch, guard, early return or error path in production code that no test in the diff executes.',
    type: 'rubric',
    body: `# Untested branches

For each production function the diff adds or changes:

1. List its branches: every \`if\` / \`else\`, \`switch\` case, ternary, early
   \`return\`, \`throw\`, \`catch\`, and \`??\` / \`||\` fallback.
2. For each branch, find a test in the diff whose input reaches it AND asserts
   the outcome (the return value, the thrown error, the side effect).
3. Report every branch with no such test as a finding anchored on that branch's
   line. Name the input that would reach it.

Tests that only call the function with valid, "happy" input cover none of the
guard and error branches — report those branches even when a test file exists.

Severity: WARNING by default; CRITICAL when the untested branch protects money,
data integrity, authorization or input validation.`,
  },
  {
    name: 'boundary-cases',
    description:
      'Check that tests exercise the edges of every new input: empty, zero, negative, limits, equality, null and unusual formats.',
    type: 'rubric',
    body: `# Boundary and corner cases

For each new input the change accepts (argument, request field, config value),
check the tests for:

- **Empty / missing:** \`''\`, \`[]\`, \`{}\`, \`null\`, \`undefined\`, an absent field.
- **Numeric edges:** \`0\`, negative values, the exact limit (\`=== max\`), one
  past it, very large values, non-integers where an integer is expected.
- **Equality edges:** \`<\` vs \`<=\` comparisons — test the value that sits exactly
  on the comparison.
- **Formats:** unicode, whitespace-only strings, case differences, other
  currencies / time zones / locales when the code handles them.
- **Collections:** one element, duplicates, the max page size.

Report a missing boundary as a finding on the production line with the
comparison or guard, naming the boundary value that is never tested.`,
  },
  {
    name: 'mock-discipline',
    description:
      'Flag tests that mock the unit under test or so much of its collaborators that the assertion no longer checks real behaviour.',
    type: 'convention',
    body: `# Mock discipline

Flag a test when:

- It mocks the function or module it claims to test.
- It only asserts that a mock was called (\`toHaveBeenCalled\`) and never checks
  the result the user of the code sees.
- A mock returns a hard-coded value that makes the asserted branch trivially
  true (the test would pass with the production code deleted).
- Pure logic (no I/O) is mocked instead of called directly.

Prefer fakes for ports (in-memory repositories) and real calls for pure
functions. Mock only real boundaries: network, clock, filesystem, LLM.`,
  },
  {
    name: 'flaky-test-signals',
    description:
      'Flag test patterns that pass or fail by timing, order or environment instead of by the code under test.',
    type: 'custom',
    body: `# Flaky test signals

Flag tests that depend on:

- **Real time:** \`Date.now()\`, \`new Date()\`, timers or \`setTimeout\` sleeps
  without fake timers; assertions on "now".
- **Randomness:** \`Math.random()\`, random ids or ordering without a seed.
- **Order:** shared mutable state between tests, tests that rely on running
  after another test, unsorted results compared to a fixed array.
- **Environment:** real network calls, the local timezone or locale, absolute
  paths, ports that may be taken.
- **Async races:** missing \`await\`, assertions before the promise settles,
  polling without a timeout.

Anchor the finding on the test line and name the source of nondeterminism.`,
  },
];
