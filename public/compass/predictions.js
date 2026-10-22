/** Reproducible, locally trained baseline models. Generated demonstration data only.
 * No network calls, no employee decision, and no Emirates/judge accuracy claim.
 */
const HOUR = 3600000;
const DAY = 24 * HOUR;
const VERSION = 'synthetic-logistic-v2.2';
const round = (v, d = 4) => Number(Number(v).toFixed(d));
const sigmoid = z => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const validDate = s => Number.isFinite(Date.parse(s));
const TYPES = ['transfer', 'create', 'end-service', 'delete'];
const TARGETS = {transfer:72,create:96,'end-service':48,delete:48};
export const FEATURE_DEFINITIONS = [
  ['transfer', 'Employee transfer'], ['create', 'Position creation'], ['endService', 'End-of-service action'],
  ['missing', 'Missing required submission fields'], ['shortJustification', 'Short business justification'],
  ['dependency', 'Declared transaction dependency'], ['crossDepartment', 'Movement between departments'],
  ['gradeChange', 'Difference in position grades'], ['leadDays', 'Effective-date lead time'],
  ['elapsedRatio', 'Elapsed time relative to target'], ['waitRatio', 'Current-step wait relative to target'],
  ['priorReturns', 'Returns observed before this prediction'], ['blocked', 'Blocker recorded before this prediction'],
].map(([key,label])=>({key,label}));
const DEMO_POSITIONS = Array.from({length:8},(_,i)=>({id:`MODEL-P${i+1}`,department:['Airport Operations','Customer Experience','People Services','Engineering'][Math.floor(i/2)],grade:`G${6+i%3}`}));

export function observedHistory(requestId, eventLog = [], asOf) {
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) throw new Error('A valid prediction observation timestamp is required.');
  return eventLog.filter(e=>e.requestId===requestId&&validDate(e.timestamp)&&Date.parse(e.timestamp)<=cutoff)
    .map((e,index)=>({...e,_sourceOrder:index})).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||a._sourceOrder-b._sourceOrder);
}
function requiredFields(type) {
  return ['department','effectiveDate',...(['transfer','end-service'].includes(type)?['employeeId']:[]),...(type!=='create'?['sourcePositionId']:[]),...(type==='transfer'?['targetPositionId']:[]),...(type==='create'?['positionTitle','grade']:[])];
}
function contextFacts(request, history, asOf, context = {}) {
  const positions = context.positions || [];
  const source=positions.find(p=>p.id===request.sourcePositionId), target=positions.find(p=>p.id===request.targetPositionId);
  const start=Date.parse(request.submittedAt), cutoff=Date.parse(asOf), last=history.at(-1);
  const targetHours=Math.max(1,finite(request.targetHours,TARGETS[request.type]||72));
  const completed=history.findLast(e=>e.outcome==='completed'||e.step==='Complete');
  const end=completed?Date.parse(completed.timestamp):cutoff;
  const elapsed=Math.max(0,(end-start)/HOUR);
  const waiting=completed?0:Math.max(0,(cutoff-Date.parse(last?.timestamp||request.submittedAt))/HOUR);
  const missing=requiredFields(request.type).filter(k=>!String(request[k]??'').trim());
  const sourceGrade=Number(String(source?.grade||'').replace(/\D/g,'')), targetGrade=Number(String(target?.grade||'').replace(/\D/g,''));
  const gradeKnown=!!source?.grade&&!!target?.grade&&Number.isFinite(sourceGrade)&&Number.isFinite(targetGrade);
  const leadDate=Date.parse(`${String(request.effectiveDate||'').slice(0,10)}T00:00:00Z`);
  const leadDays=Number.isFinite(leadDate)&&Number.isFinite(start)?(leadDate-start)/DAY:0;
  const returns=history.filter(e=>e.outcome==='returned');
  return {targetHours,completed,elapsed,waiting,missing,source,target,gradeKnown,gradeChange:gradeKnown?Math.abs(targetGrade-sourceGrade):0,leadDays,returns,last,
    blocked:last?.outcome==='blocked'||(request.blocker?.status==='open'&&validDate(request.blocker?.recordedAt)&&Date.parse(request.blocker.recordedAt)<=cutoff)};
}
export function extractFeatures(request, eventLog = [], asOf, context = {}) {
  if (!validDate(request.submittedAt)) throw new Error('The request needs a valid submittedAt timestamp.');
  if(Date.parse(request.submittedAt)>Date.parse(asOf))throw new Error('The request had not been submitted at this observation time.');
  const history=observedHistory(request.id,eventLog,asOf), f=contextFacts(request,history,asOf,context);
  const values=[+(request.type==='transfer'),+(request.type==='create'),+(request.type==='end-service'),Math.min(6,f.missing.length),+(String(request.justification||'').trim().length<20),+(!!request.dependencyRequired||!!request.dependencyId),+(!!f.source&&!!f.target&&f.source.department!==f.target.department),Math.min(5,f.gradeChange),clamp(f.leadDays,-5,30)/30,clamp(f.elapsed/f.targetHours,0,2),clamp(f.waiting/f.targetHours,0,2),Math.min(3,f.returns.length),+f.blocked];
  const evidence=[
    `request.type = ${request.type||'unknown'}`, `request.type = ${request.type||'unknown'}`, `request.type = ${request.type||'unknown'}`,
    f.missing.length?`Missing: ${f.missing.join(', ')}.`:'All model-required submission fields are present.',
    `${String(request.justification||'').trim().length} justification characters; illustrative minimum 20.`,
    request.dependencyId?`Declared reference ${request.dependencyId}; this feature does not verify the upstream outcome.`:`Dependency declared: ${request.dependencyRequired?'yes, reference missing':'no'}.`,
    f.source&&f.target?`${f.source.department} → ${f.target.department}; positions ${request.sourcePositionId} → ${request.targetPositionId}.`:'Source/target department comparison unavailable; encoded as zero with this limitation.',
    f.gradeKnown?`${f.source.grade} → ${f.target.grade}; absolute grade difference ${f.gradeChange}.`:'Position grade comparison unavailable; encoded as zero with this limitation.',
    validDate(request.effectiveDate)?`${request.effectiveDate}: ${round(f.leadDays,1)} calendar days after submission.`:'Effective date unavailable; lead-time feature uses zero.',
    `${round(f.elapsed,1)} elapsed calendar hours / ${f.targetHours} illustrative target hours at ${asOf}.`,
    `${round(f.waiting,1)} current-step hours; last observed event ${f.last?.id||'not recorded'} at ${f.last?.timestamp||request.submittedAt}.`,
    f.returns.length?f.returns.map(e=>`${e.id}: ${e.returnReason||e.reason||'returned for correction'} (${e.timestamp})`).join('; '):'No return event is observed before this timestamp.',
    f.blocked?`${f.last?.id||'blocker record'}: a blocker is recorded by ${asOf}.`:'No current blocker is recorded in the observed events.',
  ];
  return {values,evidence,facts:f,history};
}

function rng(seed=262210){let value=seed>>>0;return()=>{value=(Math.imul(1664525,value)+1013904223)>>>0;return value/4294967296;};}
function generatedCases(count=1200) {
  const random=rng(), records=[];
  const departments=['Airport Operations','Customer Experience','People Services','Engineering'];
  const origin=Date.parse('2026-05-01T00:00:00Z');
  for(let i=0;i<count;i++){
    const type=TYPES[Math.floor(random()*TYPES.length)], team=departments[Math.floor(random()*4)],targetHours=TARGETS[type];
    const source=DEMO_POSITIONS[Math.floor(random()*4)*2],target=DEMO_POSITIONS[Math.floor(random()*4)*2+1];
    const start=origin+i*HOUR, id=`SYNTH-H${String(i+1).padStart(4,'0')}`;
    const dep=random()<.3, short=random()<.2, incomplete=random()<.23;
    const leadDays=2+Math.floor(random()*28), submittedAt=new Date(start).toISOString();
    const request={id,type,department:team,team,employeeId:`SYNTH-E${i+1}`,sourcePositionId:source.id,targetPositionId:type==='transfer'?target.id:'',positionTitle:type==='create'?'Synthetic planning position':'',grade:'G7',submittedAt,targetHours,effectiveDate:new Date(start+leadDays*DAY).toISOString().slice(0,10),justification:short?'Change':'Synthetic operational capacity planning request for a generated training case.',dependencyRequired:dep,dependencyId:dep?`SYNTH-UP${i}`:'',status:'completed'};
    if(type==='create')request.sourcePositionId='';
    if(incomplete){const candidates=requiredFields(type);request[candidates[Math.floor(random()*candidates.length)]]='';}
    const missing=requiredFields(type).filter(k=>!String(request[k]??'').trim()).length;
    const cross=type==='transfer'&&source.department!==target.department, gradeChange=type==='transfer'?Math.abs(Number(source.grade.slice(1))-Number(target.grade.slice(1))):0;
    const returnChance=sigmoid(-2.25+missing*1.7+short*1.5+dep*.55+cross*.25+(type==='create'?.25:0));
    const willReturn=random()<returnChance;
    const desiredHours=targetHours*(.22+random()*.78+dep*.3+short*.16+missing*.22+cross*.11+gradeChange*.035+(willReturn?.31:0));
    const log=[]; const add=(hour,step,outcome='entered',extra={})=>log.push({id:`${id}-E${log.length+1}`,requestId:id,step,timestamp:new Date(start+hour*HOUR).toISOString(),outcome,team,actor:'Generated synthetic actor',...extra});
    add(0,'Submitted','submitted');add(1,'Validation');
    let cursor=4+random()*13+missing*4;
    if(willReturn){add(cursor,'Validation','returned',{returnReason:missing?'Missing required information':short?'Missing justification':'Approval routing mismatch'});add(cursor,'Correction','awaiting_correction');cursor+=4+random()*18;add(cursor,'Validation','resubmitted');}
    cursor+=2+random()*8;add(cursor,'Approval');cursor+=4+random()*10;add(cursor,'Position update');
    if(dep&&random()<.7){add(cursor,'Position update','blocked',{category:'dependency'});cursor+=6+random()*20;add(cursor,'Position update','resolved',{category:'dependency'});}
    const finalHours=Math.max(desiredHours,cursor+2);add(finalHours,'Complete','completed');
    // Observation time is sampled before inspecting outcomes. Forecast evaluation
    // later excludes cases whose outcome is already known at that timestamp.
    const observationAt=new Date(start+random()*targetHours*.65*HOUR).toISOString();
    const features=extractFeatures(request,log,observationAt,{positions:DEMO_POSITIONS});
    records.push({request,events:log,observationAt,features:features.values,delayLabel:+(finalHours>targetHours),returnLabel:+willReturn,knownCompleted:!!features.facts.completed,knownReturn:features.facts.returns.length>0,completionAt:log.at(-1).timestamp});
  }
  return records;
}
export const generatedHistory=generatedCases();
const splitIndex=Math.floor(generatedHistory.length*.8);
const TEST=generatedHistory.slice(splitIndex);
const TRAINING_CUTOFF=TEST[0].request.submittedAt;
const TRAIN=generatedHistory.slice(0,splitIndex).filter(row=>Date.parse(row.completionAt)<Date.parse(TRAINING_CUTOFF));
const PURGED_CASES=splitIndex-TRAIN.length;
function fit(records,label){
  const n=records.length,p=FEATURE_DEFINITIONS.length;
  const means=Array.from({length:p},(_,j)=>records.reduce((sum,r)=>sum+r.features[j],0)/n);
  const scales=means.map((m,j)=>Math.sqrt(records.reduce((sum,r)=>sum+(r.features[j]-m)**2,0)/n)||1);
  const xs=records.map(r=>r.features.map((x,j)=>(x-means[j])/scales[j]));
  const weights=Array(p).fill(0),rate=records.reduce((sum,r)=>sum+r[label],0)/n;
  let intercept=Math.log(Math.max(.001,rate)/Math.max(.001,1-rate));
  for(let epoch=0;epoch<400;epoch++){
    let interceptGradient=0;const gradients=Array(p).fill(0);
    for(let i=0;i<n;i++){
      const error=sigmoid(intercept+xs[i].reduce((sum,x,j)=>sum+x*weights[j],0))-records[i][label];
      interceptGradient+=error;for(let j=0;j<p;j++)gradients[j]+=error*xs[i][j];
    }
    const learningRate=.16/(1+epoch/600);
    intercept-=learningRate*interceptGradient/n;
    for(let j=0;j<p;j++)weights[j]-=learningRate*(gradients[j]/n+.012*weights[j]);
  }
  return {means,scales,weights,intercept,baseRate:rate,n,featureRanges:FEATURE_DEFINITIONS.map((_,j)=>({min:Math.min(...records.map(r=>r.features[j])),max:Math.max(...records.map(r=>r.features[j]))}))};
}
function probability(model,values){return sigmoid(model.intercept+values.reduce((sum,v,j)=>sum+model.weights[j]*(v-model.means[j])/model.scales[j],0));}
function rocAuc(predictions,labels){
  const rows=predictions.map((p,i)=>({p,y:labels[i]})).sort((a,b)=>a.p-b.p);let rankSum=0;
  for(let i=0;i<rows.length;){let end=i+1;while(end<rows.length&&rows[end].p===rows[i].p)end++;const averageRank=(i+1+end)/2;for(let j=i;j<end;j++)if(rows[j].y)rankSum+=averageRank;i=end;}
  const positives=labels.reduce((a,b)=>a+b,0),negatives=labels.length-positives;
  return positives&&negatives?(rankSum-positives*(positives+1)/2)/(positives*negatives):null;
}
function metrics(model,records,label){
  const probs=records.map(r=>probability(model,r.features)),ys=records.map(r=>r[label]);
  let tp=0,fp=0,tn=0,fn=0;
  probs.forEach((p,i)=>{if(p>=.5){if(ys[i])tp++;else fp++;}else if(ys[i])fn++;else tn++;});
  const precision=tp+fp?tp/(tp+fp):0,recall=tp+fn?tp/(tp+fn):0,n=records.length;
  return {n,positiveRate:round(ys.reduce((a,b)=>a+b,0)/n),accuracy:round((tp+tn)/n),precision:round(precision),recall:round(recall),f1:round(precision+recall?2*precision*recall/(precision+recall):0),brier:round(probs.reduce((sum,p,i)=>sum+(p-ys[i])**2,0)/n),rocAuc:rocAuc(probs,ys)===null?null:round(rocAuc(probs,ys)),baselineBrier:round(ys.reduce((sum,y)=>sum+(model.baseRate-y)**2,0)/n),trainingBaseRate:round(model.baseRate),confusion:{tp,fp,tn,fn}};
}
const delayTrain=TRAIN.filter(r=>!r.knownCompleted),delayTest=TEST.filter(r=>!r.knownCompleted);
const returnTrain=TRAIN.filter(r=>!r.knownCompleted&&!r.knownReturn),returnTest=TEST.filter(r=>!r.knownCompleted&&!r.knownReturn);
const DELAY_MODEL=fit(delayTrain,'delayLabel'),RETURN_MODEL=fit(returnTrain,'returnLabel');
export const MODEL_CARD={
  version:VERSION,scope:'Generated synthetic data only',method:'Two L2-regularised logistic regression baselines, fitted locally with deterministic gradient descent.',generatedCases:generatedHistory.length,
  generatedPeriod:{from:generatedHistory[0].request.submittedAt,to:new Date(Math.max(...generatedHistory.map(r=>Date.parse(r.completionAt)))).toISOString()},
  observationPolicy:'One sampled in-flight observation per request, from submission through 65% of its illustrative target. Future events are excluded from features. Completed cases are excluded from forecast evaluation; previously returned cases are also excluded from return forecast evaluation.',
  split:{method:'Chronological whole-request holdout; training cases purged unless outcomes matured before test submissions; normalisation fitted on training only.',trainingCutoff:TRAINING_CUTOFF,purgedCases:PURGED_CASES,trainCases:TRAIN.length,testCases:TEST.length,trainFrom:TRAIN[0].request.submittedAt,trainTo:TRAIN.at(-1).request.submittedAt,testFrom:TEST[0].request.submittedAt,testTo:TEST.at(-1).request.submittedAt},
  features:FEATURE_DEFINITIONS,
  outcomes:{delay:{label:'Completion exceeds the request’s illustrative calendar-hour target',targetBasis:'Calendar elapsed time; not an Emirates SLA'},return:{label:'A correction return occurs before completion; forecast only while no return is observed'}},
  metrics:{delay:metrics(DELAY_MODEL,delayTest,'delayLabel'),return:metrics(RETURN_MODEL,returnTest,'returnLabel')},threshold:.5,
  limitations:['Generated labels and patterns are not evidence of Emirates performance or judge-test accuracy.','Displayed probabilities are uncalibrated synthetic baseline estimates; real-data calibration and validation are required.','No business calendars, external HR systems or employee-sensitive features are used.','Training assumes a complete event log; missing events, changed processes and out-of-distribution requests can reduce reliability.','Grade or department comparisons missing from the position register are encoded as zero and disclosed.','Observed overdue, returned and completed states are facts, not model predictions.'],
  leakageControls:['Whole requests remain in one chronological partition.','Training normalisation and weights never use the held-out partition.','Feature extraction ignores all events after the observation timestamp.','Final duration, final outcome and future return reasons are never model features.','Forecast metrics exclude outcomes already known at observation time.'],
};
/** Fit replacement baselines from labelled synthetic case snapshots.
 * Each row: {request:<form AS OF observationAt>, events:<full known history>,
 * observationAt:ISO, delayLabel:0|1, returnLabel:0|1}. Never supply a revised
 * future form as an earlier observation. Outcome labels must be mature/known;
 * unfinished outcomes must remain outside this fitting API.
 */
export function trainModels(trainingCases,testCases,context={positions:[]}){
  if(!Array.isArray(trainingCases)||!Array.isArray(testCases)||trainingCases.length<30||!testCases.length)throw new Error('Provide at least 30 labelled training cases and a separate chronological test set.');
  const trainIds=new Set(trainingCases.map(r=>r.request?.id));
  if(testCases.some(r=>trainIds.has(r.request?.id)))throw new Error('A request cannot appear in both training and test sets.');
  const normalize=rows=>rows.map(row=>{
    if(!row.request?.id||!validDate(row.observationAt)||![0,1].includes(row.delayLabel)||![0,1].includes(row.returnLabel))throw new Error('Each labelled case needs a request, observationAt, and known binary delayLabel/returnLabel.');
    const info=extractFeatures(row.request,row.events||[],row.observationAt,context);
    return {...row,features:info.values,knownCompleted:!!info.facts.completed,knownReturn:info.facts.returns.length>0};
  });
  const train=normalize(trainingCases),test=normalize(testCases);
  if(Math.max(...train.map(r=>Date.parse(r.request.submittedAt)))>=Math.min(...test.map(r=>Date.parse(r.request.submittedAt))))throw new Error('Training requests must precede the held-out requests chronologically.');
  const testStart=Math.min(...test.map(r=>Date.parse(r.request.submittedAt)));
  if(train.some(r=>{const completion=(r.events||[]).findLast(e=>e.outcome==='completed'||e.step==='Complete');return !completion||Date.parse(completion.timestamp)>=testStart;}))throw new Error('Training labels must mature at a recorded completion before the held-out period starts.');
  const delayRows=train.filter(r=>!r.knownCompleted),returnRows=train.filter(r=>!r.knownCompleted&&!r.knownReturn);
  for(const[rows,label]of[[delayRows,'delayLabel'],[returnRows,'returnLabel']])if(rows.length<20||new Set(rows.map(r=>r[label])).size<2)throw new Error('Forecast-eligible training cases need both outcomes and at least 20 observations.');
  const models={delay:fit(delayRows,'delayLabel'),return:fit(returnRows,'returnLabel')};
  const delayTest=test.filter(r=>!r.knownCompleted),returnTest=test.filter(r=>!r.knownCompleted&&!r.knownReturn);
  if(!delayTest.length||!returnTest.length)throw new Error('The held-out set needs forecast-eligible cases for each outcome.');
  const card={...structuredClone(MODEL_CARD),version:context.version||'local-labelled-synthetic-fit-v1',scope:context.scope||'User-supplied labelled synthetic data',generatedCases:0,generatedPeriod:null,
    split:{method:'Caller-provided chronological whole-request partitions; checked for overlap and ordering.',trainCases:train.length,testCases:test.length,trainFrom:new Date(Math.min(...train.map(r=>Date.parse(r.request.submittedAt)))).toISOString(),trainTo:new Date(Math.max(...train.map(r=>Date.parse(r.request.submittedAt)))).toISOString(),testFrom:new Date(Math.min(...test.map(r=>Date.parse(r.request.submittedAt)))).toISOString(),testTo:new Date(Math.max(...test.map(r=>Date.parse(r.request.submittedAt)))).toISOString()},
    metrics:{delay:metrics(models.delay,delayTest,'delayLabel'),return:metrics(models.return,returnTest,'returnLabel')},
    limitations:['Caller must confirm that labels are mature and request forms reflect the observation time, and supply the correct position snapshot.',...MODEL_CARD.limitations.filter(x=>!x.startsWith('Generated labels'))]};
  return {version:card.version,scope:card.scope,models,modelCard:card};
}
export function getModelReport(bundle){return structuredClone(bundle?.modelCard||MODEL_CARD);}
function level(p){return p>=.6?'high':p>=.3?'medium':'low';}
function explain(model,featureInfo){
  return FEATURE_DEFINITIONS.map((feature,j)=>({text:`${feature.label} ${model.weights[j]*(featureInfo.values[j]-model.means[j])/model.scales[j]>=0?'raises':'reduces'} the fitted model score relative to the training average.`,evidence:featureInfo.evidence[j],contribution:round(model.weights[j]*(featureInfo.values[j]-model.means[j])/model.scales[j]),feature:feature.key}))
    .sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution)).slice(0,4);
}
export function predictRequest(request,eventLog=[],asOf,context={positions:[]}){
  const featureInfo=extractFeatures(request,eventLog,asOf,context),f=featureInfo.facts;
  const completed=!!f.completed, alreadyDelayed=f.elapsed>f.targetHours,alreadyReturned=f.returns.length>0;
  const delayModel=context.modelBundle?.models?.delay||DELAY_MODEL,returnModel=context.modelBundle?.models?.return||RETURN_MODEL;
  const card=context.modelBundle?.modelCard||MODEL_CARD;
  const predictedDelay=probability(delayModel,featureInfo.values),predictedReturn=probability(returnModel,featureInfo.values);
  const delayKnown=completed||alreadyDelayed,returnKnown=completed||alreadyReturned;
  const delayProbability=delayKnown?+(f.elapsed>f.targetHours):predictedDelay;
  const returnProbability=returnKnown?+alreadyReturned:predictedReturn;
  const delayReasons=delayKnown?[{text:completed?(alreadyDelayed?'Completed after the illustrative target.':'Completed within the illustrative target.'):'The request is already overdue; this is an observed fact.',evidence:`${round(f.elapsed,1)} elapsed calendar hours / ${f.targetHours} target hours; ${f.completed?.id||`observation ${asOf}`}.`,contribution:null}]:explain(delayModel,featureInfo);
  const returnReasons=returnKnown?[{text:alreadyReturned?'A correction return is already observed; this is not a forecast.':'Completed with no recorded return in the supplied history.',evidence:alreadyReturned?f.returns.map(e=>`${e.id}: ${e.returnReason||e.reason||'Returned'} at ${e.timestamp}`).join('; '):`${f.completed.id}: completed at ${f.completed.timestamp}.`,contribution:null}]:explain(returnModel,featureInfo);
  const supportWarnings=[];
  for(const[name,model,known]of[['delay',delayModel,delayKnown],['return',returnModel,returnKnown]]){
    if(known)continue;
    const outside=FEATURE_DEFINITIONS.filter((_,j)=>model.featureRanges&&(featureInfo.values[j]<model.featureRanges[j].min-1e-8||featureInfo.values[j]>model.featureRanges[j].max+1e-8));
    if(outside.length)supportWarnings.push(`The ${name} forecast is outside generated training support for: ${outside.map(f=>f.label).join(', ')}. This is an extrapolation, not a validated estimate for this cohort.`);
  }
  if(!Number.isFinite(Number(request.targetHours))||Number(request.targetHours)<=0)supportWarnings.push('The target time is missing; the model uses an illustrative request-type default, not a confirmed SLA.');
  return {delay:{probability:round(delayProbability),level:level(delayProbability),alreadyDelayed,outcomeKnown:delayKnown,kind:delayKnown?'observed':'forecast',reasons:delayReasons},return:{probability:round(returnProbability),level:level(returnProbability),alreadyReturned,outcomeKnown:returnKnown,kind:returnKnown?'observed':'forecast',reasons:returnReasons},modelVersion:card.version,scope:card.scope,observationAt:asOf,method:card.method,limitations:card.limitations,outOfDistribution:supportWarnings.some(w=>w.includes('outside generated training support')),dataWarnings:supportWarnings};
}
export function predictionRows(requests,eventLog,asOf,context={positions:[]}){
  return requests.filter(r=>validDate(r.submittedAt)&&Date.parse(r.submittedAt)<=Date.parse(asOf)).map(r=>{
    const p=predictRequest(r,eventLog,asOf,context);
    return {request_id:r.id,observation_at:asOf,delay_probability:p.delay.probability,delay_kind:p.delay.kind,already_delayed:p.delay.alreadyDelayed,return_probability:p.return.probability,return_kind:p.return.kind,already_returned:p.return.alreadyReturned,model_version:p.modelVersion,data_scope:p.scope,data_warnings:p.dataWarnings.join(' | '),delay_evidence:p.delay.reasons.map(e=>`${e.text} Evidence: ${e.evidence}`).join(' | '),return_evidence:p.return.reasons.map(e=>`${e.text} Evidence: ${e.evidence}`).join(' | ')};
  });
}
