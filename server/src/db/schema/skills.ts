import { pgTable, uuid, text, integer, boolean, jsonb, primaryKey, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';

export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull(),
  type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }).notNull(),
  source: text('source', {
    // 'imported' = uploaded .md / .zip (M2); 'imported_url' is reserved.
    enum: ['manual', 'imported', 'imported_url', 'extracted', 'community'],
  }).notNull(),
  body: text('body').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  version: integer('version').notNull().default(1),
  evidenceFiles: jsonb('evidence_files').$type<string[]>(),
  createdAt: now(),
}, (t) => ({
  // Skill list per workspace (Skills page, agent Skills tab).
  wsIdx: index('skills_ws_idx').on(t.workspaceId),
}));

export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    // Full snapshot (M2 Phase 2). Null on rows written before it — the UI falls
    // back to the skill's current fields and shows the note as "—".
    name: text('name'),
    description: text('description'),
    type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }),
    note: text('note'),
    kind: text('kind', { enum: ['create', 'edit', 'import', 'restore'] }),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);
