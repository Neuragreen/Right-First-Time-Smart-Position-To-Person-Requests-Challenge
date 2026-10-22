/** Standalone loopback-only judge runner; no cloud account or installed packages. */
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createApiHandlers } from '../lib/p2p-store.mjs';
import * as domain from '../public/compass/workflow.js';
const root = fileURLToPath(new URL('../', import.meta.url));

export async function createJudgeServer({ dataDirectory = path.join(root, '.local-data') } = {}) {
  await mkdir(dataDirectory, { recursive: true });
  const sql = new DatabaseSync(path.join(dataDirectory, 'p2p.sqlite'));
  sql.exec('PRAGMA journal_mode=WAL');
  if (!sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='p2p_workspaces'").get()) {
    sql.exec(await readFile(path.join(root, 'drizzle/0000_needy_vance_astro.sql'), 'utf8'));
  }
  const db = {
    prepare(query) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return sql.prepare(query).get(...args) || null; },
        async all() { return { results: sql.prepare(query).all(...args) }; },
        async run() { return { success: true, meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
      };
      return statement;
    },
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  // This fictional identity exists only in this loopback demo runner, never in hosted authentication.
  const handlers = createApiHandlers({ getUser: () => ({ userId: 'local-judge-demo' }), getDatabase: () => db, domain, onError: console.error });
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
  const server = http.createServer(async (incoming, outgoing) => {
    const send = (status, text) => { outgoing.writeHead(status, { 'content-type': 'text/plain', 'cache-control': 'no-store' }); outgoing.end(text); };
    try {
      const url = new URL(incoming.url, `http://${incoming.headers.host}`);
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return send(403, 'Loopback host required.');
      if (url.pathname.startsWith('/api/')) {
        const handler = handlers[url.pathname.slice(5)];
        if (!['state', 'actions', 'audit'].includes(url.pathname.slice(5)) || typeof handler !== 'function') return send(404, 'Not found');
        const chunks = []; let size = 0;
        for await (const chunk of incoming) { size += chunk.length; if (size > 65536) return send(413, 'Request too large'); chunks.push(chunk); }
        const body = Buffer.concat(chunks);
        const request = new Request(url, { method: incoming.method, headers: incoming.headers, ...(body.length && !['GET', 'HEAD'].includes(incoming.method) ? { body } : {}) });
        const response = await handler(request);
        const payload = await response.json();
        payload.storage = 'Local SQLite';
        outgoing.writeHead(response.status, { ...Object.fromEntries(response.headers), 'cache-control': 'no-store' });
        return outgoing.end(JSON.stringify(payload));
      }
      if (!['GET', 'HEAD'].includes(incoming.method)) return send(405, 'Use GET');
      const pathname = decodeURIComponent(url.pathname);
      const relative = pathname === '/' ? 'compass/index.html' : pathname.replace(/^\/+/, '');
      const target = path.resolve(root, 'public', relative);
      if (!target.startsWith(path.join(root, 'public') + path.sep) || !mime[path.extname(target)]) return send(404, 'Not found');
      const content = await readFile(target);
      outgoing.writeHead(200, { 'content-type': mime[path.extname(target)], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      outgoing.end(incoming.method === 'HEAD' ? undefined : content);
    } catch (error) { if (error.code !== 'ENOENT') console.error(error); send(error.code === 'ENOENT' ? 404 : 400, 'Request could not be served.'); }
  });
  server.on('close', () => sql.close());
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4173);
  const server = await createJudgeServer();
  server.on('error', error => { console.error(`Could not start local demo: ${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`\nP2P Compass — synthetic-data judge demo\nOpen http://127.0.0.1:${port}\nNo account, API key or dependency installation required.\nData persists in .local-data/p2p.sqlite. Press Ctrl+C to stop.\n`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
