/** Event-derived process analysis. Calendar elapsed time, not measured labour. */
const HOUR=3600000;
const round=n=>Number(Number(n||0).toFixed(1));
const time=s=>Date.parse(s);
const valid=s=>Number.isFinite(time(s));
const unique=items=>[...new Set(items)];
function quantile(values,p){if(!values.length)return null;const sorted=values.slice().sort((a,b)=>a-b),index=(sorted.length-1)*p,low=Math.floor(index),fraction=index-low;return round(sorted[low]+((sorted[low+1]??sorted[low])-sorted[low])*fraction);}
function history(id,eventLog,cutoff){return eventLog.filter(e=>e.requestId===id&&valid(e.timestamp)&&time(e.timestamp)<=cutoff).map((e,i)=>({...e,_order:i})).sort((a,b)=>time(a.timestamp)-time(b.timestamp)||a._order-b._order);}
function week(timestamp){const d=new Date(timestamp);d.setUTCHours(0,0,0,0);const day=d.getUTCDay();d.setUTCDate(d.getUTCDate()-(day===0?6:day-1));return d.toISOString().slice(0,10);}
function completedEvent(log){return log.findLast(e=>e.outcome==='completed'||e.step==='Complete');}
function stateBlocker(request,log,cutoff){
  if(request.blocker&&valid(request.blocker.recordedAt)&&time(request.blocker.recordedAt)<=cutoff&&(!request.blocker.resolvedAt||time(request.blocker.resolvedAt)>cutoff))return request.blocker;
  const lastBlock=log.findLast(e=>e.outcome==='blocked');if(!lastBlock)return null;
  const blockIndex=log.indexOf(lastBlock),resolved=log.slice(blockIndex+1).some(e=>e.outcome==='resolved'||e.outcome==='completed');
  return resolved?null:{category:lastBlock.category||(lastBlock.dependencyId||request.dependencyId?'dependency':'unclassified'),reason:lastBlock.reason||'Cause not recorded',dependencyId:lastBlock.dependencyId||request.dependencyId,recordedAt:lastBlock.timestamp,eventId:lastBlock.id};
}
function segmentsFor(request,log,cutoff){
  let correctionReason='';
  return log.flatMap((event,index)=>{
    if(event.outcome==='resubmitted')correctionReason='';
    if(event.outcome==='returned')correctionReason=event.returnReason||event.reason||'Reason not recorded';
    if(event.outcome==='completed'||event.step==='Complete')return [];
    const next=log[index+1];
    return [{requestId:request.id,eventId:event.id,step:correctionReason?'Correction':event.step,team:event.team||request.team||request.department||'Unknown',hours:Math.max(0,((next?time(next.timestamp):cutoff)-time(event.timestamp))/HOUR),open:!next,returnReason:correctionReason,blocked:event.outcome==='blocked',category:event.category||''}];
  });
}
function recommendation(id,title,description,segments,requests,reason,pct,lowPct,highPct,steps){
  const baseline=segments.reduce((sum,s)=>sum+s.hours,0),ids=unique(segments.map(s=>s.requestId));
  const open=segments.filter(s=>s.open).reduce((sum,s)=>sum+s.hours,0),observed=baseline-open;
  return {id,title,description,affectedCount:ids.length,requestIds:ids,baselineHours:round(baseline),observedHours:round(observed),openHours:round(open),
    evidence:`${ids.length} selected requests; ${round(observed)} completed-interval hours and ${round(open)} currently open hours. Supporting events: ${unique(segments.map(s=>s.eventId)).join(', ')||'none in this selection'}.`,
    assumption:`Conditional scenario: reduce ${reason} elapsed time by ${pct*100}% (sensitivity range ${lowPct*100}–${highPct*100}%). These percentages are explicit planning assumptions, not estimated treatment effects.`,
    elapsedHoursSaved:round(baseline*pct),lowHoursSaved:round(baseline*lowPct),highHoursSaved:round(baseline*highPct),effortHoursSaved:null,implementationEffortHours:null,
    calculation:`${round(baseline)} relevant elapsed hours × ${pct*100}% assumed reduction`,steps,
    caveat:'Synthetic event evidence only. Open waits are right-censored at the observation timestamp. The scenario estimates elapsed turnaround opportunity, not HR labour or money. Validate benefits in a pilot. Do not sum recommendations without reconciling overlapping event intervals.',
    confidence:'Scenario estimate',dataScope:'Generated synthetic data only',evidenceEventIds:unique(segments.map(s=>s.eventId))};
}
export function analyzeProcess(state,filters={}){
  const asOf=state.asOf||new Date().toISOString(),cutoff=time(asOf);
  if(!Number.isFinite(cutoff))throw new Error('Process analysis needs a valid observation timestamp.');
  const type=filters.type||'all',team=filters.team||'all';
  const from=filters.from&&valid(filters.from)?time(`${filters.from.slice(0,10)}T00:00:00Z`):-Infinity;
  const to=filters.to&&valid(filters.to)?time(`${filters.to.slice(0,10)}T23:59:59.999Z`):Infinity;
  const requests=(state.requests||[]).filter(r=>valid(r.submittedAt)&&time(r.submittedAt)<=cutoff&&time(r.submittedAt)>=from&&time(r.submittedAt)<=to&&(type==='all'||r.type===type)&&(team==='all'||r.team===team||r.department===team));
  const rows=requests.map(request=>{const log=history(request.id,state.events||[],cutoff),complete=completedEvent(log);return {request,log,complete,blocker:stateBlocker(request,log,cutoff),duration:complete?Math.max(0,(time(complete.timestamp)-time(request.submittedAt))/HOUR):null};});
  const segments=rows.flatMap(r=>segmentsFor(r.request,r.log,cutoff)),completed=rows.filter(r=>r.complete),historicallyReturned=rows.filter(r=>r.log.some(e=>e.outcome==='returned'));
  const stepMap=new Map(),loopMap=new Map(),variantMap=new Map(),teamMap=new Map(),exceptionMap=new Map(),trendMap=new Map();
  for(const s of segments){if(!stepMap.has(s.step))stepMap.set(s.step,{step:s.step,ids:new Set(),totalHours:0,observedHours:0,openHours:0});const v=stepMap.get(s.step);v.ids.add(s.requestId);v.totalHours+=s.hours;v[s.open?'openHours':'observedHours']+=s.hours;}
  for(const row of rows){
    const {request:r,log,complete,duration,blocker}=row;
    for(const event of log.filter(e=>e.outcome==='returned')){const reason=event.returnReason||event.reason||'Reason not recorded';if(!loopMap.has(reason))loopMap.set(reason,{reason,count:0,ids:new Set(),eventIds:[]});const loop=loopMap.get(reason);loop.count++;loop.ids.add(r.id);loop.eventIds.push(event.id);}
    const path=log.map(e=>e.step).filter((s,i,all)=>i===0||s!==all[i-1]).join(' → ')||'No events recorded';
    const variantKey=`${path}|${complete?'complete':'inflight'}`;
    if(!variantMap.has(variantKey))variantMap.set(variantKey,{path,count:0,requestIds:[],complete:!!complete,partial:!complete});const variant=variantMap.get(variantKey);variant.count++;variant.requestIds.push(r.id);
    const groupKey=`${r.team||r.department||'Unknown'}|${r.type}`;
    if(!teamMap.has(groupKey))teamMap.set(groupKey,{team:r.team||r.department||'Unknown',type:r.type,count:0,durations:[],returned:0,requestIds:[]});
    const group=teamMap.get(groupKey);group.count++;group.requestIds.push(r.id);if(complete)group.durations.push(duration);if(log.some(e=>e.outcome==='returned'))group.returned++;
    const categories=new Map();
    for(const e of log.filter(e=>e.outcome==='blocked')){const category=e.category||(e.dependencyId||r.dependencyId?'dependency':'unclassified');if(!categories.has(category))categories.set(category,[]);categories.get(category).push(e.id);}
    if(blocker&&!categories.has(blocker.category||'unclassified'))categories.set(blocker.category||'unclassified',[blocker.eventId||'blocker record']);
    for(const[category,eventIds]of categories){if(!exceptionMap.has(category))exceptionMap.set(category,{category,count:0,activeCount:0,ids:new Set(),eventIds:[]});const ex=exceptionMap.get(category);ex.count+=eventIds.length;ex.ids.add(r.id);ex.eventIds.push(...eventIds);if(blocker&&(blocker.category||'unclassified')===category)ex.activeCount++;}
    const period=week(time(r.submittedAt));if(!trendMap.has(period))trendMap.set(period,{period,count:0,completed:0,hours:0,returned:0});const trend=trendMap.get(period);trend.count++;if(complete){trend.completed++;trend.hours+=duration;}if(log.some(e=>e.outcome==='returned'))trend.returned++;
  }
  const missingPattern=/missing|incomplete|justif|required|field|مفقود|ناقص|تبرير/i,routingPattern=/rout|approv|مسار|اعتماد/i;
  const correctionSegments=segments.filter(s=>s.step==='Correction'&&s.returnReason);
  const completeness=correctionSegments.filter(s=>missingPattern.test(s.returnReason));
  const routing=correctionSegments.filter(s=>!missingPattern.test(s.returnReason)&&routingPattern.test(s.returnReason));
  // Only the current unresolved dependency interval supports this scenario.
  const dependency=rows.filter(r=>r.blocker&&(r.blocker.category==='dependency'||r.blocker.dependencyId||r.request.dependencyId)).flatMap(row=>{
    const at=time(row.blocker.recordedAt||row.log.findLast(e=>e.outcome==='blocked')?.timestamp);
    if(!Number.isFinite(at)||at>cutoff)return [];
    return [{requestId:row.request.id,eventId:row.blocker.eventId||row.log.findLast(e=>e.outcome==='blocked')?.id||'blocker record',hours:Math.max(0,(cutoff-at)/HOUR),open:true,step:row.request.currentStep,category:'dependency'}];
  });
  const recs=[
    recommendation('REC-01','Catch incomplete submissions before routing','Apply explicit field checks and show a request-type-specific example before submission.',completeness,requests,'correction waits associated with missing information',.5,.25,.65,['Add and version the relevant submission rules.','Pilot with comparable request types.','Measure return rate and completed turnaround.']),
    recommendation('REC-02','Confirm the approval route before sending','Show the proposed human approvers and the organisational evidence used to choose them.',routing,requests,'correction waits associated with routing returns',.5,.25,.6,['Display the route and its source.','Ask an authorised human to confirm exceptions.','Compare routing returns for equivalent requests.']),
    recommendation('REC-03','Coordinate unresolved upstream dependencies','Name the upstream request and the person responsible for resolving the blocked transaction.',dependency,requests,'currently open dependency waits',.25,.1,.35,['Validate and link the upstream request.','Notify both responsible owners.','Measure resolved-blocker time in a pilot.']),
  ];
  return {asOf,snapshotAt:asOf,filters:{type,team,from:filters.from||'',to:filters.to||''},requestIds:requests.map(r=>r.id),
    totals:{total:requests.length,active:requests.length-completed.length,completed:completed.length,returned:rows.filter(r=>!r.complete&&(r.log.at(-1)?.outcome==='returned'||r.log.at(-1)?.step==='Correction')).length,blocked:rows.filter(r=>!r.complete&&r.blocker).length,historicallyReturned:historicallyReturned.length,returnRate:requests.length?round(100*historicallyReturned.length/requests.length):0,avgTurnaroundHours:completed.length?round(completed.reduce((s,r)=>s+r.duration,0)/completed.length):0,medianTurnaroundHours:quantile(completed.map(r=>r.duration),.5),p90TurnaroundHours:quantile(completed.map(r=>r.duration),.9),observedHours:round(segments.filter(s=>!s.open).reduce((sum,s)=>sum+s.hours,0)),openHours:round(segments.filter(s=>s.open).reduce((sum,s)=>sum+s.hours,0)),missingEventHistories:rows.filter(r=>!r.log.length).length},
    bottlenecks:[...stepMap.values()].map(v=>({step:v.step,requests:v.ids.size,requestIds:[...v.ids],totalHours:round(v.totalHours),observedHours:round(v.observedHours),openHours:round(v.openHours),avgHours:round(v.totalHours/v.ids.size)})).sort((a,b)=>b.totalHours-a.totalHours),
    loops:[...loopMap.values()].map(v=>({reason:v.reason,count:v.count,requestIds:[...v.ids],eventIds:v.eventIds})).sort((a,b)=>b.count-a.count),
    variants:[...variantMap.values()].sort((a,b)=>b.count-a.count),
    teamComparison:[...teamMap.values()].map(v=>({team:v.team,type:v.type,count:v.count,completed:v.durations.length,medianHours:quantile(v.durations,.5),p90Hours:quantile(v.durations,.9),avgHours:v.durations.length?round(v.durations.reduce((a,b)=>a+b,0)/v.durations.length):null,returnRate:round(100*v.returned/v.count),openCount:v.count-v.durations.length,requestIds:v.requestIds})).sort((a,b)=>a.type.localeCompare(b.type)||a.team.localeCompare(b.team)),
    exceptions:[...exceptionMap.values()].map(v=>({category:v.category,count:v.count,activeCount:v.activeCount,requestIds:[...v.ids],eventIds:v.eventIds})).sort((a,b)=>b.count-a.count),
    trend:[...trendMap.values()].sort((a,b)=>a.period.localeCompare(b.period)).map(v=>({period:v.period,count:v.count,completed:v.completed,avgHours:v.completed?round(v.hours/v.completed):null,returnRate:round(100*v.returned/v.count)})),
    recommendations:recs,
    waitBasis:'Elapsed calendar hours between recorded events, with open intervals censored at the stated observation time. This does not measure active handling effort. Team comparisons are grouped by request type; case mix, incomplete cases and small samples can affect differences.',
    recommendationBasis:'Each savings range is a conditional scenario applied to explicit event intervals. No measured labour saving, monthly extrapolation, causal effect or combined savings total is claimed.',
  };
}
