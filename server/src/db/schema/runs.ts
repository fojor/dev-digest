import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, index, primaryKey } from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';
import { skills } from './skills';

// ============================================================ Observability

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  provider: text('provider'),
  model: text('model'),
  durationMs: integer('duration_ms'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  /** USD cost of the run's LLM calls; null = unknown (no usage, unpriced model, legacy row). */
  costUsd: doublePrecision('cost_usd'),
  status: text('status'),
  /** Failure reason when status='failed' (LLM/API error, timeout, quota, …). */
  error: text('error'),
  source: text('source', { enum: ['local', 'ci'] }).notNull().default('local'),
  findingsCount: integer('findings_count'),
  grounding: text('grounding'),
  /** Review score (0-100) for this run; null on failed/cancelled runs. */
  score: integer('score'),
  /** Findings that tripped the agent's gate (severity ≥ ciFailOn). */
  blockers: integer('blockers'),
}, (t) => ({
  // Run history per PR, newest first; SET NULL scan when an agent is deleted.
  prRanAtIdx: index('agent_runs_pr_ran_at_idx').on(t.prId, t.ranAt),
  agentIdx: index('agent_runs_agent_idx').on(t.agentId),
  // Per-agent runs in a time window (skill stats: pull frequency, 30 days).
  agentRanAtIdx: index('agent_runs_agent_ran_at_idx').on(t.agentId, t.ranAt),
}));

/**
 * Which skills a run's prompt contained (M2 Phase 2): the skill version, its
 * position in the Skills section and the tokens of its rendered block. Drives
 * skill pull frequency and maps a finding's `skill` tag to a skill id.
 */
export const runSkills = pgTable(
  'run_skills',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    skillVersion: integer('skill_version').notNull(),
    position: integer('position').notNull(),
    tokens: integer('tokens').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.runId, t.skillId] }),
    skillIdx: index('run_skills_skill_idx').on(t.skillId),
  }),
);

/** Whole trace of one run as a SINGLE jsonb document. */
export const runTraces = pgTable('run_traces', {
  runId: uuid('run_id')
    .primaryKey()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  trace: jsonb('trace').notNull(),
});

export const multiAgentRuns = pgTable('multi_agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
});
