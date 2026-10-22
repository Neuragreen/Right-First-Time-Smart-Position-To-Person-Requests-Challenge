import {writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createInitialState} from '../public/compass/workflow.js';
import {analyzeProcess} from '../public/compass/analytics.js';
import {getModelReport} from '../public/compass/predictions.js';
const base=dirname(fileURLToPath(import.meta.url)),folder=join(base,'evidence');mkdirSync(folder,{recursive:true});
const asOf='2026-10-23T00:00:00Z',state=createInitialState(asOf),analysis=analyzeProcess(state);
const inflight=state.requests.filter(r=>r.status!=='completed');
function csvCell(value){let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function csv(rows){const fields=[...new Set(rows.flatMap(row=>Object.keys(row)))];return [fields,...rows.map(row=>fields.map(k=>typeof row[k]==='object'?JSON.stringify(row[k]):row[k]))].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';}
const files={
 'DEMO_ONLY_process_recommendations.json':JSON.stringify({scope:'Generated demonstration records; not Emirates findings',observationAt:asOf,totals:analysis.totals,recommendations:analysis.recommendations},null,2),
 'DEMO_ONLY_event_log.csv':csv(state.events),
 'DEMO_ONLY_requests.csv':csv(state.requests.map(r=>Object.fromEntries(['id','type','department','submittedAt','effectiveDate','employeeId','sourcePositionId','targetPositionId','justification','dependencyId','targetHours','status'].map(k=>[k,r[k]||''])))),
 'DEMO_ONLY_model_report.json':JSON.stringify(getModelReport(),null,2)
};
for(const[name,body]of Object.entries(files))writeFileSync(join(folder,name),body);
writeFileSync(join(folder,'manifest.json'),JSON.stringify({officialTestSetStatus:'NOT_SUPPLIED',scope:'DEMONSTRATION_ONLY',observationAt:asOf,requestCount:state.requests.length,inflightCount:inflight.length,officialPredictionCount:0,sourceModules:['public/compass/workflow.js','public/compass/analytics.js','public/compass/predictions.js'],files:Object.fromEntries(Object.entries(files).map(([name,body])=>[name,{sha256:createHash('sha256').update(body).digest('hex')}]))},null,2));
console.log(JSON.stringify({observationAt:asOf,officialPredictions:0,recommendations:analysis.recommendations.map(r=>({id:r.id,hours:r.elapsedHoursSaved,low:r.lowHoursSaved,high:r.highHoursSaved,baseline:r.baselineHours}))},null,2));
