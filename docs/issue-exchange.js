/* Issue upserts share the local XLSX codec used by PBC. */
window.IssueExchange=(()=>{
 const headers=['Issue ID','Issue','Severity','Status','Owners','Raised date','Due date','Description','Notes','Resolution'];
 const keys=['reference','title','severity','status','owners','raised','due','description','notes','resolution'];
 const states=['Open','In progress','Blocked','Resolved','Closed'],severities=['Low','Medium','High','Critical'];
 const config=()=>({headers,keys,dateKeys:['raised','due'],freeTextKeys:['description','notes','resolution'],sheetName:'Issues',base64:window.ISSUE_TEMPLATE_BASE64,projectCell:'M12',lastColumn:'M'});
 const read=buffer=>window.PBCExchange.read(buffer,config());
 const download=project=>window.PBCExchange.download(project.issueRecords||[],{...config(),projectReference:project.reference});
 function plan(rows,project){
  const issues=project.issueRecords||[],seen=new Set(),fresh=new Set();
  return rows.map(r=>{
   const a={...r.item,severity:r.item.severity||'Medium',status:r.item.status||'Open'},errors=[...r.errors],existing=a.reference?issues.find(i=>i.reference===a.reference):null;
   if(rows.projectReference&&rows.projectReference!==project.reference)errors.push('This workbook belongs to another project. Download this project’s template.');
   if(a.reference&&!rows.projectReference)errors.push('Project reference is missing. Download a populated template from this project.');
   if(!a.title||!a.raised)errors.push('Issue and Raised date are required.');
   if(a.title.length>200||a.owners.length>200)errors.push('Issue and Owners must be 200 characters or fewer.');
   if(!states.includes(a.status))errors.push('Choose a valid status.');if(!severities.includes(a.severity))errors.push('Choose Low, Medium, High or Critical severity.');
   if(a.due&&a.raised&&a.due<a.raised)errors.push('Due date cannot precede Raised date.');
   if(a.reference){if(seen.has(a.reference))errors.push('Duplicate Issue ID in this file.');seen.add(a.reference);if(!existing)errors.push('Issue ID does not exist in this project. Leave ID blank to create a new issue.')}
   else{const fingerprint=[a.title,a.raised,a.owners].join('|').toLowerCase();if(fresh.has(fingerprint)||issues.some(i=>[i.title,i.raised,i.owners||''].join('|').toLowerCase()===fingerprint))errors.push('This issue already exists. Use its Issue ID to update it.');fresh.add(fingerprint)}
   const changes=existing?keys.slice(1).filter(k=>(existing[k]||'')!==a[k]):[];
   return {...r,item:a,errors,existing,changes,action:existing?(changes.length?'Update':'Unchanged'):'Add',dateChanged:!!existing&&['raised','due'].some(k=>(existing[k]||'')!==a[k])};
  });
 }
 function apply(entries,project,reason='',file='Excel upload'){
  if(entries.some(r=>r.errors.length))throw Error('Correct the workbook errors before importing.');
  if(entries.some(r=>r.dateChanged)&&!reason.trim())throw Error('Enter a reason for the changed dates.');
  const issues=project.issueRecords??=[],at=new Date().toLocaleString('en-GB',{timeZone:'Asia/Singapore'})+' SGT';
  let count=0,next=Math.max(0,...issues.map(i=>Number(i.reference.replace(/^ISS-/,''))||0));
  entries.forEach(r=>{if(r.action==='Unchanged')return;const values=Object.fromEntries(keys.slice(1).map(k=>[k,r.item[k]]));
   if(r.existing){const text=r.changes.map(k=>k+': '+(r.existing[k]||'not set')+' → '+(values[k]||'cleared')).join('; ');(r.existing.history??=[]).push({at,text:'Imported '+file+', row '+r.row+'. '+text+(r.dateChanged?'. Reason: '+reason.trim():'')});Object.assign(r.existing,values)}
   else issues.push({...values,id:'issue-'+Date.now()+'-'+r.row+'-'+Math.random().toString(36).slice(2,7),reference:'ISS-'+String(++next).padStart(3,'0'),history:[{at,text:'Imported '+file+', row '+r.row}]});count++;
  });return count;
 }
 return {headers,keys,read,download,plan,apply};
})();
