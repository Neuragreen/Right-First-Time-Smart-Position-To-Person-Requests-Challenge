/* Synthetic demonstration fixtures and illustrative policies only.
 * Replace with the official pack and confirmed policies before evaluation.
 * Every duration uses elapsed calendar hours, not business-hour SLAs.
 */
export const DEMO_NOW = '2026-10-22T12:00:00Z';
const NOW = Date.parse(DEMO_NOW);
const HOUR = 3600000;
const round = value => Math.round(value * 10) / 10;
const iso = value => new Date(value).toISOString();

export const RULES = [
  { id: 'DEMO-001', title: 'Required fields', description: 'Supply the fields required by the selected demo request type.', source: 'Illustrative demo rule; not Emirates policy' },
  { id: 'DEMO-002', title: 'Existing positions', description: 'Referenced positions must exist in the demo position register.', source: 'Illustrative demo rule; not Emirates policy' },
  { id: 'DEMO-003', title: 'Vacant transfer destination', description: 'A transfer destination must be vacant.', source: 'Illustrative demo rule; not Emirates policy' },
  { id: 'DEMO-004', title: 'Different source and destination', description: 'A transfer must change positions.', source: 'Illustrative demo rule; not Emirates policy' },
  { id: 'DEMO-005', title: 'Effective date', description: 'The effective date must be a valid date on or after the snapshot date, 22 October 2026.', source: 'Illustrative demo rule; not Emirates policy' },
  { id: 'DEMO-006', title: 'Business justification', description: 'Provide at least 20 characters of business justification.', source: 'Illustrative demo rule; not Emirates policy' },
  { id: 'DEMO-007', title: 'Dependency visibility', description: 'If an upstream dependency is declared, identify it. Missing details produce a warning, not an approval decision.', source: 'Illustrative demo rule; not Emirates policy' },
  { id: 'DEMO-008', title: 'Occupied source', description: 'A transfer source must be occupied; position deletion requires a vacant position.', source: 'Illustrative demo rule; not Emirates policy' },
];

export const positions = [
  { id: 'POS-001', title: 'Operations Coordinator', department: 'Airport Operations', grade: 'G6', status: 'occupied', manager: 'Airport Operations Manager' },
  { id: 'POS-002', title: 'Senior Operations Coordinator', department: 'Airport Operations', grade: 'G7', status: 'vacant', manager: 'Airport Operations Manager' },
  { id: 'POS-003', title: 'Service Planning Analyst', department: 'Customer Experience', grade: 'G7', status: 'occupied', manager: 'Customer Experience Manager' },
  { id: 'POS-004', title: 'Customer Journey Analyst', department: 'Customer Experience', grade: 'G7', status: 'vacant', manager: 'Customer Experience Manager' },
  { id: 'POS-005', title: 'Workforce Analyst', department: 'People Services', grade: 'G7', status: 'occupied', manager: 'People Services Manager' },
  { id: 'POS-006', title: 'Workforce Planning Specialist', department: 'People Services', grade: 'G8', status: 'vacant', manager: 'People Services Manager' },
  { id: 'POS-007', title: 'Engineering Administrator', department: 'Engineering', grade: 'G6', status: 'occupied', manager: 'Engineering Services Manager' },
  { id: 'POS-008', title: 'Technical Planning Coordinator', department: 'Engineering', grade: 'G7', status: 'vacant', manager: 'Engineering Services Manager' },
];

const TYPE_LABELS = { transfer: 'Employee transfer', create: 'Create position', 'end-service': 'End-of-service action', delete: 'Delete position' };
const TYPE_CYCLE = ['transfer', 'transfer', 'create', 'transfer', 'delete', 'transfer', 'end-service', 'transfer'];
const FIXTURES = [];
const EVENT_FIXTURES = [];
const event = (requestId, base, hours, step, outcome = 'entered', returnReason) => ({
  id: `${requestId}-E${String(EVENT_FIXTURES.filter(item => item.requestId === requestId).length + 1).padStart(2, '0')}`,
  requestId, step,
  actor: step === 'Submitted' || step === 'Correction' ? 'Demo line manager' : step === 'Approval' ? 'Demo department approver' : 'Demo HR specialist',
  team: step === 'Submitted' || step === 'Correction' ? 'Line management' : step === 'Approval' ? 'Department leadership' : 'HR Operations',
  timestamp: iso(base + hours * HOUR), outcome, ...(returnReason ? { returnReason } : {}),
});

for (let i = 0; i < 32; i += 1) {
  const cohort = i % 8;
  const wave = Math.floor(i / 8);
  const type = TYPE_CYCLE[cohort];
  const pair = (wave % 4) * 2;
  const source = positions[pair];
  const destination = positions[pair + 1];
  const id = `P2P-${1001 + i}`;
  const ages = [168, 84, 38, 100, 144, 4, 42, 120];
  const age = ages[cohort] + wave * (cohort === 5 ? 1 : 6);
  const base = NOW - age * HOUR;
  const add = (...args) => EVENT_FIXTURES.push(event(id, base, ...args));
  let status = 'pending';
  let currentStep = 'Validation';
  let owner = 'HR Operations';
  add(0, 'Submitted', 'submitted');
  add(1, 'Validation');
  if (cohort === 0 || cohort === 7) {
    add(4, 'Approval');
    add(16 + wave, 'Position update');
    add(24 + wave * 2, 'Complete', 'completed');
    status = 'completed'; currentStep = 'Complete'; owner = 'No action required';
  } else if (cohort === 1) {
    add(10, 'Approval');
    currentStep = 'Approval'; owner = `${source.department} approver`;
  } else if (cohort === 2) {
    add(3, 'Validation', 'returned', 'Missing justification');
    add(3, 'Correction', 'awaiting_correction');
    status = 'returned'; currentStep = 'Correction'; owner = 'Submitting manager';
  } else if (cohort === 3) {
    add(5, 'Approval');
    add(18, 'Position update', 'blocked');
    status = 'blocked'; currentStep = 'Position update'; owner = 'HR Operations · upstream request owner';
  } else if (cohort === 4) {
    add(3, 'Validation', 'returned', 'Approval routing mismatch');
    add(3, 'Correction', 'awaiting_correction');
    add(27 + wave, 'Validation', 'resubmitted');
    add(29 + wave, 'Approval');
    add(47 + wave, 'Position update');
    add(51 + wave, 'Complete', 'completed');
    status = 'completed'; currentStep = 'Complete'; owner = 'No action required';
  } else if (cohort === 6) {
    add(4, 'Approval');
    add(22, 'Position update');
    currentStep = 'Position update';
  }
  FIXTURES.push({
    id, type, title: `${TYPE_LABELS[type]} · ${source.department}`,
    employeeId: type === 'create' || type === 'delete' ? '' : `DEMO-E${String(i + 1).padStart(3, '0')}`,
    sourcePositionId: type === 'create' ? '' : type === 'delete' ? destination.id : source.id,
    targetPositionId: type === 'transfer' ? destination.id : '',
    department: source.department, team: source.department,
    positionTitle: type === 'create' ? 'Demo Planning Coordinator' : '',
    grade: type === 'create' ? 'G6' : '',
    submittedAt: iso(base), currentStep, owner, status,
    targetHours: type === 'create' ? 96 : type === 'transfer' ? 72 : 48,
    effectiveDate: '2026-11-01',
    dependencyId: cohort === 3 ? 'P2P-1026' : '',
    dependencyRequired: cohort === 3,
    justification: cohort === 2 ? '' : 'Synthetic request to support a planned team structure change.',
    dataSource: 'Generated synthetic demonstration data',
  });
}
export const demoRequests = FIXTURES;
export const events = EVENT_FIXTURES;

export function validateRequest(form = {}) {
  const errors = [];
  const warnings = [];
  const add = (field, ruleId, message, fix) => errors.push({ field, ruleId, message, fix });
  const required = (field, label) => {
    if (!String(form[field] ?? '').trim()) add(field, 'DEMO-001', `${label} is required.`, `Add ${label.toLowerCase()}.`);
  };
  if (!Object.hasOwn(TYPE_LABELS, form.type)) add('type', 'DEMO-001', 'Select a supported request type.', 'Choose transfer, create position, end-of-service or delete position.');
  required('department', 'Department');
  required('effectiveDate', 'Effective date');
  if (['transfer', 'end-service'].includes(form.type)) required('employeeId', 'Synthetic employee reference');
  if (['transfer', 'end-service', 'delete'].includes(form.type)) required('sourcePositionId', 'Source position');
  if (form.type === 'transfer') required('targetPositionId', 'Target position');
  if (form.type === 'create') { required('positionTitle', 'New position title'); required('grade', 'Grade'); }
  for (const field of ['sourcePositionId', 'targetPositionId']) {
    if (form[field] && !positions.some(position => position.id === form[field])) add(field, 'DEMO-002', 'This position is not in the demo register.', 'Select an available position from the register.');
  }
  const source = positions.find(position => position.id === form.sourcePositionId);
  const target = positions.find(position => position.id === form.targetPositionId);
  if (form.type === 'transfer' && target && target.status !== 'vacant') add('targetPositionId', 'DEMO-003', 'The target position is occupied.', 'Select a vacant target position or ask HR to review the position register.');
  if (form.type === 'transfer' && form.sourcePositionId && form.sourcePositionId === form.targetPositionId) add('targetPositionId', 'DEMO-004', 'Source and target positions are the same.', 'Select a different destination position.');
  if (form.type === 'transfer' && source && source.status !== 'occupied') add('sourcePositionId', 'DEMO-008', 'The source position is vacant.', 'Select the occupied position associated with this synthetic employee.');
  if (form.type === 'delete' && source && source.status !== 'vacant') add('sourcePositionId', 'DEMO-008', 'The position is occupied.', 'Select a vacant position or resolve the employee movement with HR first.');
  if (form.effectiveDate) {
    const dateString = String(form.effectiveDate);
    const parsed = Date.parse(`${dateString}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString) || !Number.isFinite(parsed) || iso(parsed).slice(0, 10) !== dateString || dateString < DEMO_NOW.slice(0, 10)) add('effectiveDate', 'DEMO-005', 'Use a valid date on or after 22 October 2026.', 'Choose an effective date on or after the demo snapshot date.');
  }
  if (String(form.justification ?? '').trim().length < 20) add('justification', 'DEMO-006', 'The business justification needs at least 20 characters.', 'Explain the operational reason for this request.');
  if (form.dependencyRequired && !String(form.dependencyId ?? '').trim()) warnings.push({ field: 'dependencyId', ruleId: 'DEMO-007', message: 'An upstream dependency was declared without a reference.', fix: 'Add the upstream request reference so HR can check it.' });
  return { valid: errors.length === 0, errors, warnings };
}

export function requestEvents(id, eventLog = events) {
  return eventLog.filter(item => item.requestId === id && Number.isFinite(Date.parse(item.timestamp)) && Date.parse(item.timestamp) <= NOW)
    .slice().sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

export function assessRisk(request, allEvents = events) {
  const history = requestEvents(request.id, allEvents);
  const last = history.at(-1);
  const reasons = [];
  let score = 0;
  if (last?.outcome === 'completed') return { level: 'low', score: 0, label: 'Illustrative risk score', reasons: [{ text: 'Completed in the observed event history.', evidence: `${last.id}: ${last.timestamp}` }], method: 'Demo heuristic; not a trained prediction' };
  const age = Math.max(0, (NOW - Date.parse(request.submittedAt)) / HOUR);
  const target = Number(request.targetHours) || 72;
  if (age > target) { score += 40; reasons.push({ text: 'Elapsed time already exceeds the illustrative target.', evidence: `${round(age)} elapsed hours vs ${target} target hours; snapshot ${DEMO_NOW}.` }); }
  else if (age > target * 0.7) { score += 20; reasons.push({ text: 'Much of the illustrative target time has elapsed.', evidence: `${round(age)} of ${target} target hours elapsed.` }); }
  if (last && (NOW - Date.parse(last.timestamp)) / HOUR >= 24) { score += 20; reasons.push({ text: 'The current step has been waiting at least 24 hours.', evidence: `${last.step}: ${round((NOW - Date.parse(last.timestamp)) / HOUR)} hours since event ${last.id}.` }); }
  const returns = history.filter(item => item.outcome === 'returned');
  if (returns.length) { score += 25; reasons.push({ text: 'A correction return is present in the observed history.', evidence: returns.map(item => `${item.id}: ${item.returnReason || 'Reason not recorded'}`).join('; ') }); }
  if (last?.outcome === 'blocked') {
    score += 25;
    reasons.push(request.dependencyId
      ? { text: 'A recorded upstream dependency is blocking this request.', evidence: `${last.id}: blocked at ${last.step}; dependency ${request.dependencyId}.` }
      : { text: 'A blocker is recorded; its cause needs confirmation.', evidence: `${last.id}: blocked at ${last.step}; dependency not recorded.` });
  }
  const checks = validateRequest(request);
  if (checks.errors.length) { score += 20; reasons.push({ text: 'The current form fails illustrative submission checks.', evidence: checks.errors.map(item => `${item.ruleId}: ${item.message}`).join(' ') }); }
  if (!reasons.length) reasons.push({ text: 'No configured demo risk trigger is currently active.', evidence: `${round(age)} elapsed hours; no observed return or blocking event by ${DEMO_NOW}.` });
  score = Math.min(100, score);
  return { level: score >= 60 ? 'high' : score >= 25 ? 'medium' : 'low', score, label: 'Illustrative risk score', reasons, method: 'Demo heuristic; not a trained prediction' };
}

function durationSegments(request, eventLog) {
  const history = requestEvents(request.id, eventLog);
  return history.flatMap((item, index) => {
    if (item.outcome === 'completed') return [];
    const next = history[index + 1];
    const end = next ? Date.parse(next.timestamp) : NOW;
    return [{ requestId: request.id, step: item.step, hours: Math.max(0, (end - Date.parse(item.timestamp)) / HOUR), open: !next, eventId: item.id }];
  });
}

export function summarize(requests = demoRequests, eventLog = events) {
  const segments = requests.flatMap(request => durationSegments(request, eventLog));
  const completed = requests.filter(request => requestEvents(request.id, eventLog).at(-1)?.outcome === 'completed');
  const historicalReturns = requests.filter(request => requestEvents(request.id, eventLog).some(item => item.outcome === 'returned'));
  const stepMap = new Map();
  for (const segment of segments) {
    if (!stepMap.has(segment.step)) stepMap.set(segment.step, { step: segment.step, requestIds: new Set(), totalHours: 0, observedHours: 0, openHours: 0 });
    const row = stepMap.get(segment.step);
    row.requestIds.add(segment.requestId); row.totalHours += segment.hours;
    row[segment.open ? 'openHours' : 'observedHours'] += segment.hours;
  }
  const variants = new Map();
  const loops = new Map();
  for (const request of requests) {
    const history = requestEvents(request.id, eventLog);
    const path = history.map(item => item.step).filter((step, index, steps) => index === 0 || step !== steps[index - 1]).join(' → ');
    variants.set(path, (variants.get(path) || 0) + 1);
    for (const item of history.filter(item => item.outcome === 'returned')) {
      const reason = item.returnReason || 'Reason not recorded';
      if (!loops.has(reason)) loops.set(reason, { reason, count: 0, requestIds: new Set() });
      const loop = loops.get(reason); loop.count += 1; loop.requestIds.add(request.id);
    }
  }
  return {
    totals: {
      total: requests.length, active: requests.length - completed.length, completed: completed.length,
      returned: requests.filter(request => requestEvents(request.id, eventLog).at(-1)?.step === 'Correction').length,
      highRisk: requests.filter(request => assessRisk(request, eventLog).level === 'high').length,
      avgTurnaroundHours: completed.length ? round(completed.reduce((sum, request) => sum + (Date.parse(requestEvents(request.id, eventLog).at(-1).timestamp) - Date.parse(request.submittedAt)) / HOUR, 0) / completed.length) : 0,
      returnRate: requests.length ? round(100 * historicalReturns.length / requests.length) : 0,
      historicallyReturned: historicalReturns.length,
    },
    bottlenecks: [...stepMap.values()].map(row => ({ step: row.step, requests: row.requestIds.size, requestIds: [...row.requestIds], totalHours: round(row.totalHours), avgHours: round(row.totalHours / row.requestIds.size), observedHours: round(row.observedHours), openHours: round(row.openHours) })).sort((a, b) => b.totalHours - a.totalHours),
    variants: [...variants].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count),
    loops: [...loops.values()].map(row => ({ ...row, requestIds: [...row.requestIds] })),
    snapshotAt: DEMO_NOW,
    waitBasis: 'Elapsed calendar hours between recorded step entries, plus current open waits as of the fixed snapshot. Processing effort is not measured.',
  };
}

export function recommendations(requests = demoRequests, eventLog = events) {
  const segments = requests.flatMap(request => durationSegments(request, eventLog));
  const specs = [
    { id: 'REC-01', title: 'Catch missing justification at submission', description: 'Use a required justification field with a clear example before the request is sent.', reason: 'Missing justification', fraction: 0.5, assumption: 'Scenario: prevent 50% of the observed correction-wait hours in requests returned for missing justification. Open waits are censored at the snapshot.', steps: ['Add the illustrative completeness check.', 'Pilot with a comparable request cohort.', 'Measure correction returns and elapsed turnaround.'] },
    { id: 'REC-02', title: 'Confirm the approval route before submission', description: 'Show the proposed approver and ask the manager or HR to confirm it before routing.', reason: 'Approval routing mismatch', fraction: 0.5, assumption: 'Scenario: prevent 50% of correction-wait hours associated with approval routing returns. This association does not establish causality.', steps: ['Display the proposed route and its source.', 'Keep routing confirmation with a human.', 'Compare return rates after a controlled pilot.'] },
    { id: 'REC-03', title: 'Make upstream dependencies visible to both owners', description: 'Link the upstream request and surface the blocking transaction in the shared work queue.', fraction: 0.25, assumption: 'Scenario: reduce 25% of the current open blocked wait by earlier coordination. A pilot is required to establish an actual effect.', steps: ['Link the upstream request and name its owner.', 'Show both owners the dependency.', 'Measure the change in blocked elapsed time.'] },
  ];
  return specs.map(spec => {
    const affected = requests.filter(request => {
      const history = requestEvents(request.id, eventLog);
      return spec.reason ? history.some(item => item.outcome === 'returned' && item.returnReason === spec.reason) : history.at(-1)?.outcome === 'blocked' && Boolean(String(request.dependencyId || '').trim());
    });
    const requestIds = affected.map(request => request.id);
    const cohortSegments = segments.filter(segment => requestIds.includes(segment.requestId) && (spec.reason ? segment.step === 'Correction' : segment.open));
    const baselineHours = round(cohortSegments.reduce((sum, item) => sum + item.hours, 0));
    return {
      id: spec.id, title: spec.title, description: spec.description,
      evidence: `${affected.length} synthetic requests; ${baselineHours} elapsed ${spec.reason ? 'correction' : 'open blocked'} hours. Events: ${cohortSegments.map(item => item.eventId).join(', ') || 'none'}.`,
      requestIds, affectedCount: affected.length, assumption: spec.assumption,
      elapsedHoursSaved: round(baselineHours * spec.fraction), effortHoursSaved: null,
      confidence: 'Scenario estimate', steps: spec.steps, baselineHours,
      calculation: `${baselineHours} elapsed hours × ${spec.fraction * 100}% assumed reduction`,
      caveat: 'Generated demonstration data, not an Emirates finding. Elapsed-time opportunity only; no measured labour saving. Cohorts are disjoint in this fixture; do not assume independence in real data.',
    };
  });
}
