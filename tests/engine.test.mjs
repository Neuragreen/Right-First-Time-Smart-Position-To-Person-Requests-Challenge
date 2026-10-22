import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_NOW, positions, demoRequests, events, validateRequest, assessRisk, summarize, recommendations, requestEvents } from '../public/compass/engine.js';

const valid = { type: 'transfer', employeeId: 'DEMO-NEW', sourcePositionId: 'POS-001', targetPositionId: 'POS-002', department: 'Airport Operations', effectiveDate: '2026-11-01', justification: 'A synthetic operational change for this demonstration.' };

test('valid synthetic transfer passes; missing data and conflicting positions fail with rule evidence', () => {
  assert.equal(validateRequest(valid).valid, true);
  const result = validateRequest({ ...valid, employeeId: '', targetPositionId: 'POS-001', justification: '' });
  assert.equal(result.valid, false);
  assert(result.errors.some(item => item.field === 'employeeId'));
  assert(result.errors.some(item => item.ruleId === 'DEMO-003'));
  assert(result.errors.some(item => item.ruleId === 'DEMO-004'));
  assert(result.errors.every(item => item.message && item.fix && item.ruleId));
});

test('invalid and past effective dates fail; dependency is only a warning', () => {
  for (const effectiveDate of ['2026-02-30', '2026-10-21', 'nonsense']) assert(validateRequest({ ...valid, effectiveDate }).errors.some(item => item.ruleId === 'DEMO-005'));
  const warning = validateRequest({ ...valid, dependencyRequired: true });
  assert.equal(warning.valid, true);
  assert.equal(warning.warnings[0].ruleId, 'DEMO-007');
});

test('type-specific requirements and deletion occupancy are enforced', () => {
  const create = validateRequest({ ...valid, type: 'create', positionTitle: '', grade: '' });
  assert(create.errors.some(item => item.field === 'positionTitle'));
  assert(create.errors.some(item => item.field === 'grade'));
  assert.equal(validateRequest({ ...valid, type: 'delete', sourcePositionId: 'POS-002', targetPositionId: '' }).valid, true);
  assert.equal(validateRequest({ ...valid, type: 'delete' }).valid, false);
});

test('fixtures have unique IDs, known positions and consistent final step; no future events', () => {
  assert.equal(demoRequests.length, 32);
  assert.equal(new Set(demoRequests.map(item => item.id)).size, demoRequests.length);
  assert.equal(new Set(events.map(item => item.id)).size, events.length);
  for (const request of demoRequests) {
    const history = requestEvents(request.id);
    assert(history.length >= 2);
    assert.equal(history.at(-1).step, request.currentStep);
    assert.equal(history[0].timestamp, request.submittedAt);
    assert(history.every(item => Date.parse(item.timestamp) <= Date.parse(DEMO_NOW)));
    if (request.sourcePositionId) assert(positions.some(position => position.id === request.sourcePositionId));
    if (request.targetPositionId) assert(positions.some(position => position.id === request.targetPositionId));
    if (request.dependencyId) {
      const upstream = demoRequests.find(item => item.id === request.dependencyId);
      assert(upstream && upstream.status !== 'completed');
      for (const blockingEvent of history.filter(item => item.outcome === 'blocked')) {
        assert(Date.parse(upstream.submittedAt) <= Date.parse(blockingEvent.timestamp), `${request.id}: upstream must exist before it blocks this request`);
        const upstreamAtBlock = requestEvents(upstream.id).filter(item => Date.parse(item.timestamp) <= Date.parse(blockingEvent.timestamp));
        assert(upstreamAtBlock.length > 0);
        assert.notEqual(upstreamAtBlock.at(-1).outcome, 'completed');
      }
    }
  }
});

test('risk uses only events observed by the snapshot; future outcome does not leak', () => {
  const request = demoRequests.find(item => item.status === 'pending');
  const before = assessRisk(request);
  const futureLog = [...events, { id: 'FUTURE-EVENT', requestId: request.id, step: 'Complete', outcome: 'completed', timestamp: '2026-10-23T12:00:00Z' }];
  assert.deepEqual(assessRisk(request, futureLog), before);
  assert.equal(assessRisk(demoRequests.find(item => item.status === 'completed')).score, 0);
});

test('a generic blocker does not invent an upstream cause or trigger the dependency recommendation', () => {
  const generic = { ...demoRequests.find(item => item.status === 'blocked'), dependencyId: '' };
  const risk = assessRisk(generic);
  const blockerReason = risk.reasons.find(item => item.text.includes('blocker is recorded'));
  assert(blockerReason);
  assert.match(blockerReason.text, /cause needs confirmation/);
  assert.match(blockerReason.evidence, /dependency not recorded/);
  assert(!risk.reasons.some(item => /upstream dependency is blocking/i.test(item.text)));
  const upstreamRecommendation = recommendations([generic], events).find(item => item.id === 'REC-03');
  assert.equal(upstreamRecommendation.affectedCount, 0);
  assert.equal(upstreamRecommendation.elapsedHoursSaved, 0);
  assert.deepEqual(upstreamRecommendation.requestIds, []);
});

test('summary counts and step durations reconcile to event history', () => {
  const summary = summarize();
  assert.equal(summary.totals.total, demoRequests.length);
  assert.equal(summary.totals.active + summary.totals.completed, demoRequests.length);
  assert.equal(summary.variants.reduce((sum, item) => sum + item.count, 0), demoRequests.length);
  const totalElapsed = demoRequests.reduce((sum, request) => {
    const last = requestEvents(request.id).at(-1);
    const end = last.outcome === 'completed' ? Date.parse(last.timestamp) : Date.parse(DEMO_NOW);
    return sum + (end - Date.parse(request.submittedAt)) / 3600000;
  }, 0);
  assert.equal(summary.bottlenecks.reduce((sum, item) => sum + item.totalHours, 0), totalElapsed);
  for (const row of summary.bottlenecks) assert.equal(row.totalHours, row.observedHours + row.openHours);
  assert.equal(summary.totals.returnRate, summary.totals.historicallyReturned / demoRequests.length * 100);
});

test('recommendation estimates reconcile, remain bounded and do not claim labour savings', () => {
  const rows = recommendations();
  assert.equal(rows.length, 3);
  const cohorts = new Set();
  for (const row of rows) {
    assert.equal(row.confidence, 'Scenario estimate');
    assert.equal(row.effortHoursSaved, null);
    assert.equal(row.affectedCount, row.requestIds.length);
    assert(row.elapsedHoursSaved <= row.baselineHours);
    assert(row.elapsedHoursSaved >= 0);
    assert(row.evidence && row.assumption && row.calculation);
    for (const id of row.requestIds) { assert(!cohorts.has(id)); cohorts.add(id); }
  }
});

test('empty inputs produce finite zero metrics', () => {
  const empty = summarize([], []);
  assert.equal(empty.totals.total, 0);
  assert.equal(empty.totals.avgTurnaroundHours, 0);
  assert.equal(empty.totals.returnRate, 0);
  assert.deepEqual(empty.bottlenecks, []);
  assert(recommendations([], []).every(item => item.elapsedHoursSaved === 0));
});
