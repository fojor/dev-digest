import { z } from 'zod';
import { ConventionPatch } from '@devdigest/shared';

export const RepoParams = z.object({ repoId: z.string().uuid() });
export const ConventionParams = z.object({ conventionId: z.string().uuid() });
/** Only status and rule text are editable (AC-11); trimmed, 1–1000 chars (AC-12). */
export const PatchConventionBody = ConventionPatch;
