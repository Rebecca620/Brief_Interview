import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { reviewWithJev, DEFAULT_MODEL } from './jev-client.mjs';
import { reviewInput } from '../src/features/ai-review/contract.js';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
const clientPaths =
  /^\/(index\.html|style\.css|sample-metrics\.csv|vendor\/(?:pptxgen\.bundle\.js|jszip\.min\.js|pdfjs\/(?:pdf(?:\.worker)?\.mjs|(?:cmaps|standard_fonts)\/[a-zA-Z0-9_.-]+\.(?:bcmap|pfb|ttf)))|src\/[a-zA-Z0-9/_-]+\.(?:js|css))$/;

/** Local-only POC server. Public deployments need authenticated users and per-user limits. */
export function createBriefServer({
  root = resolve('.'),
  apiKey = '',
  model = DEFAULT_MODEL,
  review = reviewWithJev,
  now = Date.now,
} = {}) {
  let inFlight = false;
  const requests = [];
  return createServer(async (request, response) => {
    const json = (status, value) => {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(JSON.stringify(value));
    };
    const port = request.socket.localPort;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)) {
      json(403, { error: 'Local host required.' });
      return;
    }
    let path;
    try {
      path = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    } catch {
      json(400, { error: 'Invalid URL.' });
      return;
    }
    if (path === '/api/ai/status' && request.method === 'GET') {
      json(200, { enabled: Boolean(apiKey), model });
      return;
    }
    if (path === '/api/ai/review' && request.method === 'POST') {
      if (
        request.headers.origin !== `http://${request.headers.host}` ||
        request.headers['x-brief-review'] !== '1'
      ) {
        json(403, { error: 'Use the review button from this local application.' });
        return;
      }
      if (!request.headers['content-type']?.startsWith('application/json')) {
        json(415, { error: 'JSON content is required.' });
        return;
      }
      if (!apiKey) {
        json(503, { error: 'Jev is not configured. Set TYPESAFE_API_KEY on the local server.' });
        return;
      }
      if (inFlight) {
        json(429, { error: 'A review is already running. Please wait.' });
        return;
      }
      while (requests.length && requests[0] < now() - 60000) requests.shift();
      if (requests.length >= 10) {
        json(429, { error: 'Ten reviews per minute are allowed in this local POC.' });
        return;
      }
      inFlight = true;
      try {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes > 32768) {
            json(413, { error: 'Card text is too large.' });
            return;
          }
          chunks.push(chunk);
        }
        let input;
        try {
          input = reviewInput(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          json(400, { error: error instanceof SyntaxError ? 'Invalid JSON.' : error.message });
          return;
        }
        requests.push(now());
        const result = await review(input, { apiKey, model });
        json(200, result);
      } catch (error) {
        json(502, { error: error.message || 'Review failed. No card was changed.' });
      } finally {
        inFlight = false;
      }
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(405, { error: 'Method not allowed.' });
      return;
    }
    if (path === '/') path = '/index.html';
    // Never expose .env, backups, server code, test fixtures, node_modules, or directory listings.
    if (!clientPaths.test(path) || path.split('/').includes('..')) {
      json(404, { error: 'Not found.' });
      return;
    }
    try {
      const bytes = await readFile(resolve(root, '.' + path));
      response.writeHead(200, {
        'Content-Type': mime[extname(path)],
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {
      json(404, { error: 'Not found.' });
    }
  });
}
