/** Grounded, local intent-based assistant. No generative API or autonomous actions. */
import { analyzeProcess } from './analytics.js';
const HOUR=3600000;
const labels={
 en:{pending:'In progress',returned:'Needs correction',blocked:'Blocked',completed:'Completed',transfer:'employee transfer',create:'position creation','end-service':'end-of-service action',delete:'position deletion'},
 ar:{pending:'قيد المعالجة',returned:'بحاجة إلى تصحيح',blocked:'متوقف',completed:'مكتمل',transfer:'نقل موظف',create:'إنشاء وظيفة','end-service':'إجراء نهاية الخدمة',delete:'حذف وظيفة'}
};
const suggestions={en:['Where is my transfer request?','What needs my action?','Where are requests stalling?'],ar:['أين طلب نقلي؟','ما الطلبات التي تحتاج إلى إجراء مني؟','أين تتوقف الطلبات؟']};
const number=n=>Number(Number(n||0).toFixed(1));
function normalize(question){return String(question||'').trim().toLowerCase().replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[أإآ]/g,'ا').replace(/[\u064B-\u065F]/g,'');}
function history(id,state){const end=Date.parse(state.asOf);return(state.events||[]).filter(e=>e.requestId===id&&Number.isFinite(Date.parse(e.timestamp))&&Date.parse(e.timestamp)<=end).map((e,i)=>({...e,_i:i})).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||a._i-b._i);}
function visibleRequests(state,actor){
 if(!actor)return [];
 const rows=(state.requests||[]).filter(r=>Date.parse(r.submittedAt)<=Date.parse(state.asOf));
 if(actor.role==='manager')return rows.filter(r=>r.submittedBy===actor.id);
 if(actor.role==='approver')return rows.filter(r=>r.ownerId===actor.id||r.blocker?.resolutionOwnerId===actor.id);
 if(['hr','process-owner','processOwner','admin'].includes(actor.role))return rows;
 return [];
}
function ownerName(id,state,fallback){return(state.actors||[]).find(a=>a.id===id)?.name||fallback||id||'Owner not recorded';}
function lastEvidence(request,state){const last=history(request.id,state).at(-1);return [{label:`${request.id}: ${request.currentStep||'Step not recorded'} · ${state.asOf}`,requestId:request.id,...(last?{eventId:last.id}:{})}];}
function describe(request,state,language){
 const ar=language==='ar',log=history(request.id,state),last=log.at(-1),returned=log.findLast(e=>e.outcome==='returned');
 const waiting=request.status==='completed'?0:Math.max(0,(Date.parse(state.asOf)-Date.parse(last?.timestamp||request.submittedAt))/HOUR);
 const owner=ownerName(request.ownerId,state,request.owner);
 const status=labels[language][request.status]||request.status,step=request.currentStep||last?.step||(ar?'المرحلة غير مسجلة':'Step not recorded');
 let next=ar?`المالك التالي: ${owner}.`:`Next owner: ${owner}.`;
 if(request.status==='returned')next+=ar?` صحح المعلومات ثم أعد الإرسال للمراجعة البشرية. السبب المسجل: ${returned?.returnReason||returned?.reason||'غير مسجل'}.`:` Correct the information and resubmit for human review. Recorded reason: ${returned?.returnReason||returned?.reason||'not recorded'}.`;
 else if(request.status==='blocked'){
  const blocker=request.blocker||{},reason=String(blocker.reason||last?.reason||'').replace(/[.。]+$/,'');
  const resolutionOwner=ownerName(blocker.resolutionOwnerId,state,blocker.resolutionOwner);
  next+=ar?` يجب حل العائق${reason?`: ${reason}`:''}. مسؤول الحل: ${resolutionOwner}.`:` Resolve the blocker${reason?`: ${reason}`:''}. Resolution owner: ${resolutionOwner}.`;
  if(request.dependencyId||blocker.dependencyId)next+=ar?` المرجع السابق: ${request.dependencyId||blocker.dependencyId}.`:` Upstream reference: ${request.dependencyId||blocker.dependencyId}.`;
 }else if(request.status==='completed')next=ar?'لا يوجد إجراء تالٍ مسجل.':'No further action is recorded.';
 else next+=ar?' القرار التالي يتخذه شخص مخول.':' The next decision remains with an authorised person.';
 return ar?`${request.id}: ${status}. المرحلة: ${step}. الانتظار الحالي: ${number(waiting)} ساعة تقويمية. ${next}`:`${request.id}: ${status}. Current step: ${step}. Current wait: ${number(waiting)} calendar hours. ${next}`;
}
export function answerQuestion(question,state,actorId,language='en'){
 const lang=language==='ar'?'ar':'en',ar=lang==='ar',q=normalize(question),actor=(state.actors||[]).find(a=>a.id===actorId),rows=visibleRequests(state,actor),respond=(answer,evidence=[])=>({answer,evidence,suggestions:suggestions[lang],method:ar?'مساعد محلي يعتمد على مطابقة النوايا والسجلات المتاحة؛ لا يوافق على الطلبات.':'Local intent-based assistant grounded in visible demo records; it does not approve requests.',scope:'Synthetic demo actor scope'});
 if(!actor)return respond(ar?'اختر مستخدمًا تجريبيًا أولاً لعرض طلباته المتاحة.':'Select a demo actor before asking about their accessible requests.');
 if(!q)return respond(ar?'يمكنني عرض الحالة والمالك التالي والعوائق والطلبات التي تحتاج إلى إجراء منك.':'I can show status, next owners, blockers and requests that need your action.');
 if(/\b(approve|reject|authorise|authorize)\b|اعتمد|وافق على|ارفض/.test(q))return respond(ar?'تبقى الموافقات والقرارات بيد الأشخاص المخولين. افتح الطلب وسجل قرارًا بشريًا صريحًا في واجهة المراجعة. لا أستطيع اتخاذ القرار نيابة عنك.':'Approvals and decisions stay with authorised people. Open the request and record an explicit human decision in the review interface. I cannot make that decision for you.');
 const identifier=q.match(/\bp2p[\s-]?(\d+)\b/i);
 if(identifier){const id=`P2P-${identifier[1]}`,request=rows.find(r=>r.id.toLowerCase()===id.toLowerCase());if(!request)return respond(ar?'لا يوجد طلب بهذا المرجع ضمن السجلات المتاحة لهذا المستخدم التجريبي.':'No request with that reference is available in this demo actor’s accessible records.');return respond(describe(request,state,lang),lastEvidence(request,state));}
 if(/bottleneck|stall|process|where.*wait|تتوقف|توقف الطلبات|اختناق|العملية|تاخر الطلبات/.test(q)){
  const scoped={...state,requests:rows},analysis=analyzeProcess(scoped),top=analysis.bottlenecks[0];
  if(!top)return respond(ar?'لا توجد أحداث كافية لتحليل الانتظار ضمن السجلات المتاحة.':'There are not enough recorded events to analyse waiting in the accessible records.');
  const text=ar?`أكبر زمن تراكمي مسجل في ${top.step}: ${number(top.totalHours)} ساعة تقويمية عبر ${top.requests} طلبات، منها ${number(top.openHours)} ساعة انتظار مفتوحة عند وقت الرصد. هذا زمن منقضٍ وليس ساعات عمل الموظفين، ولا يثبت سبب التأخير.`:`The largest recorded cumulative interval is ${top.step}: ${number(top.totalHours)} calendar hours across ${top.requests} requests, including ${number(top.openHours)} currently open hours at the observation time. This is elapsed time, not staff effort, and does not establish the cause of delay.`;
  return respond(text,top.requestIds.slice(0,5).map(id=>({label:`${id}: ${top.step}`,requestId:id})));
 }
 if(/my action|needs.*action|need.*do|awaiting me|assigned to me|action needed|مني|تحتاج.*اجراء|احتاج.*افعل|مسند/.test(q)){
  const actionRows=rows.filter(r=>r.status!=='completed'&&(r.ownerId===actor.id||r.blocker?.resolutionOwnerId===actor.id||(actor.role==='manager'&&r.submittedBy===actor.id&&r.status==='returned')));
  if(!actionRows.length)return respond(ar?'لا توجد طلبات متاحة مسجلة تتطلب إجراءً منك الآن.':'No accessible request currently records an action assigned to you.');
  return respond((ar?`${actionRows.length} طلبات تحتاج إلى إجراء منك:\n`:`${actionRows.length} requests need your action:\n`)+actionRows.slice(0,5).map(r=>describe(r,state,lang)).join('\n\n'),actionRows.slice(0,5).flatMap(r=>lastEvidence(r,state)));
 }
 if(/block|delay|late|why|عائق|متوقف|تاخر|لماذا|متاخر/.test(q)){
  const affected=rows.filter(r=>r.status!=='completed'&&(r.status==='blocked'||(Date.parse(state.asOf)-Date.parse(r.submittedAt))/HOUR>Number(r.targetHours||72)));
  if(!affected.length)return respond(ar?'لا توجد طلبات متاحة مسجلة كمتوقفة أو تجاوزت هدفها التوضيحي. اسأل عن مرجع محدد لعرض تاريخه.':'No accessible request is currently recorded as blocked or beyond its illustrative target. Ask about a specific reference to inspect its history.');
  return respond(affected.slice(0,4).map(r=>{const age=number((Date.parse(state.asOf)-Date.parse(r.submittedAt))/HOUR);return describe(r,state,lang)+(ar?` الزمن منذ الإرسال: ${age} ساعة مقابل هدف توضيحي ${r.targetHours||72} ساعة.`:` Time since submission: ${age} hours versus the illustrative ${r.targetHours||72}-hour target.`);}).join('\n\n'),affected.slice(0,4).flatMap(r=>lastEvidence(r,state)));
 }
 if(/where|status|track|transfer|request|اين|حالة|نقل|طلبي|طلب/.test(q)){
  let selected=rows;if(/transfer|نقل/.test(q))selected=selected.filter(r=>r.type==='transfer');
  const active=selected.filter(r=>r.status!=='completed');if(active.length)selected=active;
  selected=selected.slice().sort((a,b)=>Date.parse(b.submittedAt)-Date.parse(a.submittedAt));
  if(!selected.length)return respond(ar?'لا توجد طلبات مطابقة ضمن السجلات المتاحة لهذا المستخدم التجريبي.':'There are no matching requests in this demo actor’s accessible records.');
  return respond(selected.slice(0,3).map(r=>describe(r,state,lang)).join('\n\n'),selected.slice(0,3).flatMap(r=>lastEvidence(r,state)));
 }
 return respond(ar?'يمكنني المساعدة في حالة الطلبات والعوائق والمالك التالي وتحليل الانتظار فقط، اعتمادًا على السجلات المتاحة. اسأل عن مرجع طلب أو اختر أحد الأمثلة.':'I can help with request status, blockers, next owners and waiting analysis using accessible records. Ask about a request reference or choose one of the examples.');
}
