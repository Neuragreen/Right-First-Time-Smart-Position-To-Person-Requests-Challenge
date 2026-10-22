import test from 'node:test';
import assert from 'node:assert/strict';
import {MODEL_CARD,generatedHistory,extractFeatures,predictRequest,predictionRows,trainModels,getModelReport} from '../public/compass/predictions.js';
const asOf='2026-10-22T12:00:00Z';
const request={id:'P2P-TEST',type:'transfer',department:'Airport Operations',employeeId:'DEMO-E1',sourcePositionId:'P1',targetPositionId:'P2',effectiveDate:'2026-11-01',justification:'A synthetic operational planning transfer.',submittedAt:'2026-10-22T00:00:00Z',targetHours:72,status:'pending'};
const positions=[{id:'P1',department:'Airport Operations',grade:'G6'},{id:'P2',department:'Airport Operations',grade:'G7'}];
const events=[{id:'E1',requestId:request.id,step:'Submitted',timestamp:request.submittedAt,outcome:'submitted'},{id:'E2',requestId:request.id,step:'Validation',timestamp:'2026-10-22T01:00:00Z',outcome:'entered'}];

test('model report describes an actual chronological whole-request holdout and honest scope',()=>{
 assert.equal(generatedHistory.length,1200);assert.equal(new Set(generatedHistory.map(r=>r.request.id)).size,1200);
 const split=MODEL_CARD.split;
 assert.equal(split.trainCases+split.testCases+split.purgedCases,1200);
 assert(Date.parse(split.trainTo)<Date.parse(split.testFrom));
 assert(generatedHistory.every(r=>Date.parse(r.completionAt)<Date.parse('2026-10-22T00:00:00Z')));
 assert.equal(MODEL_CARD.scope,'Generated synthetic data only');
 for(const m of Object.values(MODEL_CARD.metrics)){
  assert.equal(Object.values(m.confusion).reduce((a,b)=>a+b,0),m.n);
  for(const key of ['accuracy','precision','recall','f1','brier','positiveRate','rocAuc','baselineBrier'])assert(m[key]>=0&&m[key]<=1);
  assert(m.brier<m.baselineBrier,'Synthetic trained baseline should improve Brier loss over its training-rate baseline on the held-out generator cases');
 }
 assert(MODEL_CARD.metrics.return.n<split.testCases,'Already-observed returns are excluded from prospective return evaluation');
});

test('future returns, completion and current status labels do not leak into as-of forecasts',()=>{
 const baseline=predictRequest(request,events,asOf,{positions});
 const future=[...events,{id:'FUTURE-RETURN',requestId:request.id,step:'Correction',outcome:'returned',returnReason:'A future outcome not available now',timestamp:'2026-10-23T03:00:00Z'},{id:'FUTURE-COMPLETE',requestId:request.id,step:'Complete',outcome:'completed',timestamp:'2026-10-25T01:00:00Z'}];
 assert.deepEqual(predictRequest({...request,status:'completed'},future,asOf,{positions}),baseline);
 assert.equal(baseline.delay.kind,'forecast');assert.equal(baseline.return.kind,'forecast');
 assert(baseline.delay.reasons.every(r=>r.evidence&&!r.evidence.includes('FUTURE')));
 assert(baseline.return.reasons.every(r=>r.evidence&&!r.evidence.includes('FUTURE')));
});

test('observed overdue and return facts are separated from model forecasts',()=>{
 const overdue=predictRequest({...request,targetHours:4},events,asOf,{positions});
 assert.equal(overdue.delay.alreadyDelayed,true);assert.equal(overdue.delay.kind,'observed');assert.equal(overdue.delay.probability,1);
 const returned=predictRequest(request,[...events,{id:'RETURN',requestId:request.id,step:'Correction',outcome:'returned',returnReason:'Missing detail',timestamp:'2026-10-22T03:00:00Z'}],asOf,{positions});
 assert.equal(returned.return.alreadyReturned,true);assert.equal(returned.return.kind,'observed');assert.equal(returned.return.probability,1);assert(returned.return.reasons[0].evidence.includes('RETURN'));
 const done=predictRequest(request,[...events,{id:'DONE',requestId:request.id,step:'Complete',outcome:'completed',timestamp:'2026-10-22T04:00:00Z'}],asOf,{positions});
 assert.equal(done.delay.probability,0);assert.equal(done.return.probability,0);assert(done.delay.outcomeKnown&&done.return.outcomeKnown);
});

test('features and forecast export contain reproducible evidence and explicit synthetic model version',()=>{
 const info=extractFeatures(request,events,asOf,{positions});
 assert.equal(info.values.length,MODEL_CARD.features.length);assert.equal(info.evidence.length,info.values.length);assert(info.values.every(Number.isFinite));
 const row=predictionRows([request],events,asOf,{positions})[0];
 assert.equal(row.request_id,request.id);assert.equal(row.delay_kind,'forecast');assert.equal(row.data_scope,'Generated synthetic data only');assert(row.delay_evidence&&row.return_evidence);assert(row.model_version);
 assert.throws(()=>extractFeatures(request,events,'2026-10-21T00:00:00Z',{positions}),/not been submitted/);
});

test('replacement training rejects case overlap, chronology violations and unknown outcomes',()=>{
 const heldout=generatedHistory.slice(300,360),train=generatedHistory.slice(0,240).filter(r=>Date.parse(r.completionAt)<Date.parse(heldout[0].request.submittedAt));
 assert.throws(()=>trainModels(train,[train[0]]),/both training and test/);
 assert.throws(()=>trainModels(heldout,train),/chronologically/);
 assert.throws(()=>trainModels(train.map((r,i)=>i===0?{...r,delayLabel:null}:r),heldout),/known binary/);
 const bundle=trainModels(train,heldout,{version:'replacement-test'});
 assert.equal(bundle.version,'replacement-test');assert.equal(getModelReport(bundle).split.trainCases,train.length);
 const scored=predictRequest(request,events,asOf,{positions,modelBundle:bundle});
 assert.equal(scored.modelVersion,'replacement-test');assert.equal(scored.scope,'User-supplied labelled synthetic data');
 assert(scored.delay.probability>=0&&scored.delay.probability<=1);
});

test('out-of-support forecasts disclose extrapolation rather than validated confidence',()=>{
 const older={...request,submittedAt:'2026-10-19T12:00:00Z'};
 const history=[{id:'OLDER',requestId:older.id,step:'Validation',outcome:'entered',timestamp:older.submittedAt}];
 const p=predictRequest(older,history,asOf,{positions});
 assert.equal(p.delay.kind,'forecast');assert.equal(p.outOfDistribution,true);assert(p.dataWarnings.some(w=>w.includes('extrapolation')));
});

test('training labels mature before held-out submissions and immature replacements are rejected',()=>{
const cutoff=Date.parse(MODEL_CARD.split.trainingCutoff);
const eligible=generatedHistory.slice(0,960).filter(r=>Date.parse(r.completionAt)<cutoff);
assert.equal(eligible.length,MODEL_CARD.split.trainCases);
assert(MODEL_CARD.split.purgedCases>0);
assert.throws(()=>trainModels(generatedHistory.slice(0,240),generatedHistory.slice(240,300)),/must mature/);
});
