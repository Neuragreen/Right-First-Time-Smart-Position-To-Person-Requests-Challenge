import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createJudgeServer } from '../scripts/judge-server.mjs';

test('standalone runner serves the app, persists actions, and rejects foreign origins and private files', async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'p2p-judge-'));
  let server;
  const start = async () => { server = await createJudgeServer({ dataDirectory }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`; };
  const stop = () => new Promise(resolve => server.close(resolve));
  try {
    let base = await start();
    assert.match(await (await fetch(base)).text(), /P2P Compass/);
    assert.equal((await fetch(`${base}/compass/workflow.js`)).status, 200);
    assert.equal((await fetch(`${base}/package.json`)).status, 404);
    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.state.requests.length, 32);
    assert.equal(state.storage, 'Local SQLite');
    const input = { expectedVersion: state.version, actorId: 'process-owner', action: { type: 'reset' } };
    assert.equal((await fetch(`${base}/api/actions`, { method: 'POST', headers: { origin: 'https://foreign.example', 'content-type': 'application/json' }, body: JSON.stringify(input) })).status, 403);
    const saved = await fetch(`${base}/api/actions`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.equal((await saved.json()).version, state.version + 1);
    await stop(); base = await start();
    assert.equal((await (await fetch(`${base}/api/state`)).json()).version, state.version + 1);
    assert.equal((await (await fetch(`${base}/api/audit`)).json()).entries.length, 1);
  } finally { if (server?.listening) await stop(); await rm(dataDirectory, { recursive: true, force: true }); }
});
