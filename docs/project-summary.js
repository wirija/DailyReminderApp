/* Derive attention from saved session records; health remains a manual assessment. */
(function(root){
 function projectSummary(p,today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Singapore'})){
  const legacyDate=text=>{if(String(text).startsWith('Today'))return '2026-10-12';const match=String(text||'').match(/(\d{1,2})\s+([A-Za-z]{3})/);if(!match)return '';const n=Date.parse(match[1]+' '+match[2]+' '+String(p.end).slice(-4)+' 00:00:00 GMT');return Number.isFinite(n)?new Date(n).toISOString().slice(0,10):''};
  const work=p.plan?p.plan.flatMap(phase=>phase.children.flatMap(task=>task.children.length?task.children:[task])):(p.tasks||[]).map(t=>({name:t[0],team:t[1],status:t[2],end:legacyDate(t[3]),owners:[t[5]].filter(Boolean)}));
  const attention=p.plan?p.plan.flatMap(phase=>[phase,...phase.children.flatMap(task=>[task,...task.children])]):work;
  const complete=item=>['Done','Cancelled','Resolved','Closed'].includes(item.status);
  const team=name=>{const rows=work.filter(t=>String(t.team||'').includes(name));return {counts:[rows.filter(complete).length,rows.length],work:rows.filter(t=>!complete(t)).slice(0,2).map(t=>t.name).join('; ')||'No open work recorded'}};
  const flags=[],issues=[];
  const overdue=attention.filter(t=>!complete(t)&&t.end&&t.end<today),missing=attention.filter(t=>!complete(t)&&!t.end),blocked=attention.filter(t=>t.status==='Blocked');
  if(overdue.length)flags.push(overdue.length+' overdue work item'+(overdue.length===1?'':'s'));
  if(missing.length)flags.push(missing.length+' work item'+(missing.length===1?'':'s')+' without a due date');
  if(blocked.length)issues.push(blocked.length+' blocked work item'+(blocked.length===1?'':'s'));
  const actions=(p.actionItems||[]).filter(a=>!complete(a)),pbc=actions.filter(a=>a.kind==='PBC');
  if(pbc.length)issues.push(pbc.length+' open PBC request'+(pbc.length===1?'':'s'));
  const lateActions=actions.filter(a=>a.due&&a.due<today);if(lateActions.length)flags.push(lateActions.length+' overdue client action'+(lateActions.length===1?'':'s'));
  const openIssues=(p.issueRecords||[]).filter(i=>!complete(i));if(openIssues.length)issues.push(openIssues.length+' open tracked issue'+(openIssues.length===1?'':'s'));
  const lateIssues=openIssues.filter(i=>i.due&&i.due<today);if(lateIssues.length)flags.push(lateIssues.length+' overdue issue'+(lateIssues.length===1?'':'s'));
  const decisions=(p.meetingRecords||[]).flatMap(m=>m.decisions||[]).filter(d=>d.status!=='Agreed in discussion');if(decisions.length)issues.push(decisions.length+' meeting decision'+(decisions.length===1?'':'s')+' needing clarification');
  return {sg:team('Singapore'),hn:team('Hanoi'),flags,issues:issues.length?issues:['No open blockers or client requests recorded'],work};
 }
 root.projectSummary=projectSummary;if(typeof module!=='undefined')module.exports={projectSummary};
})(typeof window==='undefined'?globalThis:window);
