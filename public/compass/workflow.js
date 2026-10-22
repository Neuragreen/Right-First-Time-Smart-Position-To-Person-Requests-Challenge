/** Pure, shared domain rules for the synthetic P2P demonstration.
 * Every policy and approval route here is illustrative, not Emirates policy.
 * The UI's actor selector simulates roles. It is not enterprise authentication.
 */
import { demoRequests, events as seedEvents, positions as seedPositions } from './engine.js';

export const RULE_VERSION = 'DEMO-WORKFLOW-2';
const departments = [
  ['airport', 'Airport Operations'], ['customer', 'Customer Experience'],
  ['people', 'People Services'], ['engineering', 'Engineering'],
];
export const ACTORS = [
  ...departments.map(([key, department]) => ({ id: `mgr-${key}`, name: `Demo ${department} manager`, role: 'manager', department })),
  { id: 'hr-ops', name: 'Demo HR operations specialist', role: 'hr', department: 'People Services' },
  { id: 'hr-casework', name: 'Demo HR casework specialist', role: 'hr', department: 'People Services' },
  ...departments.map(([key, department]) => ({ id: `approver-${key}`, name: `Demo ${department} approver`, role: 'approver', department })),
  { id: 'process-owner', name: 'Demo HR process owner', role: 'process-owner', department: 'People Services' },
];
const stage = (step, role, ownerSource) => ({ step, role, ownerSource });
export const WORKFLOWS = {
  transfer: { title: 'Employee transfer', targetHours: 72, version: RULE_VERSION, steps: [stage('Validation', 'hr', 'hr'), stage('Receiving manager approval', 'approver', 'targetApprover'), stage('Position update', 'hr', 'hr'), stage('Complete', null, null)] },
  create: { title: 'Create position', targetHours: 96, version: RULE_VERSION, steps: [stage('Validation', 'hr', 'hr'), stage('Position creation approval', 'approver', 'departmentApprover'), stage('Create position', 'hr', 'hr'), stage('Complete', null, null)] },
  'end-service': { title: 'End-of-service action', targetHours: 48, version: RULE_VERSION, steps: [stage('Validation', 'hr', 'hr'), stage('End-of-service clearance', 'approver', 'departmentApprover'), stage('End-of-service position action', 'hr', 'hr'), stage('Complete', null, null)] },
  delete: { title: 'Delete position', targetHours: 48, version: RULE_VERSION, steps: [stage('Validation', 'hr', 'hr'), stage('Position deletion review', 'approver', 'departmentApprover'), stage('Delete position', 'hr', 'hr'), stage('Complete', null, null)] },
};
const clone = value => structuredClone(value);
const normaliseDate = value => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw domainError('INVALID_TIME', 'A valid observation time is required.');
  return new Date(time).toISOString();
};
function domainError(code, message, details) { const error = new Error(message); error.code = code; if (details) error.details = details; return error; }
function actorById(state, id) { return (state.actors || ACTORS).find(actor => actor.id === id); }
function managerFor(department) { return ACTORS.find(actor => actor.role === 'manager' && actor.department === department); }
function approverFor(department) { return ACTORS.find(actor => actor.role === 'approver' && actor.department === department); }
const formKeys = ['type', 'employeeId', 'department', 'sourcePositionId', 'targetPositionId', 'effectiveDate', 'justification', 'grade', 'positionTitle', 'dependencyId', 'endServiceAction'];
function cleanForm(input = {}) {
  const form = Object.fromEntries(formKeys.map(key => [key, String(input[key] ?? '').trim()]));
  form.dependencyRequired = input.dependencyRequired === true;
  return form;
}
export function resolveRoute(form, state) {
  const workflow = WORKFLOWS[form.type];
  if (!workflow) return [];
  const target = state.positions.find(position => position.id === form.targetPositionId);
  return workflow.steps.map(item => {
    const department = item.ownerSource === 'targetApprover' ? (target?.department || form.department) : form.department;
    const owner = item.ownerSource === 'hr' ? actorById(state, 'hr-ops') : item.role ? approverFor(department) : null;
    return { step: item.step, role: item.role, ownerId: owner?.id || null, owner: owner?.name || (item.role ? 'Unresolved owner' : 'No action required') };
  });
}
function dependencyProblem(form, state, currentId) {
  const id = form.dependencyId;
  if (!id) return form.dependencyRequired ? { code: 'MISSING_DEPENDENCY', message: 'Identify the declared upstream request.', fix: 'Add a valid upstream request reference or remove the dependency declaration.' } : null;
  if (id === currentId) return { code: 'SELF_DEPENDENCY', message: 'A request cannot depend on itself.', fix: 'Choose a different upstream request.' };
  const upstream = state.requests.find(request => request.id === id);
  if (!upstream) return { code: 'UNKNOWN_DEPENDENCY', message: 'The upstream reference does not match a request.', fix: 'Choose an existing synthetic request from the tracker.' };
  const visited = new Set();
  let next = upstream;
  while (next) {
    if (next.id === currentId || visited.has(next.id)) return { code: 'CYCLIC_DEPENDENCY', message: 'This link creates or enters a circular dependency.', fix: 'Ask HR to correct the upstream request chain.' };
    visited.add(next.id);
    next = state.requests.find(request => request.id === next.dependencyId);
  }
  return null;
}
export function pendingDependency(request, state) {
  if (!request.dependencyId) return null;
  const upstream = state.requests.find(item => item.id === request.dependencyId);
  return upstream?.status === 'completed' ? null : upstream || { id: request.dependencyId, status: 'unknown', owner: 'HR to identify owner' };
}
export function validateSubmission(input = {}, state, excludeRequestId) {
  const form = cleanForm(input);
  const errors = [], warnings = [];
  const definitions = [
    ['DEMO-001', 'Required request information'], ['DEMO-002', 'Position references'],
    ['DEMO-003', 'Position occupancy and movement'], ['DEMO-004', 'Employee and organisational relationships'],
    ['DEMO-005', 'Effective date'], ['DEMO-006', 'Business justification'],
    ['DEMO-007', 'Dependencies'], ['DEMO-008', 'Human approval route'],
  ];
  const error = (field, ruleId, message, fix) => errors.push({ field, ruleId, message, fix });
  const required = (field, label) => { if (!form[field]) error(field, 'DEMO-001', `${label} is required.`, `Provide ${label.toLowerCase()}.`); };
  if (!WORKFLOWS[form.type]) error('type', 'DEMO-001', 'Choose a supported request type.', 'Select transfer, create, end-of-service or delete.');
  required('department', 'Department'); required('effectiveDate', 'Effective date');
  if (!departments.some(([, department]) => department === form.department) && form.department) error('department', 'DEMO-004', 'The department is not in the demo organisation.', 'Choose a listed department.');
  if (['transfer', 'end-service'].includes(form.type)) required('employeeId', 'Synthetic employee reference');
  if (['transfer', 'end-service', 'delete'].includes(form.type)) required('sourcePositionId', 'Current position');
  if (form.type === 'transfer') required('targetPositionId', 'Destination position');
  if (form.type === 'create') {
    required('positionTitle', 'New position title'); required('grade', 'Grade');
    if (form.grade && !['G5', 'G6', 'G7', 'G8', 'G9'].includes(form.grade)) error('grade', 'DEMO-004', 'The grade is outside the illustrative demo register.', 'Select G5, G6, G7, G8 or G9.');
  }
  if (form.type === 'end-service' && !['retain-vacant', 'delete-position'].includes(form.endServiceAction)) error('endServiceAction', 'DEMO-001', 'Choose the end-of-service position action.', 'Select retain vacant or delete position after human clearance.');
  const source = state.positions.find(position => position.id === form.sourcePositionId);
  const target = state.positions.find(position => position.id === form.targetPositionId);
  if (form.sourcePositionId && !source) error('sourcePositionId', 'DEMO-002', 'The current position does not exist in the demo register.', 'Select an existing position.');
  if (form.type === 'transfer' && form.targetPositionId && !target) error('targetPositionId', 'DEMO-002', 'The destination does not exist in the demo register.', 'Select an existing position.');
  if (source?.status === 'deleted') error('sourcePositionId', 'DEMO-003', 'The source position has been deleted.', 'Select an active position.');
  if (form.type === 'transfer') {
    if (target && target.status !== 'vacant') error('targetPositionId', 'DEMO-003', 'The destination position is not vacant.', 'Select a vacant destination or ask HR to resolve occupancy.');
    if (source && source.status !== 'occupied') error('sourcePositionId', 'DEMO-003', 'The transfer source is not occupied.', 'Choose the employee’s occupied source position.');
    if (form.sourcePositionId && form.sourcePositionId === form.targetPositionId) error('targetPositionId', 'DEMO-003', 'Source and destination must be different.', 'Choose a different destination.');
  }
  if (form.type === 'delete' && source && source.status !== 'vacant') error('sourcePositionId', 'DEMO-003', 'Only a vacant position can be deleted in this demo.', 'Complete any employee movement or clearance first.');
  if (form.type === 'end-service' && source && source.status !== 'occupied') error('sourcePositionId', 'DEMO-003', 'The end-of-service source must be occupied.', 'Choose the employee’s current occupied position.');
  if (source && form.department && source.department !== form.department) error('department', 'DEMO-004', 'The submitting department does not match the source position.', 'Select the source position’s department; cross-department transfers use the destination approver.');
  if (form.employeeId && ['transfer', 'end-service'].includes(form.type)) {
    const employee = (state.employees || []).find(item => item.id === form.employeeId);
    if (!/^DEMO-[A-Z0-9-]+$/i.test(form.employeeId)) error('employeeId', 'DEMO-004', 'Only synthetic DEMO employee references are accepted.', 'Use a listed DEMO employee reference; do not enter real employee information.');
    else if (!employee) error('employeeId', 'DEMO-004', 'This reference is not in the synthetic employee register.', 'Choose a listed demo employee, for example DEMO-E041.');
    else if (source && employee.positionId !== source.id) error('employeeId', 'DEMO-004', 'The employee is not linked to the selected source position.', `Select ${employee.positionId} or the correct synthetic employee.`);
  }
  if (form.effectiveDate) {
    const parsed = Date.parse(`${form.effectiveDate}T00:00:00Z`);
    const today = String(state.asOf).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.effectiveDate) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== form.effectiveDate || form.effectiveDate < today) error('effectiveDate', 'DEMO-005', `Use a valid date on or after ${today}.`, 'Choose a current or future effective date against the shared observation clock.');
  }
  if (form.justification.length < 20) error('justification', 'DEMO-006', 'Explain the business reason in at least 20 characters.', 'Provide a specific operational justification.');
  if (form.justification.length > 5000) error('justification', 'DEMO-006', 'The justification exceeds the demo limit of 5,000 characters.', 'Shorten the justification.');
  const dependencyIssue = dependencyProblem(form, state, excludeRequestId);
  if (dependencyIssue) error('dependencyId', 'DEMO-007', dependencyIssue.message, dependencyIssue.fix);
  else if (form.dependencyId) {
    const upstream = state.requests.find(request => request.id === form.dependencyId);
    if (upstream.status !== 'completed') warnings.push({ field: 'dependencyId', ruleId: 'DEMO-007', message: `${upstream.id} is still ${upstream.status}; progression waits for completion.`, fix: `Coordinate with ${upstream.owner || 'the upstream owner'}.` });
  }
  const route = resolveRoute(form, state);
  if (!route.length || route.some(item => item.role && !item.ownerId)) error('department', 'DEMO-008', 'The proposed human approval route has an unresolved owner.', 'Ask HR to configure the department’s approver.');
  const checks = definitions.map(([ruleId, title]) => {
    const failures = errors.filter(item => item.ruleId === ruleId), notes = warnings.filter(item => item.ruleId === ruleId);
    return { ruleId, title, status: failures.length ? 'fail' : notes.length ? 'warning' : 'pass', evidence: failures.length ? failures.map(item => item.message).join(' ') : notes.length ? notes.map(item => item.message).join(' ') : ruleId === 'DEMO-008' ? route.map(item => `${item.step}: ${item.owner}`).join(' → ') : 'Passed against the synthetic register and illustrative rule configuration.' };
  });
  return { valid: errors.length === 0, errors, warnings, route, checks, ruleVersion: RULE_VERSION };
}
export function requestHistory(id, state) {
  const cutoff = Date.parse(state.asOf);
  return state.events.filter(event => event.requestId === id && Number.isFinite(Date.parse(event.timestamp)) && Date.parse(event.timestamp) <= cutoff).map((event, index) => ({ event, index })).sort((a, b) => Date.parse(a.event.timestamp) - Date.parse(b.event.timestamp) || a.index - b.index).map(({ event }) => event);
}
function snapshot(form, validation, at, actorId) { return { at, actorId, ruleVersion: RULE_VERSION, form: clone(form), checks: clone(validation.checks), route: clone(validation.route), valid: validation.valid, warnings: clone(validation.warnings) }; }
export function createInitialState(now = new Date().toISOString()) {
  const state = { schemaVersion: 2, version: 0, asOf: normaliseDate(now), requests: [], events: [], positions: clone(seedPositions), actors: clone(ACTORS), employees: [], notifications: [], dataSource: 'Generated synthetic demonstration data; illustrative policies' };
  state.employees = demoRequests.filter(item => item.employeeId).map(item => ({ id: item.employeeId, positionId: item.sourcePositionId, department: item.department, name: `Synthetic employee ${item.employeeId}`, status: 'active' }));
  state.employees.push({ id: 'DEMO-E041', positionId: 'POS-001', department: 'Airport Operations', name: 'Synthetic employee DEMO-E041', status: 'active' });
  state.requests = clone(demoRequests).map(request => {
    const form = cleanForm({ ...request, endServiceAction: request.type === 'end-service' ? 'retain-vacant' : '' });
    const route = resolveRoute(form, state);
    const stepIndex = request.status === 'completed' ? 3 : request.currentStep === 'Approval' ? 1 : request.currentStep === 'Position update' ? 2 : 0;
    const submitter = managerFor(request.department);
    const normalStep = request.status === 'returned' ? 'Correction' : route[stepIndex].step;
    const owner = request.status === 'returned' ? submitter : actorById(state, route[stepIndex].ownerId);
    return { ...request, ...form, submittedBy: submitter.id, submitter: submitter.name, route, stepIndex, currentStep: normalStep, ownerId: owner?.id || null, owner: owner?.name || 'No action required', workflowVersion: RULE_VERSION, formRevisions: [], validationSnapshot: null, blocker: request.status === 'blocked' ? { category: 'dependency', reason: `Recorded upstream dependency ${request.dependencyId} is unresolved.`, resolutionOwnerId: 'hr-ops', resolutionOwner: actorById(state, 'hr-ops').name, dependencyId: request.dependencyId, recordedAt: request.submittedAt, pendingOwnerId: route[stepIndex].ownerId } : null };
  });
  state.events = clone(seedEvents).map(event => {
    const request = state.requests.find(item => item.id === event.requestId);
    const mappedStep = event.step === 'Approval' ? request.route[1].step : event.step === 'Position update' ? request.route[2].step : event.step;
    const actorId = event.step === 'Submitted' || event.step === 'Correction' ? request.submittedBy : event.step === 'Approval' ? request.route[1].ownerId : 'hr-ops';
    const actor = actorById(state, actorId);
    return { ...event, step: mappedStep, actorId, actor: actor.name, sequence: Number(event.id.split('E').at(-1)) || 0, dataSource: 'Synthetic fixture event' };
  });
  for (const request of state.requests) {
    const validation = validateSubmission(request, state, request.id);
    request.validationSnapshot = snapshot(cleanForm(request), validation, request.submittedAt, request.submittedBy);
    request.validationSnapshot.provenance = 'Reconstructed from initial synthetic fixture; not an original submission audit';
    request.formRevisions = [{ version: 1, at: request.submittedAt, actorId: request.submittedBy, form: cleanForm(request), validationSnapshot: clone(request.validationSnapshot) }];
    if (request.blocker) request.blocker.recordedAt = requestHistory(request.id, state).findLast(item => item.outcome === 'blocked')?.timestamp || request.submittedAt;
  }
  return state;
}
function addEvent(state, request, actor, step, outcome, extra = {}) {
  const sequence = state.events.filter(item => item.requestId === request.id).length + 1;
  const event = { id: `${request.id}-V${state.version + 1}-E${sequence}`, requestId: request.id, step, actorId: actor.id, actor: actor.name, team: actor.role === 'manager' ? 'Line management' : actor.role === 'approver' ? actor.department : 'HR Operations', timestamp: state.asOf, outcome, sequence, humanAction: true, ...extra };
  state.events.push(event); return event;
}
function notify(state, request, message, eventId) {
  if (!request.ownerId) return;
  state.notifications.push({ id: `NOTICE-${state.version + 1}-${state.notifications.length + 1}`, requestId: request.id, actorId: request.ownerId, message, at: state.asOf, eventId, read: false });
}
function setStage(request, index, state) {
  request.stepIndex = index; request.currentStep = request.route[index].step;
  request.ownerId = request.route[index].ownerId;
  request.owner = actorById(state, request.ownerId)?.name || 'No action required';
  request.status = index === request.route.length - 1 ? 'completed' : 'pending';
}
function ensureAllowed(condition, code, message, details) { if (!condition) throw domainError(code, message, details); }
function recordPositionOutcome(request, state) {
  const source = state.positions.find(item => item.id === request.sourcePositionId);
  const target = state.positions.find(item => item.id === request.targetPositionId);
  const employee = state.employees.find(item => item.id === request.employeeId);
  if (request.type === 'transfer') {
    ensureAllowed(source?.status === 'occupied' && target?.status === 'vacant', 'POSITION_CHANGED', 'Position occupancy changed. HR must resolve it before completing the transfer.');
    source.status = 'vacant'; target.status = 'occupied'; if (employee) employee.positionId = target.id;
  } else if (request.type === 'create') {
    const next = Math.max(8, ...state.positions.map(item => Number(item.id.split('-').at(-1)) || 0)) + 1;
    const created = { id: `POS-${String(next).padStart(3, '0')}`, title: request.positionTitle, department: request.department, grade: request.grade, status: 'vacant', manager: managerFor(request.department)?.name, createdByRequestId: request.id };
    state.positions.push(created); request.createdPositionId = created.id;
  } else if (request.type === 'end-service') {
    ensureAllowed(source?.status === 'occupied', 'POSITION_CHANGED', 'Position occupancy changed. HR must resolve it before recording the end-of-service action.');
    source.status = request.endServiceAction === 'delete-position' ? 'deleted' : 'vacant';
    if (employee) { employee.positionId = null; employee.status = 'ended'; }
  } else if (request.type === 'delete') {
    ensureAllowed(source?.status === 'vacant', 'POSITION_CHANGED', 'The position must still be vacant before deletion.');
    source.status = 'deleted';
  }
}
export function availableActions(request, actorId, state) {
  const actor = actorById(state, actorId);
  if (!actor) return [];
  if (!request) return actor.role === 'manager' ? ['submit'] : [];
  if (request.status === 'completed') return [];
  const result = [];
  if (request.status === 'returned') {
    if (request.submittedBy === actorId && actor.role === 'manager') result.push('resubmit');
    return result;
  }
  if (request.status === 'blocked') {
    if (actor.role === 'hr' || request.blocker?.resolutionOwnerId === actorId) result.push('resolve');
    if (actor.role === 'hr') result.push('assign');
    return result;
  }
  if (actorId === request.ownerId && actor.role === request.route[request.stepIndex]?.role) result.push('review', 'block');
  if (actor.role === 'hr') { if (!result.includes('block')) result.push('block'); result.push('assign'); }
  return result;
}
export function applyAction(currentState, action, actorId, now = new Date().toISOString()) {
  ensureAllowed(action && typeof action.type === 'string', 'INVALID_ACTION', 'Choose a supported action.');
  const actor = actorById(currentState, actorId);
  ensureAllowed(actor, 'UNKNOWN_ACTOR', 'Choose an existing demo actor.');
  const state = clone(currentState);
  const requestedTime = Date.parse(normaliseDate(now));
  state.asOf = new Date(Math.max(requestedTime, Date.parse(currentState.asOf))).toISOString();
  let request = action.requestId ? state.requests.find(item => item.id === action.requestId) : null;
  if (action.type === 'submit' || action.type === 'resubmit') {
    ensureAllowed(actor.role === 'manager', 'ROLE_REQUIRED', 'Only the demo line manager can submit a request.');
    if (action.type === 'resubmit') {
      ensureAllowed(request, 'NOT_FOUND', 'The request does not exist.');
      ensureAllowed(request.status === 'returned' && request.submittedBy === actor.id, 'NOT_ALLOWED', 'Only the submitting manager can correct a returned request.');
      ensureAllowed(action.form?.type === request.type, 'TYPE_CHANGE', 'Keep the request type when correcting an existing request.');
    }
    const form = cleanForm(action.form);
    ensureAllowed(form.department === actor.department, 'DEPARTMENT_REQUIRED', 'The demo manager can submit only for their own department.');
    const validation = validateSubmission(form, state, request?.id);
    ensureAllowed(validation.valid, 'VALIDATION_FAILED', 'Resolve the submission checks before sending the request.', validation);
    if (!request) {
      const next = Math.max(1032, ...state.requests.map(item => Number(item.id.split('-').at(-1)) || 0)) + 1;
      request = { id: `P2P-${next}`, submittedAt: state.asOf, submittedBy: actor.id, submitter: actor.name, formRevisions: [], dataSource: 'Shared synthetic demo submission' };
      state.requests.push(request);
      addEvent(state, request, actor, 'Submitted', 'submitted');
    }
    const revision = request.formRevisions.length + 1;
    Object.assign(request, form, { title: `${WORKFLOWS[form.type].title} · ${form.department}`, team: form.department, route: clone(validation.route), workflowVersion: RULE_VERSION, targetHours: WORKFLOWS[form.type].targetHours, blocker: null, updatedAt: state.asOf });
    request.validationSnapshot = snapshot(form, validation, state.asOf, actor.id);
    request.formRevisions.push({ version: revision, at: state.asOf, actorId: actor.id, form: clone(form), validationSnapshot: clone(request.validationSnapshot) });
    setStage(request, 0, state);
    const event = addEvent(state, request, actor, request.currentStep, action.type === 'resubmit' ? 'resubmitted' : 'entered', { formVersion: revision, ruleVersion: RULE_VERSION });
    notify(state, request, `${request.id} is ready for human validation.`, event.id);
  } else {
    ensureAllowed(request, 'NOT_FOUND', 'The request does not exist.');
    ensureAllowed(availableActions(request, actor.id, state).includes(action.type), 'NOT_ALLOWED', 'This actor cannot perform that action at the current step.');
    if (action.type === 'review') {
      ensureAllowed(['advance', 'return'].includes(action.decision), 'INVALID_DECISION', 'Choose advance or return.');
      if (action.decision === 'return') {
        ensureAllowed(String(action.reason || '').trim().length >= 5, 'REASON_REQUIRED', 'Describe the correction needed in at least five characters.');
        const reason = String(action.reason).trim();
        addEvent(state, request, actor, request.currentStep, 'returned', { reason, returnReason: reason, decision: 'return' });
        request.status = 'returned'; request.currentStep = 'Correction'; request.ownerId = request.submittedBy; request.owner = actorById(state, request.submittedBy).name;
        const event = addEvent(state, request, actor, 'Correction', 'awaiting_correction', { reason, returnReason: reason });
        request.lastReturnReason = reason; notify(state, request, `Correction requested: ${reason}`, event.id);
      } else {
        const dependency = pendingDependency(request, state);
        ensureAllowed(!dependency, 'DEPENDENCY_PENDING', `${dependency?.id} must complete before this request can progress.`);
        const validation = validateSubmission(request, state, request.id);
        // Effective dates are checked at submission; an older pending request is not
        // made invalid merely because time passes while it waits for human review.
        const currentErrors = validation.errors.filter(item => item.ruleId !== 'DEMO-005');
        ensureAllowed(currentErrors.length === 0, 'REVIEW_CHECK_FAILED', 'The current position or request information needs correction before progression.', { errors: currentErrors });
        const previousStep = request.currentStep, previousRole = request.route[request.stepIndex].role;
        if (request.stepIndex === request.route.length - 2) recordPositionOutcome(request, state);
        addEvent(state, request, actor, previousStep, previousRole === 'approver' ? 'approved' : request.stepIndex === 0 ? 'validated' : 'processed', { decision: 'advance', reason: String(action.reason || 'Human review confirmed').trim() });
        setStage(request, request.stepIndex + 1, state);
        const event = addEvent(state, request, actor, request.currentStep, request.status === 'completed' ? 'completed' : 'entered');
        request.updatedAt = state.asOf;
        if (request.status === 'completed') { request.completedAt = state.asOf; state.notifications.push({ id: `NOTICE-${state.version + 1}-${state.notifications.length + 1}`, requestId: request.id, actorId: request.submittedBy, message: `${request.id} completed after recorded human reviews.`, at: state.asOf, eventId: event.id, read: false }); }
        else notify(state, request, `${request.id} is ready at ${request.currentStep}.`, event.id);
      }
    } else if (action.type === 'block') {
      const category = String(action.category || '');
      ensureAllowed(['dependency', 'system', 'data', 'routing', 'other'].includes(category), 'CATEGORY_REQUIRED', 'Choose a blocker category.');
      ensureAllowed(String(action.reason || '').trim().length >= 5, 'REASON_REQUIRED', 'Describe the blocker in at least five characters.');
      const resolutionOwner = actorById(state, action.resolutionOwnerId);
      ensureAllowed(resolutionOwner && resolutionOwner.role !== 'process-owner', 'OWNER_REQUIRED', 'Choose an accountable resolution owner.');
      const dependencyId = action.dependencyId === undefined ? request.dependencyId : String(action.dependencyId || '').trim();
      if (category === 'dependency') {
        const issue = dependencyProblem({ dependencyRequired: true, dependencyId }, state, request.id);
        ensureAllowed(!issue, issue?.code || 'DEPENDENCY_INVALID', issue?.message || 'Choose a valid dependency.');
        request.dependencyId = dependencyId; request.dependencyRequired = true;
      }
      const reason = String(action.reason).trim();
      request.blocker = { category, reason, resolutionOwnerId: resolutionOwner.id, resolutionOwner: resolutionOwner.name, dependencyId: category === 'dependency' ? dependencyId : null, recordedAt: state.asOf, recordedBy: actor.id, pendingOwnerId: request.ownerId };
      request.status = 'blocked'; request.ownerId = resolutionOwner.id; request.owner = resolutionOwner.name;
      const event = addEvent(state, request, actor, request.currentStep, 'blocked', { category, reason, resolutionOwnerId: resolutionOwner.id, dependencyId: category === 'dependency' ? dependencyId : null });
      notify(state, request, `Resolve ${category} blocker: ${reason}`, event.id);
    } else if (action.type === 'resolve') {
      ensureAllowed(String(action.reason || '').trim().length >= 5, 'REASON_REQUIRED', 'Record how the blocker was resolved in at least five characters.');
      const dependency = pendingDependency(request, state);
      ensureAllowed(!dependency, 'DEPENDENCY_PENDING', `${dependency?.id} is unresolved; complete the upstream request first.`);
      const previousBlocker = clone(request.blocker);
      request.status = 'pending'; request.ownerId = request.blocker?.pendingOwnerId || request.route[request.stepIndex].ownerId;
      request.owner = actorById(state, request.ownerId).name; request.blocker = null;
      const event = addEvent(state, request, actor, request.currentStep, 'resolved', { reason: String(action.reason).trim(), resolvedBlocker: previousBlocker });
      notify(state, request, `${request.id}: blocker resolved; human review remains required.`, event.id);
    } else if (action.type === 'assign') {
      const owner = actorById(state, action.ownerId);
      ensureAllowed(owner, 'OWNER_REQUIRED', 'Choose an existing owner.');
      if (request.status === 'blocked') {
        ensureAllowed(owner.role !== 'process-owner', 'ROLE_REQUIRED', 'The process owner is not a transaction resolution role.');
        request.blocker.resolutionOwnerId = owner.id; request.blocker.resolutionOwner = owner.name;
      } else {
        const routeStep = request.route[request.stepIndex];
        ensureAllowed(owner.role === routeStep.role, 'ROLE_REQUIRED', 'The selected owner must hold the current step’s role.');
        if (owner.role === 'approver') {
          const expected = actorById(state, routeStep.ownerId);
          ensureAllowed(owner.department === expected.department, 'ROUTING_MISMATCH', 'Choose the approver for the configured department.');
        }
      }
      request.ownerId = owner.id; request.owner = owner.name;
      const event = addEvent(state, request, actor, request.currentStep, 'assigned', { assignedOwnerId: owner.id, reason: String(action.reason || 'Human assignment recorded').trim() });
      notify(state, request, `${request.id} assigned to ${owner.name}.`, event.id);
    } else throw domainError('INVALID_ACTION', 'This action is not supported.');
  }
  state.version = currentState.version + 1;
  return state;
}
