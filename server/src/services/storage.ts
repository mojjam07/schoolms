import fs from 'fs/promises';
import path from 'path';
import { env, isProd } from '../config/env';

export interface Storage {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

// Development only. Files never leave the server; downloads still go through the API's permission checks.
class LocalStorage implements Storage {
  private file = (key: string) => path.join(path.resolve(env.STORAGE_DIR), key);
  async put(key: string, data: Buffer) {
    const f = this.file(key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, data);
  }
  get(key: string) { return fs.readFile(this.file(key)); }
  async remove(key: string) { await fs.rm(this.file(key), { force: true }); }
}

// Private Supabase Storage bucket, accessed with the service role key (server only).
// Browsers never talk to Supabase: the API streams the file after checking permissions.
class SupabaseStorage implements Storage {
  private base = `${env.SUPABASE_URL!.replace(/\/+$/, '')}/storage/v1/object/${env.SUPABASE_BUCKET}`;
  private headers = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...extra });
  private url = (key: string) => `${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`;

  async put(key: string, data: Buffer, mime: string) {
    const res = await fetch(this.url(key), { method: 'POST', headers: this.headers({ 'Content-Type': mime, 'x-upsert': 'false' }), body: new Uint8Array(data) });
    if (!res.ok) throw new Error(`Supabase upload failed (${res.status}): ${await res.text()}`);
  }
  async get(key: string) {
    const res = await fetch(this.url(key), { headers: this.headers() });
    if (!res.ok) throw new Error(`Supabase download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  async remove(key: string) {
    const res = await fetch(this.url(key), { method: 'DELETE', headers: this.headers() });
    if (!res.ok && res.status !== 404) throw new Error(`Supabase delete failed (${res.status})`);
  }
}

export const storage: Storage = env.STORAGE_DRIVER === 'supabase' ? new SupabaseStorage() : new LocalStorage();
if (isProd && env.STORAGE_DRIVER === 'local') {
  console.warn('[storage] STORAGE_DRIVER=local in production: uploaded files will be lost on redeploy. Use supabase.');
}
