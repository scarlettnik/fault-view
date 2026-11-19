import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const spec = readFileSync(new URL('./openapi.json', import.meta.url), 'utf8');
const client = readFileSync(new URL('./storefront.js', import.meta.url), 'utf8');
const products = [
  { id: 1, name: 'Studio headphones', price: 129, category: 'AUDIO' },
  { id: 2, name: 'Mechanical keyboard', price: 89, category: 'DESK' },
  { id: 3, name: 'Portable speaker', price: 65, category: 'AUDIO' },
];
const data = {
  '/api/products': products,
  '/api/recommendations': [{ id: 4, name: 'Wireless charger', price: 35 }],
  '/api/cart': { items: [{ name: 'Studio headphones', quantity: 1 }], total: 129 },
  '/api/profile': { name: 'Alex Morgan', email: 'alex@example.test', orders: 3 },
};
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1:4400').pathname;
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  if (path === '/openapi.json') { res.setHeader('Content-Type', 'application/json'); res.end(spec); return; }
  if (path === '/storefront.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(client); return; }
  if (path in data) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data[path])); return; }
  if (!['/', '/products', '/checkout', '/account'].includes(path)) { res.writeHead(404); res.end('Not found'); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Storefront · FaultView example</title>
  <style>*{box-sizing:border-box}body{margin:0;background:#f5f5f1;color:#20231f;font:16px system-ui,sans-serif}header{padding:24px 6%;border-bottom:1px solid #dadcd4;display:flex;align-items:center;gap:36px;flex-wrap:wrap}header strong{font-size:22px;margin-right:auto}a{color:inherit}nav{display:flex;gap:24px}main{max-width:1060px;padding:64px 24px;margin:auto}h1{font-size:46px;font-weight:500;letter-spacing:-2px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px}.item{background:white;border:1px solid #deded7;padding:28px;border-radius:8px}.item h2{font-size:19px}.shape{height:130px;background:#e9ebdf;display:grid;place-items:center;font-size:48px;color:#66714e}.label{font:12px monospace;letter-spacing:2px;color:#68705f}.notice{padding:20px;background:#e9ebdf;border-radius:6px;margin-top:24px}footer{padding:20px 6%;font-size:13px;color:#606658}</style>
  </head><body><header><strong>Storefront<span style="color:#78824b">.</span></strong><nav><a href="/products">Products</a><a href="/checkout">Checkout</a><a href="/account">Account</a></nav></header><main id="content" aria-live="polite">Loading…</main><footer>Local demonstration app for FaultView. No real purchases or accounts.</footer><script src="/storefront.js" defer></script></body></html>`);
});
server.listen(4400, '127.0.0.1', () => console.log('Storefront: http://127.0.0.1:4400'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
