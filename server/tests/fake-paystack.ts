// A stand-in for api.paystack.co, used by the tests. It records what the API sent and lets a test decide what Paystack "says".
import http from 'http';

export interface FakePaystack {
  port: number;
  requests: { path: string; method: string; auth?: string; body?: any }[];
  outcomes: Map<string, { status: string; amount?: number; currency?: string; reference?: string }>;
  initiated: Map<string, { amount: number; email: string; currency: string; callback_url: string; metadata: any }>;
  failNextInit: boolean;
  close(): void;
}

export function startFakePaystack(port: number): Promise<FakePaystack> {
  const fake: FakePaystack = { port, requests: [], outcomes: new Map(), initiated: new Map(), failNextInit: false, close: () => server.close() };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw ? JSON.parse(raw) : undefined;
      fake.requests.push({ path: req.url!, method: req.method!, auth: req.headers.authorization, body });
      const send = (code: number, json: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); };
      if (req.method === 'POST' && req.url === '/transaction/initialize') {
        if (fake.failNextInit) { fake.failNextInit = false; return send(400, { status: false, message: 'Invalid key' }); }
        fake.initiated.set(body.reference, { amount: body.amount, email: body.email, currency: body.currency, callback_url: body.callback_url, metadata: body.metadata });
        return send(200, { status: true, message: 'Authorization URL created', data: { authorization_url: `https://checkout.fake/${body.reference}`, access_code: `ac_${body.reference}`, reference: body.reference } });
      }
      const m = req.url!.match(/^\/transaction\/verify\/(.+)$/);
      if (req.method === 'GET' && m) {
        const ref = decodeURIComponent(m[1]); const init = fake.initiated.get(ref); const o = fake.outcomes.get(ref);
        if (!init) return send(404, { status: false, message: 'Transaction reference not found' });
        return send(200, { status: true, message: 'Verification successful', data: {
          status: o?.status ?? 'abandoned', reference: o?.reference ?? ref, amount: o?.amount ?? init.amount, currency: o?.currency ?? init.currency,
          gateway_response: o?.status === 'success' ? 'Successful' : 'Not completed', channel: 'card', paid_at: o?.status === 'success' ? new Date().toISOString() : null,
          authorization: { last4: '4081', bin: '408408' }, customer: { email: init.email } } });
      }
      // Test-only controls, so a browser test can play the part of Paystack's checkout page.
      if (req.method === 'POST' && req.url === '/_control/outcome') { fake.outcomes.set(body.reference, { status: body.status }); return send(200, { ok: true }); }
      const ci = req.url!.match(/^\/_control\/init\/(.+)$/);
      if (req.method === 'GET' && ci) return send(200, fake.initiated.get(decodeURIComponent(ci[1])) ?? {});
      send(404, { status: false, message: 'not found' });
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(fake)));
}
