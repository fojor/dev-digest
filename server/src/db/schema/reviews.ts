import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, index } from 'drizzle-orm/pg-core';
import type { IntentSource } from '@devdigest/shared';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { skills } from './skills';

// ============================================================ Review & findings

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id'),
  /** The agent_run that produced this review (links the timeline run ↔ review). */
  runId: uuid('run_id'),
  kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
  verdict: text('verdict'),
  summary: text('summary'),
  score: integer('score'),
  model: text('model'),
  createdAt: now(),
}, (t) => ({
  // FK/lookup indexes (improvement plan D1): reviews per PR, by run.
  prIdx: index('reviews_pr_idx').on(t.prId),
  runIdx: index('reviews_run_idx').on(t.runId),
}));

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  file: text('file').notNull(),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  suggestion: text('suggestion'),
  confidence: doublePrecision('confidence').notNull(),
  kind: text('kind').notNull().default('finding'),
  trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  // The skill whose rule produced the finding (model-tagged, validated against
  // the run's run_skills); null = unattributed. Survives as null if the skill is deleted.
  skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
  /** Scope tag from the intent layer: 'in_scope' | 'out_of_scope' | null (untagged). */
  scope: text('scope'),
}, (t) => ({
  // Findings are loaded per review (IN list) and cascade-deleted with it.
  reviewIdx: index('findings_review_idx').on(t.reviewId),
  skillIdx: index('findings_skill_idx').on(t.skillId),
}));

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  // Intent layer (M3). `intent` holds the summary text; failed attempts store ''.
  status: text('status').notNull().default('ok'),
  error: text('error'),
  confidence: text('confidence').notNull().default('low'),
  confidenceReasons: jsonb('confidence_reasons').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  sources: jsonb('sources').$type<IntentSource[]>().notNull().default(sql`'[]'::jsonb`),
  promptComponents: jsonb('prompt_components')
    .$type<Record<string, number>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  headSha: text('head_sha'),
  inputHash: text('input_hash'),
  provider: text('provider'),
  model: text('model'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  costUsd: doublePrecision('cost_usd'),
  classifiedAt: timestamp('classified_at', { withTimezone: true }).notNull().defaultNow(),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
