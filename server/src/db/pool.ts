import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import { env } from '../config/env';

types.setTypeParser(1082, (v) => v); // DATE -> 'YYYY-MM-DD' string
types.setTypeParser(20, (v) => Number(v)); // bigint (money in kobo, counts) -> number; amounts stay far below 2^53

// TODO(production): pin Supabase's CA certificate instead of rejectUnauthorized:false.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  max: 10,
});

export const query = <T extends QueryResultRow = any>(text: string, params?: unknown[]) =>
  pool.query<T>(text, params);

export type Queryable = Pick<Pool | PoolClient, 'query'>;

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
