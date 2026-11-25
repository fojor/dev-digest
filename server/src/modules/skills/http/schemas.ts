import { z } from 'zod';
import { SkillType } from '@devdigest/shared';

const Name = z.string().trim().min(1).max(100);
const Description = z.string().trim().max(1000);
const Body = z.string().min(1).max(50_000);

export const CreateSkillBody = z.object({
  name: Name,
  description: Description,
  type: SkillType,
  body: Body,
  enabled: z.boolean().optional(),
  /** 'imported' when saved from the import preview; manual otherwise. */
  source: z.enum(['manual', 'imported']).optional(),
  /** Import save: the file the core came from (recorded in the version note). */
  source_file: z.string().trim().max(255).optional(),
});
export type CreateSkillBody = z.infer<typeof CreateSkillBody>;

export const UpdateSkillBody = z.object({
  name: Name.optional(),
  description: Description.optional(),
  type: SkillType.optional(),
  body: Body.optional(),
  enabled: z.boolean().optional(),
  /** "What changed?" — the version note; empty → an auto note from the diff. */
  note: z.string().max(200).optional(),
});
export type UpdateSkillBody = z.infer<typeof UpdateSkillBody>;

/**
 * An uploaded skill file. Sent as base64 JSON (the client reads the File) so
 * no multipart plugin is needed; ~700 KB of base64 fits the 1 MB body limit
 * for the 512 KB upload cap.
 */
export const ImportPreviewBody = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1).max(720_000).regex(/^[A-Za-z0-9+/=\s]+$/),
});
export type ImportPreviewBody = z.infer<typeof ImportPreviewBody>;

/** Draft fields the editor counts tokens for (body may be empty while typing). */
export const SkillTokensBody = z.object({
  name: z.string().max(100),
  description: z.string().max(1000),
  body: z.string().max(50_000),
});
export type SkillTokensBody = z.infer<typeof SkillTokensBody>;

export const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().min(1),
});
export type VersionParams = z.infer<typeof VersionParams>;
