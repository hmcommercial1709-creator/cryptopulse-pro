import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = '0.0.0.0';

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  res.setHeader('Cache-Control', 'no-store');

  if (url.pathname === '/health' || url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, service: 'cryptopulse-pro' }));
    return;
  }

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CryptoPulse Pro</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1020;color:#fff}
main{max-width:640px;padding:40px;text-align:center}
h1{margin:0 0 12px}p{color:#b8c0d9}
.status{display:inline-block;padding:8px 14px;border-radius:999px;background:#153b2a;color:#7ee2a8}
</style>
</head>
<body><main>
<h1>CryptoPulse Pro</h1>
<p class="status">Web service online</p>
<p>CryptoPulse Pro Telegram Mini App service is running.</p>
</main></body>
</html>`);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.on('error', (error) => {
  console.error('CryptoPulse HTTP server error:', error);
  process.exitCode = 1;
});

export function startWebServer(): void {
  server.listen(PORT, HOST, () => {
    console.log(`CryptoPulse HTTP server listening on http://${HOST}:${PORT}`);
  });
}
