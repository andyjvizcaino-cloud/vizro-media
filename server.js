'use strict';
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT          = process.env.PORT || 3000;
const LEADFORGE_URL = process.env.LEADFORGE_URL || 'https://leadforge-production-9060.up.railway.app';

// Minimal 1×1 transparent PNG — served for every tracking pixel request.
// Generating it here avoids an extra round-trip to LeadForge on every email open.
const PIXEL_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806' +
  '0000001f15c4890000000a49444154789c626000000002000' +
  '1e221bc330000000049454e44ae426082',
  'hex'
);

// Fire-and-forget GET to LeadForge — used for pixel tracking so we respond
// to the email client immediately without waiting for LeadForge to reply.
function pingLeadForge(path) {
  try {
    const u = new URL(LEADFORGE_URL + path);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({ hostname: u.hostname, path: u.pathname, method: 'GET' });
    req.on('error', () => {});
    req.end();
  } catch (_) {}
}

// Call LeadForge API synchronously and return the response body as a string.
function callLeadForge(apiPath, cb) {
  try {
    const u   = new URL(LEADFORGE_URL + apiPath);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      { hostname: u.hostname, path: u.pathname, method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => cb(null, body));
      }
    );
    req.on('error', cb);
    req.end();
  } catch (e) {
    cb(e);
  }
}

const UNSUBSCRIBE_PAGE = (message) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Unsubscribed — Vizro Media</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           background: #080810; color: #f0f0f8; min-height: 100vh;
           display: flex; align-items: center; justify-content: center; }
    .card { text-align: center; padding: 48px 40px; background: #0f0f1a;
            border: 1px solid #1a1a2e; border-radius: 16px; max-width: 440px; }
    .icon { font-size: 2.5rem; margin-bottom: 16px; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 10px; color: #10b981; }
    p  { font-size: 0.9rem; color: #6b6b88; line-height: 1.6; }
    a  { color: #7c3aed; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>Unsubscribed</h1>
    <p>${message}</p>
    <p style="margin-top:16px"><a href="/">vizromedia.com</a></p>
  </div>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // Health check
  if (pathname === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }

  // ── Open tracking pixel ──────────────────────────────────────────────────
  // Emails embed: https://vizromedia.com/track/open/:lead_id/:email_num
  // We respond with the pixel immediately and notify LeadForge asynchronously.
  const pixelMatch = pathname.match(/^\/track\/open\/(\d+)\/(\d+)$/);
  if (pixelMatch) {
    const [, leadId, emailNum] = pixelMatch;
    // Fire-and-forget — do not block the pixel response on LeadForge
    pingLeadForge(`/track/open/${leadId}/${emailNum}`);
    res.writeHead(200, {
      'Content-Type':  'image/png',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma':        'no-cache',
    });
    res.end(PIXEL_PNG);
    return;
  }

  // ── Unsubscribe page ─────────────────────────────────────────────────────
  // Emails link to: https://vizromedia.com/unsubscribe/:token
  // We call LeadForge server-side to process the opt-out, then show a page.
  const unsubMatch = pathname.match(/^\/unsubscribe\/([A-Za-z0-9_\-]+)$/);
  if (unsubMatch) {
    const [, token] = unsubMatch;
    callLeadForge(`/api/unsubscribe/${token}`, (err) => {
      if (err) {
        console.error('LeadForge unsubscribe error:', err.message);
      }
      const msg = err
        ? 'You have been removed from our mailing list.'
        : 'You have been removed from all future emails. We\'re sorry to see you go.';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(UNSUBSCRIBE_PAGE(msg));
    });
    return;
  }

  // ── Default: serve index.html ────────────────────────────────────────────
  const filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Server error');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Vizro Media running on port ${PORT}`);
});
