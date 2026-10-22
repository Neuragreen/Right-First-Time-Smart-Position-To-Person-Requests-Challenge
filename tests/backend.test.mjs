import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createWorkspaceStore, createApiHandlers, ApiError } from '../lib/p2p-store.mjs';

const NOW = '2026-10-23T09:00:00.000Z';
const actors = [
  { id: 'mgr-airport', name: 'Demo airport manager', role: 'manager' },
  { id: 'hr-ops', name: 'Demo HR specialist', role: 'hr' },
  { id: 'process-owner', name: 'Demo process owner', role: 'process-owner' },
];
const domain = {
  ACTORS: actors,
  createInitialState: asOf => ({
    schemaVersion: 2, version: 0, asOf, actors,
    requests: [{ id: 'P2P-1001', title: 'Synthetic test request', status: 'pending', validationSnapshot: { ruleVersion: 'demo-v2', valid: true } }],
    events: [{ id: 'E1', requestId: 'P2P-1001', step: 'Validation', outcome: 'submitted', timestamp: asOf }],
    positions: [], notifications: [],
  }),
  applyAction(state, action, actorId, at) {
    if (actorId !== 'hr-ops') throw Object.assign(new Error('This human review belongs to HR.'), { code: 'ROLE_FORBIDDEN' });
    if (action.type === 'invalid') throw Object.assign(new Error('A correction reason is required.'), { code: 'VALIDATION_FAILED', errors: [{ field: 'reason', ruleId: 'DEMO-R1', message: 'Required' }] });
    state.requests[0].status = 'reviewed';
    state.events.push({ id: `E${state.events.length + 1}`, requestId: 'P2P-1001', step: 'Review', outcome: action.type, actorId, timestamp: at });
    state.version += 1;
    return state;
  },
};

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE p2p_workspaces (id TEXT PRIMARY KEY, state_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, last_mutation_id TEXT NOT NULL DEFAULT '');
    CREATE TABLE p2p_audit (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, version INTEGER NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, request_id TEXT, timestamp TEXT NOT NULL, payload_json TEXT NOT NULL);
    CREATE UNIQUE INDEX p2p_audit_workspace_version ON p2p_audit(workspace_id, version);
  `);
  const db = {
    sql,
    beforeBatch: null,
    failJournal: false,
    prepare(query) {
      let args = [];
      const statement = {
        query,
        bind(...values) { args = values; return statement; },
        async first() { return sql.prepare(query).get(...args) || null; },
        async all() { return { results: sql.prepare(query).all(...args) }; },
        async run() {
          if (db.failJournal && query.startsWith('INSERT INTO p2p_audit')) throw new Error('Simulated journal write failure');
          const result = sql.prepare(query).run(...args);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
    async batch(statements) {
      if (db.beforeBatch) {
        const callback = db.beforeBatch;
        db.beforeBatch = null;
        await callback();
      }
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sql.exec('COMMIT');
        return results;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  return db;
}
let id = 0;
const storeFor = db => createWorkspaceStore({ db, domain, now: () => NOW, uuid: () => `MUTATION-${++id}` });
const handlersFor = (db, userId = 'signed-in-owner') => createApiHandlers({
  getUser: async () => userId ? { userId, email: 'not-persisted@example.test' } : null,
  getDatabase: async () => db, domain, now: () => NOW, uuid: () => `MUTATION-${++id}`,
});
const post = (body, extra = {}) => new Request('https://demo.example/api/actions', {
  method: 'POST', headers: { origin: 'https://demo.example', 'content-type': 'application/json', ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
const input = { expectedVersion: 0, actorId: 'hr-ops', action: { type: 'review', requestId: 'P2P-1001' } };

test('anonymous API requests have no insecure identity fallback and do not create state', async () => {
  const db = database();
  const handlers = handlersFor(db, null);
  const state = await handlers.state(new Request('https://demo.example/api/state'));
  assert.equal(state.status, 401);
  assert.equal((await state.json()).code, 'AUTH_REQUIRED');
  assert.equal((await handlers.actions(post(input))).status, 401);
  assert.equal(db.sql.prepare('SELECT count(*) AS n FROM p2p_workspaces').get().n, 0);
});

test('state is persistent, owner-scoped and polling does not increment its version', async () => {
  const db = database();
  const store = storeFor(db);
  const initial = await store.load('owner-a');
  assert.equal(initial.storage, 'D1');
  assert.equal(initial.version, 0);
  await store.apply('owner-a', input);
  assert.equal((await store.load('owner-a')).state.requests[0].status, 'reviewed');
  assert.equal((await store.load('owner-a')).version, 1);
  assert.equal((await store.load('owner-b')).state.requests[0].status, 'pending');
  assert.equal((await store.audit('owner-b')).entries.length, 0);
  assert(!db.sql.prepare('SELECT state_json FROM p2p_workspaces WHERE id = ?').get('owner-a').state_json.includes('not-persisted@example.test'));
});

test('cross-origin, missing-origin, malformed and oversized writes are rejected', async () => {
  const db = database();
  const handlers = handlersFor(db);
  assert.equal((await handlers.actions(post(input, { origin: 'https://attacker.example' }))).status, 403);
  assert.equal((await handlers.actions(post(input, { origin: '' }))).status, 403);
  assert.equal((await handlers.actions(post(input, { 'sec-fetch-site': 'cross-site' }))).status, 403);
  assert.equal((await handlers.actions(post('{not json'))).status, 400);
  assert.equal((await handlers.actions(post(input, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await handlers.actions(post({ ...input, expectedVersion: -1 }))).status, 400);
  assert.equal((await handlers.actions(post({ ...input, action: { type: 'review', reason: 'x'.repeat(66000) } }))).status, 413);
  assert.equal(db.sql.prepare('SELECT count(*) AS n FROM p2p_workspaces').get().n, 0);
});

test('human-role and validation rejections retain actionable evidence without writing state', async () => {
  const db = database();
  const handlers = handlersFor(db);
  const wrongActor = await handlers.actions(post({ ...input, actorId: 'mgr-airport' }));
  assert.equal(wrongActor.status, 403);
  const invalid = await handlers.actions(post({ ...input, action: { type: 'invalid' } }));
  assert.equal(invalid.status, 422);
  const detail = await invalid.json();
  assert.equal(detail.errors[0].ruleId, 'DEMO-R1');
  assert.equal((await storeFor(db).load('signed-in-owner')).version, 0);
  assert.equal((await storeFor(db).audit('signed-in-owner')).entries.length, 0);
});

test('successful actions persist submitted evidence and one append-only journal entry', async () => {
  const db = database();
  const handlers = handlersFor(db);
  const response = await handlers.actions(post(input));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).version, 1);
  const audit = await storeFor(db).audit('signed-in-owner', 'P2P-1001');
  assert.equal(audit.entries.length, 1);
  assert.equal(audit.entries[0].actorId, 'hr-ops');
  assert.equal(audit.entries[0].evidence.appendedEvents.length, 1);
  assert.equal(audit.entries[0].evidence.validationSnapshot.ruleVersion, 'demo-v2');
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
});

test('stale versions and a concurrent CAS failure do not append misleading audit rows', async () => {
  const db = database();
  const first = storeFor(db);
  const competing = storeFor(db);
  await first.load('owner');
  db.beforeBatch = () => competing.apply('owner', { ...input, action: { type: 'competing-human-review', requestId: 'P2P-1001' } });
  await assert.rejects(first.apply('owner', input), error => error instanceof ApiError && error.status === 409 && error.details.version === 1);
  let journal = await first.audit('owner');
  assert.equal(journal.entries.length, 1);
  assert.equal(journal.entries[0].action, 'competing-human-review');
  await assert.rejects(first.apply('owner', input), error => error.code === 'VERSION_CONFLICT');
  journal = await first.audit('owner');
  assert.equal(journal.entries.length, 1);
});

test('journal-write failure rolls back the state mutation atomically', async () => {
  const db = database();
  const store = storeFor(db);
  await store.load('owner');
  db.failJournal = true;
  await assert.rejects(store.apply('owner', input), /journal write failure/);
  assert.equal((await store.load('owner')).version, 0);
  assert.equal((await store.load('owner')).state.requests[0].status, 'pending');
  assert.equal((await store.audit('owner')).entries.length, 0);
});

test('reset requires HR/process-owner and preserves prior journal history and versions', async () => {
  const db = database();
  const store = storeFor(db);
  await store.apply('owner', input);
  await assert.rejects(store.apply('owner', { expectedVersion: 1, actorId: 'mgr-airport', action: { type: 'reset' } }), error => error.status === 403);
  const reset = await store.apply('owner', { expectedVersion: 1, actorId: 'process-owner', action: { type: 'reset' } });
  assert.equal(reset.version, 2);
  assert.equal(reset.state.requests[0].status, 'pending');
  const journal = await store.audit('owner');
  assert.deepEqual(journal.entries.map(entry => entry.version), [2, 1]);
  assert.equal(journal.entries[0].evidence.resetPreservesJournal, true);
});

test('real workflow persists a full human return/resubmission/approval lifecycle across sessions', async () => {
  const workflow = await import('../public/compass/workflow.js');
  const db = database();
  const makeSession = () => createWorkspaceStore({ db, domain: workflow, now: () => NOW, uuid: () => `MUTATION-${++id}` });
  const managerSession = makeSession();
  const hrSession = makeSession();
  const form = {
    type: 'transfer', employeeId: 'DEMO-E041', department: 'Airport Operations',
    sourcePositionId: 'POS-001', targetPositionId: 'POS-002', effectiveDate: '2026-11-01',
    justification: 'Synthetic movement for a documented operational structure change.', dependencyRequired: false,
  };
  const submitted = await managerSession.apply('shared-owner', { expectedVersion: 0, actorId: 'mgr-airport', action: { type: 'submit', form } });
  const requestId = submitted.state.requests.at(-1).id;
  let request = (await hrSession.load('shared-owner')).state.requests.find(item => item.id === requestId);
  assert.equal(request.ownerId, 'hr-ops');
  assert.equal(request.validationSnapshot.valid, true);
  assert.equal(request.validationSnapshot.form.employeeId, 'DEMO-E041');
  await hrSession.apply('shared-owner', { expectedVersion: 1, actorId: 'hr-ops', action: { type: 'review', requestId, decision: 'return', reason: 'Clarify the operational reason for the transfer.' } });
  request = (await managerSession.load('shared-owner')).state.requests.find(item => item.id === requestId);
  assert.equal(request.status, 'returned');
  assert.equal(request.ownerId, 'mgr-airport');
  await managerSession.apply('shared-owner', { expectedVersion: 2, actorId: 'mgr-airport', action: { type: 'resubmit', requestId, form: { ...form, justification: 'Clarified synthetic transfer to support the newly assigned operational team responsibilities.' } } });
  await hrSession.apply('shared-owner', { expectedVersion: 3, actorId: 'hr-ops', action: { type: 'review', requestId, decision: 'advance' } });
  request = (await makeSession().load('shared-owner')).state.requests.find(item => item.id === requestId);
  assert.equal(request.ownerId, 'approver-airport');
  await makeSession().apply('shared-owner', { expectedVersion: 4, actorId: 'approver-airport', action: { type: 'review', requestId, decision: 'advance' } });
  const completed = await hrSession.apply('shared-owner', { expectedVersion: 5, actorId: 'hr-ops', action: { type: 'review', requestId, decision: 'advance' } });
  request = completed.state.requests.find(item => item.id === requestId);
  assert.equal(request.status, 'completed');
  assert.equal(request.formRevisions.length, 2);
  assert.equal(completed.state.positions.find(item => item.id === 'POS-002').status, 'occupied');
  const journal = await managerSession.audit('shared-owner', requestId);
  assert.equal(journal.entries.length, 6);
  assert(journal.entries.every(entry => entry.evidence.actor.id && entry.evidence.appendedEvents.length));
  assert.equal(journal.entries.at(-1).evidence.validationSnapshot.form.justification, form.justification);
});
