// Checks the Supabase storage driver's requests against a fake server (no network, no real Supabase).
//   npx tsx tests/storage.test.ts
import http from 'http';

const seen: { method: string; url: string; auth?: string; type?: string; upsert?: string; body: Buffer }[] = [];
const store = new Map<string, Buffer>();
const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, type: req.headers['content-type'], upsert: req.headers['x-upsert'] as string, body });
    const key = req.url!.replace('/storage/v1/object/school-files/', '');
    if (req.method === 'POST') { store.set(key, body); res.writeHead(200).end('{}'); }
    else if (req.method === 'GET') store.has(key) ? res.writeHead(200).end(store.get(key)) : res.writeHead(404).end('{}');
    else if (req.method === 'DELETE') { store.delete(key); res.writeHead(200).end('{}'); }
  });
});

let pass = 0, fail = 0;
const check = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  (expected ${JSON.stringify(want)}, got ${JSON.stringify(got)})`}`); ok ? pass++ : fail++; };

server.listen(0, async () => {
  const port = (server.address() as any).port;
  Object.assign(process.env, {
    DATABASE_URL: 'postgresql://x', JWT_ACCESS_SECRET: 'x'.repeat(40), CLIENT_ORIGIN: 'http://localhost:5173',
    STORAGE_DRIVER: 'supabase', SUPABASE_URL: `http://127.0.0.1:${port}/`, SUPABASE_SERVICE_ROLE_KEY: 'service-key-123', SUPABASE_BUCKET: 'school-files',
  });
  const { storage } = await import('../src/services/storage');
  const data = Buffer.from('%PDF-1.4 hello');
  await storage.put('resource/abc.pdf', data, 'application/pdf');
  check('upload: POST to the private bucket path', [seen[0].method, seen[0].url], ['POST', '/storage/v1/object/school-files/resource/abc.pdf']);
  check('upload: service key + content type, no overwrite', [seen[0].auth, seen[0].type, seen[0].upsert], ['Bearer service-key-123', 'application/pdf', 'false']);
  check('upload: body intact', seen[0].body.equals(data), true);
  check('download returns the same bytes', (await storage.get('resource/abc.pdf')).equals(data), true);
  await storage.remove('resource/abc.pdf');
  check('delete: DELETE on the object path', [seen[2].method, seen[2].url], ['DELETE', '/storage/v1/object/school-files/resource/abc.pdf']);
  let err = ''; try { await storage.get('resource/abc.pdf'); } catch (e) { err = (e as Error).message; }
  check('download of a missing object throws', err.includes('404'), true);
  await storage.remove('resource/never-existed.pdf');
  check('deleting a missing object is not an error', true, true);
  console.log(`\npassed=${pass} failed=${fail}`); server.close(); process.exit(fail ? 1 : 0);
});
