import crypto from 'crypto';
import { pool, query, withTransaction, Queryable } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { fmtLagos } from '../../utils/dates';
import { SCHOOL } from '../../config/school';
import { audit } from '../../services/audit';
import { storage } from '../../services/storage';
import { deleteIfOrphaned } from '../learning/files.service';
import { notifyUsers, safely } from '../notifications/notifications.service';
import { DEFAULTS, findPlaceholders, SECTIONS, type Section, type SiteContent } from './site.defaults';

type Ctx = { actorId: string; ip?: string };
const notFound = (w: string) => new AppError(404, `${w} not found`, 'NOT_FOUND');

// ---------------- page content ----------------
export async function getContent(): Promise<SiteContent> {
  const { rows } = await query("select key, value from settings where key like 'site.content.%'");
  const stored = new Map(rows.map((r) => [r.key.replace('site.content.', ''), r.value]));
  const out: any = {};
  for (const s of SECTIONS) out[s] = { ...(DEFAULTS[s] as object), ...((stored.get(s) as object) ?? {}) };
  return out;
}

export async function saveSection(section: Section, value: unknown, ctx: Ctx) {
  await query(
    `insert into settings (key, value, updated_by) values ($1, $2, $3)
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [`site.content.${section}`, JSON.stringify(value), ctx.actorId]);
  await audit({ actorId: ctx.actorId, action: 'site.content_saved', entityType: 'site_content', entityId: undefined, metadata: { section }, ip: ctx.ip });
  return (await getContent())[section];
}

// What is still to do before the website can go public.
export async function checklist() {
  const content = await getContent();
  const missingContact = (['phone', 'email'] as const).filter((k) => !content.contact[k]);
  const c = (await query(
    `select (select count(*) from admission_applications where status = 'received')::int as new_apps,
            (select count(*) from contact_messages where status = 'new')::int as new_msgs,
            (select count(*) from site_posts where status = 'draft')::int as draft_posts,
            (select count(*) from site_events where status = 'draft')::int as draft_events,
            (select count(*) from facilities where status = 'published')::int as live_facilities,
            (select count(*) from gallery_images where status = 'published')::int as live_images`)).rows[0];
  return {
    placeholders: findPlaceholders({ home: content.home, about: content.about, academics: content.academics, admissions: content.admissions }),
    missingContact, newApplications: c.new_apps, newMessages: c.new_msgs, draftPosts: c.draft_posts, draftEvents: c.draft_events,
    publishedFacilities: c.live_facilities, publishedImages: c.live_images,
  };
}

// ---------------- helpers ----------------
function slugify(title: string) {
  const base = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return base || 'post';
}
async function uniqueSlug(db: Queryable, title: string) {
  let slug = slugify(title);
  while ((await db.query('select 1 from site_posts where slug = $1', [slug])).rowCount) slug = `${slugify(title)}-${crypto.randomBytes(2).toString('hex')}`;
  return slug;
}
async function assertPublicImage(db: Queryable, id: string | null | undefined) {
  if (!id) return;
  const { rowCount } = await db.query("select 1 from files where id = $1 and purpose = 'public'", [id]);
  if (!rowCount) throw new AppError(400, 'That picture was not found. Upload it again.', 'BAD_FILE_REFERENCE');
}
// Everyone with an account except administrators, who run the announcements.
async function everyone(db: Queryable) {
  return (await db.query("select id from users where status = 'active' and role in ('teacher', 'student', 'parent')")).rows.map((r) => r.id as string);
}

// ---------------- news and announcements ----------------
const postRow = (r: any, full = false) => ({
  id: r.id, kind: r.kind, title: r.title, slug: r.slug, summary: r.summary, imageId: r.image_id, imageAlt: r.image_alt, status: r.status, pinned: r.pinned,
  expiresAt: r.expires_at, publishedAt: r.published_at, updatedAt: r.updated_at, ...(full ? { body: r.body } : {}),
});

export async function listPosts(f: { kind?: string; status?: string }) {
  const { rows } = await query('select * from site_posts where ($1::text is null or kind = $1) and ($2::text is null or status = $2) order by coalesce(published_at, created_at) desc', [f.kind ?? null, f.status ?? null]);
  return rows.map((r) => postRow(r));
}
export async function getPost(id: string) {
  const r = (await query('select * from site_posts where id = $1', [id])).rows[0];
  if (!r) throw notFound('Post');
  return postRow(r, true);
}

async function announcePost(id: string) {
  const p = (await query('select * from site_posts where id = $1', [id])).rows[0];
  if (!p || p.kind !== 'announcement' || p.status !== 'published') return;
  await notifyUsers(pool, await everyone(pool), { type: 'school_announcement', title: `School announcement: ${p.title}`, body: p.summary || p.body.slice(0, 200), entityType: 'site_post', entityId: id, dedupeKey: `post:${id}:published` });
}

export async function createPost(i: any, ctx: Ctx) {
  const id = await withTransaction(async (c) => {
    await assertPublicImage(c, i.imageId);
    const slug = await uniqueSlug(c, i.title);
    const { rows } = await c.query(
      `insert into site_posts (kind, title, slug, summary, body, image_id, image_alt, status, pinned, expires_at, published_at, author_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, case when $8 = 'published' then now() end, $11) returning id`,
      [i.kind, i.title, slug, i.summary, i.body, i.imageId, i.imageAlt, i.status, i.pinned, i.expiresAt, ctx.actorId]);
    await audit({ actorId: ctx.actorId, action: 'site_post.created', entityType: 'site_post', entityId: rows[0].id, metadata: { kind: i.kind, status: i.status }, ip: ctx.ip }, c);
    return rows[0].id as string;
  });
  if (i.status === 'published') await safely('announce post', () => announcePost(id));
  return getPost(id);
}

export async function updatePost(id: string, i: any, ctx: Ctx) {
  const removed: string[] = [];
  await withTransaction(async (c) => {
    const cur = (await c.query('select * from site_posts where id = $1 for update', [id])).rows[0];
    if (!cur) throw notFound('Post');
    if ('imageId' in i) await assertPublicImage(c, i.imageId);
    const imageId = 'imageId' in i ? i.imageId : cur.image_id;
    const alt = i.imageAlt ?? cur.image_alt;
    if (imageId && !alt.trim()) throw new AppError(400, 'Describe the picture for visitors who cannot see it.', 'VALIDATION_ERROR', [{ field: 'imageAlt', message: 'Describe the picture for visitors who cannot see it' }]);
    if (cur.image_id && cur.image_id !== imageId) removed.push(cur.image_id);
    await c.query(
      `update site_posts set kind = coalesce($2, kind), title = coalesce($3, title), summary = coalesce($4, summary), body = coalesce($5, body),
              image_id = $6, image_alt = $7, status = coalesce($8, status), pinned = coalesce($9, pinned), expires_at = case when $10::boolean then $11 else expires_at end,
              published_at = case when coalesce($8, status) = 'published' then coalesce(published_at, now()) else published_at end, updated_at = now() where id = $1`,
      [id, i.kind ?? null, i.title ?? null, i.summary ?? null, i.body ?? null, imageId, alt, i.status ?? null, i.pinned ?? null, 'expiresAt' in i, i.expiresAt ?? null]);
    await audit({ actorId: ctx.actorId, action: 'site_post.updated', entityType: 'site_post', entityId: id, metadata: { status: i.status }, ip: ctx.ip }, c);
  });
  await deleteIfOrphaned(removed);
  if (i.status === 'published') await safely('announce post', () => announcePost(id)); // the dedupe key makes repeats harmless
  return getPost(id);
}

export async function deletePost(id: string, ctx: Ctx) {
  const { rows } = await query('delete from site_posts where id = $1 returning image_id', [id]);
  if (!rows[0]) throw notFound('Post');
  if (rows[0].image_id) await deleteIfOrphaned([rows[0].image_id]);
  await audit({ actorId: ctx.actorId, action: 'site_post.deleted', entityType: 'site_post', entityId: id, ip: ctx.ip });
}

// ---------------- events ----------------
const eventRow = (r: any) => ({ id: r.id, title: r.title, description: r.description, location: r.location, startsAt: r.starts_at, endsAt: r.ends_at, status: r.status });

export async function listEvents() {
  return (await query('select * from site_events order by starts_at desc')).rows.map(eventRow);
}
async function announceEvent(id: string) {
  const e = (await query("select * from site_events where id = $1 and status = 'published'", [id])).rows[0];
  if (!e) return;
  await notifyUsers(pool, await everyone(pool), { type: 'school_event', title: `School event: ${e.title}`, body: `${fmtLagos(e.starts_at)}${e.location ? ` · ${e.location}` : ''}`, entityType: 'site_event', entityId: id, dedupeKey: `event:${id}:published` });
}
export async function createEvent(i: any, ctx: Ctx) {
  const { rows } = await query(
    `insert into site_events (title, description, location, starts_at, ends_at, status, published_at, created_by)
     values ($1,$2,$3,$4,$5,$6, case when $6 = 'published' then now() end, $7) returning *`, [i.title, i.description, i.location, i.startsAt, i.endsAt, i.status, ctx.actorId]);
  await audit({ actorId: ctx.actorId, action: 'site_event.created', entityType: 'site_event', entityId: rows[0].id, ip: ctx.ip });
  if (i.status === 'published') await safely('announce event', () => announceEvent(rows[0].id));
  return eventRow(rows[0]);
}
export async function updateEvent(id: string, i: any, ctx: Ctx) {
  const cur = (await query('select * from site_events where id = $1', [id])).rows[0];
  if (!cur) throw notFound('Event');
  const startsAt = i.startsAt ?? cur.starts_at; const endsAt = 'endsAt' in i ? i.endsAt : cur.ends_at;
  if (endsAt && new Date(endsAt) < new Date(startsAt)) throw new AppError(400, 'The end cannot be before the start.', 'VALIDATION_ERROR', [{ field: 'endsAt', message: 'The end cannot be before the start' }]);
  const { rows } = await query(
    `update site_events set title = coalesce($2, title), description = coalesce($3, description), location = coalesce($4, location), starts_at = $5, ends_at = $6,
            status = coalesce($7, status), published_at = case when coalesce($7, status) = 'published' then coalesce(published_at, now()) else published_at end, updated_at = now() where id = $1 returning *`,
    [id, i.title ?? null, i.description ?? null, i.location ?? null, startsAt, endsAt, i.status ?? null]);
  await audit({ actorId: ctx.actorId, action: 'site_event.updated', entityType: 'site_event', entityId: id, ip: ctx.ip });
  if (i.status === 'published') await safely('announce event', () => announceEvent(id));
  return eventRow(rows[0]);
}
export async function deleteEvent(id: string, ctx: Ctx) {
  const { rowCount } = await query('delete from site_events where id = $1', [id]);
  if (!rowCount) throw notFound('Event');
  await audit({ actorId: ctx.actorId, action: 'site_event.deleted', entityType: 'site_event', entityId: id, ip: ctx.ip });
}

// ---------------- facilities and gallery ----------------
const facRow = (r: any) => ({ id: r.id, category: r.category, name: r.name, description: r.description, sortOrder: r.sort_order, status: r.status });
const imgRow = (r: any) => ({ id: r.id, facilityId: r.facility_id, fileId: r.file_id, caption: r.caption, altText: r.alt_text, status: r.status, sortOrder: r.sort_order });

export async function listFacilities() { return (await query('select * from facilities order by category, sort_order, name')).rows.map(facRow); }
export async function createFacility(i: any, ctx: Ctx) {
  const { rows } = await query('insert into facilities (category, name, description, sort_order, status) values ($1,$2,$3,$4,$5) returning *', [i.category, i.name, i.description, i.sortOrder, i.status]);
  await audit({ actorId: ctx.actorId, action: 'facility.created', entityType: 'facility', entityId: rows[0].id, ip: ctx.ip });
  return facRow(rows[0]);
}
export async function updateFacility(id: string, i: any, ctx: Ctx) {
  const { rows } = await query(
    `update facilities set category = coalesce($2, category), name = coalesce($3, name), description = coalesce($4, description), sort_order = coalesce($5, sort_order), status = coalesce($6, status), updated_at = now() where id = $1 returning *`,
    [id, i.category ?? null, i.name ?? null, i.description ?? null, i.sortOrder ?? null, i.status ?? null]);
  if (!rows[0]) throw notFound('Facility');
  await audit({ actorId: ctx.actorId, action: 'facility.updated', entityType: 'facility', entityId: id, ip: ctx.ip });
  return facRow(rows[0]);
}
export async function deleteFacility(id: string, ctx: Ctx) {
  const { rowCount } = await query('delete from facilities where id = $1', [id]);
  if (!rowCount) throw notFound('Facility');
  await audit({ actorId: ctx.actorId, action: 'facility.deleted', entityType: 'facility', entityId: id, ip: ctx.ip });
}

export async function listGallery() { return (await query('select * from gallery_images order by sort_order, created_at desc')).rows.map(imgRow); }
export async function addGalleryImage(i: any, ctx: Ctx) {
  await assertPublicImage(pool, i.fileId);
  const { rows } = await query('insert into gallery_images (facility_id, file_id, caption, alt_text, status, sort_order) values ($1,$2,$3,$4,$5,$6) returning *', [i.facilityId, i.fileId, i.caption, i.altText, i.status, i.sortOrder]);
  await audit({ actorId: ctx.actorId, action: 'gallery_image.added', entityType: 'gallery_image', entityId: rows[0].id, ip: ctx.ip });
  return imgRow(rows[0]);
}
export async function updateGalleryImage(id: string, i: any, ctx: Ctx) {
  const { rows } = await query(
    `update gallery_images set facility_id = case when $2::boolean then $3 else facility_id end, caption = coalesce($4, caption), alt_text = coalesce($5, alt_text), status = coalesce($6, status), sort_order = coalesce($7, sort_order) where id = $1 returning *`,
    [id, 'facilityId' in i, i.facilityId ?? null, i.caption ?? null, i.altText ?? null, i.status ?? null, i.sortOrder ?? null]);
  if (!rows[0]) throw notFound('Picture');
  await audit({ actorId: ctx.actorId, action: 'gallery_image.updated', entityType: 'gallery_image', entityId: id, ip: ctx.ip });
  return imgRow(rows[0]);
}
export async function deleteGalleryImage(id: string, ctx: Ctx) {
  const { rows } = await query('delete from gallery_images where id = $1 returning file_id', [id]);
  if (!rows[0]) throw notFound('Picture');
  await deleteIfOrphaned([rows[0].file_id]);
  await audit({ actorId: ctx.actorId, action: 'gallery_image.deleted', entityType: 'gallery_image', entityId: id, ip: ctx.ip });
}

// ---------------- what the public may see (published only) ----------------
const mediaUrl = (fileId: string | null) => (fileId ? `/api/public/media/${fileId}` : null);
const activeAnnouncement = "kind = 'announcement' and status = 'published' and (expires_at is null or expires_at > now())";
const pubPost = (r: any, full = false) => ({
  title: r.title, slug: r.slug, kind: r.kind, summary: r.summary, publishedAt: r.published_at, pinned: r.pinned,
  imageUrl: mediaUrl(r.image_id), imageAlt: r.image_alt, ...(full ? { body: r.body } : {}),
});
const pubEvent = (r: any) => ({ title: r.title, description: r.description, location: r.location, startsAt: r.starts_at, endsAt: r.ends_at });

export async function publicSite() {
  const content = await getContent();
  const news = (await query("select * from site_posts where kind = 'news' and status = 'published' order by published_at desc limit 3")).rows;
  const ann = (await query(`select * from site_posts where ${activeAnnouncement} order by pinned desc, published_at desc limit 3`)).rows;
  const events = (await query("select * from site_events where status = 'published' and coalesce(ends_at, starts_at) >= now() order by starts_at limit 3")).rows;
  const { contact, ...pages } = content;
  return {
    school: { name: SCHOOL.name, address: SCHOOL.address },
    contact: { phone: contact.phone || null, email: contact.email || null, whatsapp: contact.whatsapp || null, officeHours: contact.officeHours || null, mapQuery: contact.mapQuery },
    content: pages, latestNews: news.map((r) => pubPost(r)), announcements: ann.map((r) => pubPost(r)), upcomingEvents: events.map(pubEvent),
  };
}
export async function publicPosts(page: number, pageSize: number) {
  const total = (await query("select count(*)::int as n from site_posts where kind = 'news' and status = 'published'")).rows[0].n as number;
  const { rows } = await query("select * from site_posts where kind = 'news' and status = 'published' order by published_at desc limit $1 offset $2", [pageSize, (page - 1) * pageSize]);
  return { items: rows.map((r) => pubPost(r)), total, page, pageSize };
}
export async function publicPost(slug: string) {
  const r = (await query(`select * from site_posts where slug = $1 and status = 'published' and (kind = 'news' or (expires_at is null or expires_at > now()))`, [slug])).rows[0];
  if (!r) throw notFound('Post');
  return pubPost(r, true);
}
export async function publicAnnouncements() {
  return (await query(`select * from site_posts where ${activeAnnouncement} order by pinned desc, published_at desc`)).rows.map((r) => pubPost(r, true));
}
export async function publicEvents(when: 'upcoming' | 'past') {
  const { rows } = await query(
    when === 'upcoming' ? "select * from site_events where status = 'published' and coalesce(ends_at, starts_at) >= now() order by starts_at"
                        : "select * from site_events where status = 'published' and coalesce(ends_at, starts_at) < now() order by starts_at desc limit 50");
  return rows.map(pubEvent);
}
export async function publicFacilities() {
  const f = (await query("select * from facilities where status = 'published' order by category, sort_order, name")).rows;
  const imgs = (await query("select * from gallery_images where status = 'published' and facility_id = any($1::uuid[]) order by sort_order, created_at", [f.map((x) => x.id)])).rows;
  return f.map((x) => ({ category: x.category, name: x.name, description: x.description, images: imgs.filter((g) => g.facility_id === x.id).map((g) => ({ url: mediaUrl(g.file_id), caption: g.caption, alt: g.alt_text })) }));
}
export async function publicGallery() {
  const { rows } = await query(
    `select g.*, f.name as facility_name from gallery_images g left join facilities f on f.id = g.facility_id
      where g.status = 'published' and (g.facility_id is null or f.status = 'published') order by g.sort_order, g.created_at desc`);
  return rows.map((g) => ({ url: mediaUrl(g.file_id), caption: g.caption, alt: g.alt_text, facility: g.facility_name ?? null }));
}
// Only subject names per class level: nothing about teachers or students.
export async function publicAcademics() {
  const { rows } = await query(
    `select c.stage, c.year, coalesce(array_agg(distinct s.name::text order by s.name::text) filter (where s.name is not null), '{}') as subjects from classes c
       left join class_subjects cs on cs.class_id = c.id left join subjects s on s.id = cs.subject_id group by c.stage, c.year order by c.stage desc, c.year`);
  const stages = ['JSS', 'SSS'].map((stage) => ({ stage, levels: [1, 2, 3].map((year) => ({ year, name: `${stage} ${year}`, subjects: ((rows.find((r) => r.stage === stage && r.year === year)?.subjects ?? []) as (string | null)[]).filter(Boolean) })) }));
  return { stages };
}

// A public image is served only while a published page uses it.
export async function publicMedia(id: string) {
  const { rows } = await query(
    `select f.* from files f where f.id = $1 and f.purpose = 'public' and (
        exists (select 1 from gallery_images g left join facilities fa on fa.id = g.facility_id where g.file_id = f.id and g.status = 'published' and (g.facility_id is null or fa.status = 'published'))
        or exists (select 1 from site_posts p where p.image_id = f.id and p.status = 'published' and (p.kind = 'news' or p.expires_at is null or p.expires_at > now())))`, [id]);
  if (!rows[0]) throw notFound('Picture');
  return { file: rows[0], data: await storage.get(rows[0].storage_key) };
}
