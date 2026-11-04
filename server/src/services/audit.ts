import { pool, Queryable } from '../db/pool';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

export async function audit(entry: AuditEntry, db: Queryable = pool) {
  await db.query(
    `insert into audit_logs (actor_id, action, entity_type, entity_id, metadata, ip)
     values ($1, $2, $3, $4, $5, $6)`,
    [entry.actorId ?? null, entry.action, entry.entityType ?? null, entry.entityId ?? null,
     JSON.stringify(entry.metadata ?? {}), entry.ip ?? null],
  );
}
