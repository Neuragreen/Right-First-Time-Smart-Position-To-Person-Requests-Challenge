import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTORS, WORKFLOWS, RULE_VERSION, createInitialState, validateSubmission, applyAction, availableActions, requestHistory } from '../public/compass/workflow.js';

const NOW = '2026-10-23T10:00:00.000Z';
const initial = () => createInitialState(NOW);
const transfer = { type: 'transfer', department: 'Airport Operations', employeeId: 'DEMO-E041', sourcePositionId: 'POS-001', targetPositionId: 'POS-002', effectiveDate: '2026-11-01', justification: 'Synthetic movement to support a planned operational team structure.', dependencyRequired: false, dependencyId: '' };
const submit = (state = initial(), form = transfer) => applyAction(state, { type: 'submit', form }, 'mgr-airport', NOW);
const newest = state => state.requests.at(-1);
const advance = (state, requestId, actorId, reason = 'Human reviewer confirms this step.') => applyAction(state, { type: 'review', requestId, decision: 'advance', reason }, actorId, NOW);

test('seed state resolves four routes and specific actors without rewriting input fixtures', () => {
  const state = initial();
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.version, 0);
  assert.equal(state.requests.length, 32);
  assert.equal(ACTORS.find(actor => actor.id === 'hr-ops').role, 'hr');
  for (const request of state.requests) {
    assert(request.submittedBy.startsWith('mgr-'));
    assert.equal(request.route.length, 4);
    assert.equal(request.route[0].step, 'Validation');
    assert.equal(request.route.at(-1).step, 'Complete');
    assert(request.status === 'completed' || ACTORS.some(actor => actor.id === request.ownerId));
    assert.equal(requestHistory(request.id, state).at(-1).step, request.currentStep);
    assert.equal(request.validationSnapshot.ruleVersion, RULE_VERSION);
    assert.match(request.validationSnapshot.provenance, /Reconstructed/);
  }
  assert.equal(new Set(Object.values(WORKFLOWS).map(route => route.steps[1].step)).size, 4);
});

test('submission checks source relationships, occupancy, dependency references and a configured route', () => {
  const state = initial();
  const valid = validateSubmission(transfer, state);
  assert.equal(valid.valid, true);
  assert.equal(valid.route[1].ownerId, 'approver-airport');
  assert.equal(valid.checks.length, 8);
  assert(valid.checks.every(check => check.ruleId && check.evidence));
  assert.equal(validateSubmission({ ...transfer, employeeId: 'DEMO-E003' }, state).valid, false);
  assert.equal(validateSubmission({ ...transfer, employeeId: 'real-employee' }, state).valid, false);
  assert.equal(validateSubmission({ ...transfer, department: 'Engineering' }, state).valid, false);
  assert.equal(validateSubmission({ ...transfer, targetPositionId: 'POS-003' }, state).valid, false);
  assert.equal(validateSubmission({ ...transfer, dependencyRequired: true }, state).valid, false);
  assert.equal(validateSubmission({ ...transfer, dependencyId: 'P2P-NOT-REAL' }, state).valid, false);
  const waiting = validateSubmission({ ...transfer, dependencyId: 'P2P-1026' }, state);
  assert.equal(waiting.valid, true);
  assert.equal(waiting.warnings[0].ruleId, 'DEMO-007');
});

test('date validation uses shared observation date rather than the previous fixed demo snapshot', () => {
  const state = initial();
  assert.equal(validateSubmission({ ...transfer, effectiveDate: '2026-10-22' }, state).valid, false);
  assert.equal(validateSubmission({ ...transfer, effectiveDate: '2026-10-23' }, state).valid, true);
  assert.equal(validateSubmission({ ...transfer, effectiveDate: '2026-02-30' }, state).valid, false);
});

test('submission is immutable, uniquely identified and stores the validated form snapshot', () => {
  const before = initial(), encoded = JSON.stringify(before);
  const state = submit(before), request = newest(state);
  assert.equal(JSON.stringify(before), encoded);
  assert.equal(state.version, before.version + 1);
  assert.equal(request.id, 'P2P-1033');
  assert.equal(request.ownerId, 'hr-ops');
  assert.equal(request.currentStep, 'Validation');
  assert.equal(request.formRevisions[0].form.justification, transfer.justification);
  assert.equal(request.validationSnapshot.valid, true);
  assert.equal(request.validationSnapshot.at, NOW);
  assert.equal(state.notifications.at(-1).actorId, 'hr-ops');
  assert.equal(newest(submit(state)).id, 'P2P-1034');
  assert.throws(() => applyAction(before, { type: 'submit', form: { ...transfer, justification: '' } }, 'mgr-airport', NOW), error => error.code === 'VALIDATION_FAILED' && error.details.errors.some(item => item.field === 'justification'));
  assert.throws(() => applyAction(before, { type: 'submit', form: transfer }, 'hr-ops', NOW), error => error.code === 'ROLE_REQUIRED');
  assert.throws(() => applyAction(before, { type: 'submit', form: transfer }, 'mgr-customer', NOW), error => error.code === 'DEPARTMENT_REQUIRED');
});

test('only the assigned human can advance one stage; approvals are never automatic', () => {
  let state = submit(), request = newest(state);
  assert.throws(() => advance(state, request.id, 'mgr-airport'), error => error.code === 'NOT_ALLOWED');
  state = advance(state, request.id, 'hr-ops'); request = newest(state);
  assert.equal(request.currentStep, 'Receiving manager approval');
  assert.equal(request.ownerId, 'approver-airport');
  assert.equal(request.status, 'pending');
  assert.throws(() => advance(state, request.id, 'hr-ops'), error => error.code === 'NOT_ALLOWED');
  assert.throws(() => advance(state, request.id, 'approver-engineering'), error => error.code === 'NOT_ALLOWED');
  state = advance(state, request.id, 'approver-airport'); request = newest(state);
  assert.equal(request.currentStep, 'Position update');
  assert.equal(request.status, 'pending');
  state = advance(state, request.id, 'hr-ops'); request = newest(state);
  assert.equal(request.status, 'completed');
  assert.equal(state.positions.find(position => position.id === 'POS-001').status, 'vacant');
  assert.equal(state.positions.find(position => position.id === 'POS-002').status, 'occupied');
  assert.equal(state.employees.find(employee => employee.id === 'DEMO-E041').positionId, 'POS-002');
  assert(requestHistory(request.id, state).some(event => event.outcome === 'approved' && event.actorId === 'approver-airport' && event.humanAction));
  assert.equal(availableActions(request, 'hr-ops', state).length, 0);
});

test('return requires a reason and resubmission retains earlier forms and every recorded return', () => {
  let state = submit(); const requestId = newest(state).id;
  assert.throws(() => applyAction(state, { type: 'review', requestId, decision: 'return', reason: '' }, 'hr-ops', NOW), error => error.code === 'REASON_REQUIRED');
  state = applyAction(state, { type: 'review', requestId, decision: 'return', reason: 'Please clarify the operational justification.' }, 'hr-ops', NOW);
  assert.equal(newest(state).ownerId, 'mgr-airport');
  assert.equal(newest(state).currentStep, 'Correction');
  assert.throws(() => applyAction(state, { type: 'resubmit', requestId, form: transfer }, 'mgr-customer', NOW), error => error.code === 'NOT_ALLOWED');
  state = applyAction(state, { type: 'resubmit', requestId, form: { ...transfer, justification: 'Clarified synthetic operational justification with more specific detail.' } }, 'mgr-airport', NOW);
  const request = newest(state);
  assert.equal(request.formRevisions.length, 2);
  assert.equal(request.formRevisions[0].form.justification, transfer.justification);
  assert.equal(request.submittedAt, NOW);
  assert.equal(request.currentStep, 'Validation');
  assert.equal(request.ownerId, 'hr-ops');
  assert(requestHistory(requestId, state).some(event => event.outcome === 'returned' && event.returnReason));
  assert(requestHistory(requestId, state).some(event => event.outcome === 'resubmitted'));
});

test('dependency links reject self/cycles and prevent progression while the upstream case is unfinished', () => {
  let state = submit(initial(), { ...transfer, dependencyId: 'P2P-1026' });
  const requestId = newest(state).id;
  assert.throws(() => advance(state, requestId, 'hr-ops'), error => error.code === 'DEPENDENCY_PENDING');
  assert.equal(validateSubmission({ ...transfer, dependencyId: requestId }, state, requestId).valid, false);
  const upstream = state.requests.find(request => request.id === 'P2P-1026');
  upstream.dependencyId = requestId;
  assert.equal(validateSubmission({ ...transfer, dependencyId: upstream.id }, state, requestId).valid, false);
});

test('structured blockers retain the current stage, require an owner and cannot invent an upstream cause', () => {
  let state = submit(); const requestId = newest(state).id;
  assert.throws(() => applyAction(state, { type: 'block', requestId, category: 'system', reason: 'System action unavailable' }, 'hr-ops', NOW), error => error.code === 'OWNER_REQUIRED');
  state = applyAction(state, { type: 'block', requestId, category: 'system', reason: 'Synthetic system action unavailable.', resolutionOwnerId: 'hr-casework' }, 'hr-ops', NOW);
  assert.equal(newest(state).currentStep, 'Validation');
  assert.equal(newest(state).ownerId, 'hr-casework');
  assert.equal(newest(state).dependencyId, '');
  assert.equal(newest(state).blocker.category, 'system');
  assert.throws(() => advance(state, requestId, 'hr-ops'), error => error.code === 'NOT_ALLOWED');
  state = applyAction(state, { type: 'resolve', requestId, reason: 'The synthetic system action is available again.' }, 'hr-casework', NOW);
  assert.equal(newest(state).currentStep, 'Validation');
  assert.equal(newest(state).ownerId, 'hr-ops');
  assert.equal(newest(state).blocker, null);
  assert(requestHistory(requestId, state).some(event => event.outcome === 'resolved' && event.resolvedBlocker.category === 'system'));
});

test('assignment respects step roles and approval departments', () => {
  let state = submit(); const requestId = newest(state).id;
  assert.throws(() => applyAction(state, { type: 'assign', requestId, ownerId: 'mgr-airport' }, 'hr-ops', NOW), error => error.code === 'ROLE_REQUIRED');
  state = applyAction(state, { type: 'assign', requestId, ownerId: 'hr-casework' }, 'hr-ops', NOW);
  assert.equal(newest(state).ownerId, 'hr-casework');
  state = advance(state, requestId, 'hr-casework');
  assert.throws(() => applyAction(state, { type: 'assign', requestId, ownerId: 'approver-engineering' }, 'hr-ops', NOW), error => error.code === 'ROUTING_MISMATCH');
});

test('create, delete and end-service use distinct human routes and update only synthetic positions', () => {
  const scenarios = [
    { type: 'create', department: 'Airport Operations', effectiveDate: '2026-11-01', positionTitle: 'Synthetic planning role', grade: 'G7', justification: 'A synthetic position to support planned operational capacity.' },
    { type: 'delete', department: 'Airport Operations', effectiveDate: '2026-11-01', sourcePositionId: 'POS-002', justification: 'A synthetic vacant role is no longer needed in this team.' },
    { type: 'end-service', department: 'Airport Operations', effectiveDate: '2026-11-01', employeeId: 'DEMO-E041', sourcePositionId: 'POS-001', endServiceAction: 'retain-vacant', justification: 'Synthetic employee end-of-service position clearance.' },
  ];
  for (const form of scenarios) {
    let state = submit(initial(), form); const id = newest(state).id;
    const approvalStep = newest(state).route[1].step;
    state = advance(state, id, 'hr-ops');
    assert.equal(newest(state).currentStep, approvalStep);
    state = advance(state, id, 'approver-airport');
    assert.notEqual(newest(state).status, 'completed');
    state = advance(state, id, 'hr-ops');
    assert.equal(newest(state).status, 'completed');
    if (form.type === 'create') assert(state.positions.some(position => position.createdByRequestId === id && position.status === 'vacant'));
    if (form.type === 'delete') assert.equal(state.positions.find(position => position.id === 'POS-002').status, 'deleted');
    if (form.type === 'end-service') assert.equal(state.positions.find(position => position.id === 'POS-001').status, 'vacant');
  }
});
