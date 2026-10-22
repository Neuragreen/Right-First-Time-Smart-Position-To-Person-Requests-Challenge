import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeProcess} from '../public/compass/analytics.js';
import {answerQuestion} from '../public/compass/assistant.js';
const origin=Date.parse('2026-01-01T00:00:00Z'),iso=h=>new Date(origin+h*3600000).toISOString();
const requests=[
 {id:'P2P-1',type:'transfer',team:'Airport Operations',department:'Airport Operations',submittedAt:iso(0),targetHours:48,currentStep:'Complete',status:'completed',submittedBy:'M1',ownerId:null},
 {id:'P2P-2',type:'transfer',team:'Engineering',department:'Engineering',submittedAt:iso(0),targetHours:48,currentStep:'Approval',status:'blocked',submittedBy:'M2',ownerId:'A2',dependencyId:'P2P-1',blocker:{status:'open',category:'dependency',reason:'Waiting for upstream transaction',recordedAt:iso(12),resolutionOwnerId:'HR',dependencyId:'P2P-1'}},
 {id:'P2P-3',type:'create',team:'Engineering',department:'Engineering',submittedAt:iso(0),targetHours:96,currentStep:'Complete',status:'completed',submittedBy:'M2',ownerId:null},
];
const events=[];
function add(id,h,step,outcome='entered',extra={}){events.push({id:`${id}-E${events.filter(e=>e.requestId===id).length+1}`,requestId:id,step,outcome,timestamp:iso(h),...extra});}
add('P2P-1',0,'Submitted','submitted');add('P2P-1',1,'Validation');add('P2P-1',4,'Validation','returned',{returnReason:'Missing justification'});add('P2P-1',4,'Correction','awaiting_correction');add('P2P-1',10,'Validation','resubmitted');add('P2P-1',16,'Approval');add('P2P-1',24,'Complete','completed');
add('P2P-2',0,'Submitted','submitted');add('P2P-2',1,'Validation');add('P2P-2',8,'Approval');add('P2P-2',12,'Approval','blocked',{category:'dependency',dependencyId:'P2P-1',reason:'Waiting for upstream transaction'});
add('P2P-3',0,'Submitted','submitted');add('P2P-3',1,'Validation');add('P2P-3',3,'Validation','returned',{returnReason:'Approval routing mismatch'});add('P2P-3',3,'Correction','awaiting_correction');add('P2P-3',12,'Validation','resubmitted');add('P2P-3',18,'Approval');add('P2P-3',60,'Complete','completed');
const state={requests,events,asOf:iso(72),positions:[],actors:[{id:'M1',role:'manager',name:'Manager 1'},{id:'M2',role:'manager',name:'Manager 2'},{id:'HR',role:'hr',name:'HR specialist'},{id:'A2',role:'approver',name:'Engineering approver'}]};

test('step intervals reconcile to completed turnaround plus censored open elapsed time',()=>{
 const a=analyzeProcess(state);
 assert.equal(a.totals.total,3);assert.equal(a.totals.completed,2);assert.equal(a.totals.active,1);
 assert.equal(a.totals.avgTurnaroundHours,42);
 assert.equal(a.bottlenecks.reduce((sum,b)=>sum+b.totalHours,0),24+72+60);
 for(const b of a.bottlenecks)assert.equal(b.totalHours,b.observedHours+b.openHours);
 assert.equal(a.variants.reduce((sum,v)=>sum+v.count,0),3);
 assert.equal(a.loops.reduce((sum,l)=>sum+l.count,0),2);
 assert.equal(a.exceptions[0].activeCount,1);
});

test('cohort filters and like-type team comparisons select the correct evidence',()=>{
 const transfer=analyzeProcess(state,{type:'transfer'});assert.equal(transfer.totals.total,2);assert(transfer.teamComparison.every(g=>g.type==='transfer'));
 const engineering=analyzeProcess(state,{team:'Engineering'});assert.equal(engineering.totals.total,2);assert.deepEqual(engineering.requestIds,['P2P-2','P2P-3']);
 assert.equal(analyzeProcess(state,{from:'2026-01-02'}).totals.total,0);
 assert.equal(analyzeProcess(state,{to:'2026-01-01'}).totals.total,3);
 const uncompleted=transfer.teamComparison.find(g=>g.team==='Engineering');assert.equal(uncompleted.completed,0);assert.equal(uncompleted.medianHours,null);assert.equal(uncompleted.openCount,1);
});

test('recommendation ranges derive from identified intervals and do not invent labour savings',()=>{
 const recs=analyzeProcess(state).recommendations;
 assert.equal(recs[0].baselineHours,6);assert.equal(recs[0].elapsedHoursSaved,3);
 assert.equal(recs[1].baselineHours,9);assert.equal(recs[1].elapsedHoursSaved,4.5);
 assert.equal(recs[2].baselineHours,60);assert.equal(recs[2].elapsedHoursSaved,15);
 for(const r of recs){assert.equal(r.effortHoursSaved,null);assert(r.lowHoursSaved<=r.elapsedHoursSaved&&r.elapsedHoursSaved<=r.highHoursSaved);assert(r.highHoursSaved<=r.baselineHours);assert(r.evidenceEventIds.length);assert(r.assumption.includes('assumptions'));}
});

test('future outcomes are excluded and empty selections stay finite',()=>{
 const base=analyzeProcess(state),future={...state,events:[...events,{id:'FUTURE',requestId:'P2P-2',step:'Complete',outcome:'completed',timestamp:iso(90)}]};
 assert.deepEqual(analyzeProcess(future),base);
 const empty=analyzeProcess({...state,requests:[],events:[]});assert.equal(empty.totals.total,0);assert.equal(empty.totals.avgTurnaroundHours,0);assert.equal(empty.totals.medianTurnaroundHours,null);assert.deepEqual(empty.bottlenecks,[]);assert(empty.recommendations.every(r=>r.elapsedHoursSaved===0));
});

test('assistant answers status with evidence and refuses records outside manager scope',()=>{
 const own=answerQuestion('Where is P2P-1?',state,'M1');assert(own.answer.includes('P2P-1'));assert(own.answer.includes('Completed'));assert.equal(own.evidence[0].requestId,'P2P-1');
 const other=answerQuestion('Where is P2P-2?',state,'M1');assert(other.answer.includes('No request'));assert.equal(other.evidence.length,0);assert(!other.answer.includes('Engineering'));
 const assigned=answerQuestion('What needs my action?',state,'A2');assert(assigned.answer.includes('P2P-2'));assert(!assigned.answer.includes('P2P-1:'));
 const approve=answerQuestion('Approve P2P-2',state,'HR');assert(approve.answer.includes('cannot make that decision'));assert.equal(approve.evidence.length,0);
});

test('Arabic assistant is grounded, supports Arabic digits and abstains unknown questions',()=>{
 const arabic=answerQuestion('أين طلب P2P-٢؟',state,'HR','ar');assert(arabic.answer.includes('P2P-2'));assert(arabic.answer.includes('متوقف'));assert.equal(arabic.evidence[0].requestId,'P2P-2');
 const unknown=answerQuestion('What will the weather be?',state,'HR');assert(unknown.answer.includes('accessible records'));assert.equal(unknown.evidence.length,0);
 const noActor=answerQuestion('Where is my request?',state,'UNKNOWN');assert(noActor.answer.includes('Select a demo actor'));assert.equal(noActor.evidence.length,0);
});
