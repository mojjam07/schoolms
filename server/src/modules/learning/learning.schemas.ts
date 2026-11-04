import { z } from 'zod';
import { parseYouTubeId } from '../../utils/youtube';

const uuid = z.string().uuid();
export const idParam = z.object({ id: uuid });
const text = (max: number) => z.string().trim().max(max);

// Update schemas are built from fields WITHOUT defaults: a field left out of an update must stay as it is.
const noteFields = z.object({
  classId: uuid, subjectId: uuid,
  title: text(200).min(1, 'Enter a title'),
  topic: text(120).optional(),
  body: text(20000),
  status: z.enum(['draft', 'published', 'archived']),
  fileIds: z.array(uuid).max(10),
});
export const createNoteSchema = noteFields.extend({
  body: noteFields.shape.body.default(''),
  status: noteFields.shape.status.default('draft'),
  fileIds: noteFields.shape.fileIds.default([]),
});
export const updateNoteSchema = noteFields.partial();

const videoFields = z.object({
  classId: uuid, subjectId: uuid,
  title: text(200).min(1, 'Enter a title'),
  topic: text(120).optional(),
  description: text(2000),
  instructions: text(2000),
  url: z.string().trim().max(500).refine((u) => !!parseYouTubeId(u), 'Paste a YouTube video link, for example https://www.youtube.com/watch?v=...'),
  status: z.enum(['draft', 'published']),
});
export const createVideoSchema = videoFields.extend({
  description: videoFields.shape.description.default(''),
  instructions: videoFields.shape.instructions.default(''),
  status: videoFields.shape.status.default('draft'),
});
export const updateVideoSchema = videoFields.partial();

export const myListSchema = z.object({ status: z.enum(['draft', 'published', 'archived']).optional(), classId: uuid.optional() });
export const learningQuery = z.object({ subjectId: uuid.optional(), q: text(100).optional() });

export const uploadQuery = z.object({ purpose: z.enum(['resource', 'assignment', 'submission', 'public']).optional() });
