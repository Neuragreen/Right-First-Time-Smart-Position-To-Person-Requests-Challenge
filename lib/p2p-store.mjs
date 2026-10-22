/** Server-authoritative synthetic workspace persistence. No HR integration. */
export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const MAX_BODY_BYTES = 64 * 1024;
const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: jsonHeaders });

function validUser(userId) {
  if (typeof userId !== 'string' || !userId || userId.length > 512) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Sign in with ChatGPT to access your private demo workspace.', {
      signInPath: '/signin-with-chatgpt?return_to=%2F',
    });
  }
}

export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') {
    throw new ApiError(403, 'ORIGIN_REQUIRED', 'A same-origin browser request is required.');
  }
  let supplied;
  try { supplied = new URL(origin).origin; } catch {
    throw new ApiError(403, 'ORIGIN_MISMATCH', 'The request origin is not permitted.');
  }
  if (supplied !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new ApiError(403, 'ORIGIN_MISMATCH', 'The request origin is not permitted.');
  }
}

export async function readActionBody(request) {
  const type = request.headers.get('content-type')?.split(';')[0]?.trim();
  if (type !== 'application/json') {
    throw new ApiError(415, 'JSON_REQUIRED', 'Send the action as application/json.');
  }
  const declaredSize = Number(request.headers.get('content-length') || 0);
  if (declaredSize > MAX_BODY_BYTES) throw new ApiError(413, 'BODY_TOO_LARGE', 'The demo action is too large.');
  let text = '';
  if (request.body) {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ApiError(413, 'BODY_TOO_LARGE', 'The demo action is too large.');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }
  let body;
  try { body = JSON.parse(text); } catch {
    throw new ApiError(400, 'INVALID_JSON', 'The action body is not valid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0 ||
      typeof body.actorId !== 'string' || !body.actorId || body.actorId.length > 100 ||
      !body.action || typeof body.action !== 'object' || Array.isArray(body.action) ||
      typeof body.action.type !== 'string' || !body.action.type || body.action.type.length > 50) {
    throw new ApiError(400, 'INVALID_ACTION', 'Provide expectedVersion, a demo actorId and an action type.');
  }
  return body;
}

export function createWorkspaceStore({ db, domain, now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() }) {
  if (!db?.prepare || !db?.batch) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'The shared demo database is unavailable.');
  if (!domain?.createInitialState || !domain?.applyAction) throw new Error('A workflow domain implementation is required.');

  async function load(userId) {
    validUser(userId);
    let row = await db.prepare('SELECT id, state_json, version, updated_at FROM p2p_workspaces WHERE id = ?').bind(userId).first();
    if (!row) {
      const initial = domain.createInitialState(now());
      initial.version = 0;
      await db.prepare('INSERT OR IGNORE INTO p2p_workspaces (id, state_json, version, updated_at, last_mutation_id) VALUES (?, ?, 0, ?, ?)')
        .bind(userId, JSON.stringify(initial), initial.asOf || now(), '').run();
      // A competing first request may have inserted the row. Always re-read it.
      row = await db.prepare('SELECT id, state_json, version, updated_at FROM p2p_workspaces WHERE id = ?').bind(userId).first();
    }
    if (!row) throw new Error('Workspace initialization failed.');
    const state = JSON.parse(row.state_json);
    state.version = Number(row.version);
    state.asOf = now();
    return { state, version: Number(row.version), serverTime: state.asOf, storage: 'D1', demo: true };
  }

  async function apply(userId, input) {
    validUser(userId);
    const current = await load(userId);
    if (current.version !== input.expectedVersion) {
      throw new ApiError(409, 'VERSION_CONFLICT', 'The workspace changed. Review the latest state and try again.', current);
    }
    const actor = (current.state.actors || domain.ACTORS || []).find(item => item.id === input.actorId);
    if (!actor) throw new ApiError(403, 'UNKNOWN_DEMO_ACTOR', 'Choose a known synthetic demo actor.');
    const timestamp = now();
    let next;
    if (input.action.type === 'reset') {
      if (!['hr', 'process-owner'].includes(actor.role)) {
        throw new ApiError(403, 'ACTION_FORBIDDEN', 'Only the demo HR or process owner can reset the synthetic workspace.');
      }
      next = domain.createInitialState(timestamp);
    } else {
      try {
        next = await domain.applyAction(structuredClone(current.state), input.action, input.actorId, timestamp);
      } catch (error) {
        throw domainError(error);
      }
    }
    if (!next || !Array.isArray(next.requests) || !Array.isArray(next.events)) throw new Error('The workflow returned an invalid state.');
    const version = current.version + 1;
    next.version = version;
    next.asOf = timestamp;
    const mutationId = uuid();
    const oldEvents = new Set(current.state.events.map(item => item.id));
    const appended = next.events.filter(item => !oldEvents.has(item.id));
    const newRequest = next.requests.find(item => !current.state.requests.some(old => old.id === item.id));
    const requestId = input.action.requestId || newRequest?.id || appended.at(-1)?.requestId || null;
    const payload = {
      source: 'Synthetic demonstration; no live HR action',
      actor: { id: actor.id, role: actor.role, name: actor.name || actor.id },
      action: input.action,
      previousVersion: current.version,
      version,
      appendedEvents: appended,
      validationSnapshot: requestId ? next.requests.find(item => item.id === requestId)?.validationSnapshot || null : null,
      resetPreservesJournal: input.action.type === 'reset' ? true : undefined,
    };
    // D1 batch is transactional. The insert only runs for this mutation token,
    // so a failed optimistic update cannot create an audit entry for another update.
    const result = await db.batch([
      db.prepare('UPDATE p2p_workspaces SET state_json = ?, version = ?, updated_at = ?, last_mutation_id = ? WHERE id = ? AND version = ?')
        .bind(JSON.stringify(next), version, timestamp, mutationId, userId, current.version),
      db.prepare('INSERT INTO p2p_audit (id, workspace_id, version, actor_id, action, request_id, timestamp, payload_json) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM p2p_workspaces WHERE id = ? AND version = ? AND last_mutation_id = ?)')
        .bind(mutationId, userId, version, actor.id, input.action.type, requestId, timestamp, JSON.stringify(payload), userId, version, mutationId),
    ]);
    if (Number(result[0]?.meta?.changes || 0) !== 1) {
      throw new ApiError(409, 'VERSION_CONFLICT', 'Another session updated this workspace. Review its latest state and try again.', await load(userId));
    }
    return { state: next, version, serverTime: timestamp, storage: 'D1', demo: true };
  }

  async function audit(userId, requestId = null, limit = 100) {
    validUser(userId);
    const boundedLimit = Math.max(1, Math.min(200, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 100));
    if (requestId !== null && (typeof requestId !== 'string' || requestId.length > 100)) {
      throw new ApiError(400, 'INVALID_REQUEST_ID', 'Use a valid request reference.');
    }
    const statement = requestId
      ? db.prepare('SELECT id, version, actor_id, action, request_id, timestamp, payload_json FROM p2p_audit WHERE workspace_id = ? AND request_id = ? ORDER BY version DESC LIMIT ?').bind(userId, requestId, boundedLimit)
      : db.prepare('SELECT id, version, actor_id, action, request_id, timestamp, payload_json FROM p2p_audit WHERE workspace_id = ? ORDER BY version DESC LIMIT ?').bind(userId, boundedLimit);
    const result = await statement.all();
    return {
      entries: (result.results || []).map(row => ({
        id: row.id, version: row.version, actorId: row.actor_id, action: row.action,
        requestId: row.request_id, timestamp: row.timestamp, evidence: JSON.parse(row.payload_json),
      })),
      storage: 'D1', demo: true, appendOnly: true, limit: boundedLimit,
    };
  }

  return { load, apply, audit };
}

function domainError(error) {
  if (error instanceof ApiError) return error;
  const code = typeof error?.code === 'string' ? error.code : 'WORKFLOW_REJECTED';
  const explicitStatus = Number(error?.status);
  const status = [400, 403, 404, 409, 422].includes(explicitStatus) ? explicitStatus
    : /FORBIDDEN|NOT_ALLOWED|UNAUTHORIZED|ROLE/i.test(code) ? 403
    : /NOT_FOUND/i.test(code) ? 404 : 422;
  const details = {};
  if (error?.details && typeof error.details === 'object') details.details = error.details;
  for (const key of ['errors', 'warnings', 'checks', 'validation']) {
    if (error?.[key] !== undefined) details[key] = error[key];
    else if (error?.details?.[key] !== undefined) details[key] = error.details[key];
  }
  return new ApiError(status, code, error?.message || 'The workflow could not accept this action.', details);
}

/** Framework-independent HTTP adapters let tests exercise auth, CSRF and conflicts. */
export function createApiHandlers({ getUser, getDatabase, domain, now = undefined, uuid = undefined, onError = () => {} }) {
  async function context() {
    const user = await getUser();
    validUser(user?.userId);
    return { userId: user.userId, store: createWorkspaceStore({ db: await getDatabase(), domain, now, uuid }) };
  }
  async function respond(operation) {
    try { return json(await operation()); } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message, code: error.code, ...error.details }, error.status);
      onError(error);
      return json({ error: 'The shared demo service could not complete this request.', code: 'SERVICE_UNAVAILABLE' }, 503);
    }
  }
  return {
    state: request => respond(async () => {
      if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET to read the workspace.');
      const { userId, store } = await context();
      return store.load(userId);
    }),
    actions: request => respond(async () => {
      if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST to record a demo action.');
      assertSameOrigin(request);
      const input = await readActionBody(request);
      const { userId, store } = await context();
      try { return await store.apply(userId, input); } catch (error) {
        if (error instanceof ApiError) throw error;
        // A domain rejection is safe to explain, but database failures are not.
        // Store/database errors are surfaced as unavailable unless the domain
        // deliberately attaches a code or validation details.
        if (error?.code || error?.errors || error?.validation) throw domainError(error);
        throw error;
      }
    }),
    audit: request => respond(async () => {
      if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET to read the journal.');
      const { userId, store } = await context();
      const params = new URL(request.url).searchParams;
      return store.audit(userId, params.get('requestId'), params.get('limit') || 100);
    }),
  };
}
