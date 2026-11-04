import { z } from 'zod';

const uuid = z.string().uuid();
const t = (max: number) => z.string().trim().max(max);
const text = (max: number) => t(max).default('');

export const idParam = z.object({ id: uuid });
export const slugParam = z.object({ slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9-]+$/) });

// ---- page content (plain text only: the website shows it as text, never as HTML) ----
const titled = z.object({ title: t(120), text: t(600) });
export const contentSchemas = {
  contact: z.object({
    phone: t(30), whatsapp: t(30), officeHours: t(200),
    email: t(120).refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email address'),
    mapQuery: t(200).min(3, 'Enter the address to show on the map'),
  }),
  home: z.object({ heroTitle: t(120).min(1), heroSubtitle: t(300), intro: t(1200), highlights: z.array(titled).max(6) }),
  about: z.object({
    overview: t(4000), mission: t(1500), vision: t(1500), philosophy: t(3000),
    values: z.array(titled).max(10), leadership: z.array(z.object({ name: t(120), role: t(120), bio: t(1500) })).max(12),
  }),
  academics: z.object({ intro: t(1500), curriculum: t(4000), programmes: t(4000) }),
  admissions: z.object({ intro: t(3000), requirements: z.array(t(300)).max(20), process: t(3000), openNote: t(600) }),
} as const;

// ---- posts, events, facilities, gallery ----
const postBody = z.object({
  kind: z.enum(['news', 'announcement']), title: t(200).min(3, 'Enter a title'), summary: t(400), body: t(20000),
  imageId: uuid.nullable(), imageAlt: t(200), status: z.enum(['draft', 'published']), pinned: z.boolean(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
});
export const createPostSchema = postBody.extend({ summary: postBody.shape.summary.default(''), body: postBody.shape.body.default(''), imageId: postBody.shape.imageId.default(null),
  imageAlt: postBody.shape.imageAlt.default(''), status: postBody.shape.status.default('draft'), pinned: postBody.shape.pinned.default(false), expiresAt: postBody.shape.expiresAt.default(null) })
  .refine((v) => !v.imageId || v.imageAlt.length > 0, { message: 'Describe the picture for visitors who cannot see it', path: ['imageAlt'] });
export const updatePostSchema = postBody.partial();
export const listPostsQuery = z.object({ kind: z.enum(['news', 'announcement']).optional(), status: z.enum(['draft', 'published']).optional() });

const eventBody = z.object({
  title: t(200).min(3, 'Enter a title'), description: t(5000), location: t(200),
  startsAt: z.string().datetime({ offset: true, message: 'Enter a valid date and time' }), endsAt: z.string().datetime({ offset: true }).nullable(), status: z.enum(['draft', 'published']),
});
export const createEventSchema = eventBody.extend({ description: eventBody.shape.description.default(''), location: eventBody.shape.location.default(''), endsAt: eventBody.shape.endsAt.default(null), status: eventBody.shape.status.default('draft') })
  .refine((v) => !v.endsAt || v.endsAt >= v.startsAt, { message: 'The end cannot be before the start', path: ['endsAt'] });
export const updateEventSchema = eventBody.partial();

const facilityBody = z.object({ category: t(80).min(2, 'Enter a category'), name: t(120).min(2, 'Enter a name'), description: t(2000), sortOrder: z.number().int().min(0).max(9999), status: z.enum(['draft', 'published']) });
export const createFacilitySchema = facilityBody.extend({ description: facilityBody.shape.description.default(''), sortOrder: facilityBody.shape.sortOrder.default(0), status: facilityBody.shape.status.default('draft') });
export const updateFacilitySchema = facilityBody.partial();

const galleryBody = z.object({ facilityId: uuid.nullable(), fileId: uuid, caption: t(300), altText: t(300).min(3, 'Describe the picture for visitors who cannot see it'), status: z.enum(['draft', 'published']), sortOrder: z.number().int().min(0).max(9999) });
export const createGallerySchema = galleryBody.extend({ facilityId: galleryBody.shape.facilityId.default(null), caption: galleryBody.shape.caption.default(''), status: galleryBody.shape.status.default('draft'), sortOrder: galleryBody.shape.sortOrder.default(0) });
export const updateGallerySchema = galleryBody.omit({ fileId: true }).partial();

// ---- public forms ----
const phone = z.string().trim().regex(/^[0-9+()\-\s]{7,20}$/, 'Enter a phone number, for example 0803 000 0000');
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const consent = z.literal(true, { message: 'Please tick the box to agree' });
const honeypot = z.string().max(200).optional(); // a field real visitors never see; bots fill it in

export const applySchema = z.object({
  firstName: t(80).min(1, 'Enter the first name'), lastName: t(80).min(1, 'Enter the last name'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD').refine((d) => {
    const age = (Date.now() - new Date(d).getTime()) / (365.25 * 864e5);
    return age >= 5 && age <= 25;
  }, 'Check the date of birth'),
  classStage: z.enum(['JSS', 'SSS']), classYear: z.number().int().min(1).max(3),
  previousSchool: t(200).optional(), guardianName: t(120).min(2, 'Enter the guardian\'s name'), guardianPhone: phone, guardianEmail: email,
  address: t(300).optional(), message: t(2000).optional(), consent, website: honeypot,
});
export const statusLookupSchema = z.object({ reference: z.string().trim().toUpperCase().regex(/^KOK-APP-\d{6}$/, 'Enter the reference from your confirmation, like KOK-APP-000123'), email });
export const contactSchema = z.object({
  name: t(120).min(2, 'Enter your name'), email, phone: phone.optional().or(z.literal('').transform(() => undefined)),
  subject: t(150).min(3, 'Enter a subject'), message: t(3000).min(10, 'Write a little more'), consent, website: honeypot,
});

export const publicListQuery = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(9) });
export const eventsQuery = z.object({ when: z.enum(['upcoming', 'past']).default('upcoming') });

// ---- admin: enquiries ----
export const appListQuery = z.object({ status: z.enum(['received', 'under_review', 'interview', 'offered', 'declined', 'withdrawn']).optional(), q: t(100).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export const appStatusSchema = z.object({ status: z.enum(['received', 'under_review', 'interview', 'offered', 'declined', 'withdrawn']), publicNote: t(500).optional(), adminNote: t(1000).optional() });
export const messageListQuery = z.object({ status: z.enum(['new', 'read', 'archived']).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export const messageStatusSchema = z.object({ status: z.enum(['new', 'read', 'archived']) });
