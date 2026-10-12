/* Session-only project hierarchy editor. Personal tasks remain independent. */
window.createProjectPlan = function(bridge){
 const $=id=>document.getElementById(id),esc=bridge.esc,day=86400000;
 const states=['Not started','In progress','Blocked','Awaiting my review','Awaiting client','Done'];
 let serial=0,sort=null,renderedProject=null;const collapsed=new Set();
 let editorShell=null,editorItemId=null,editorHost=null,dirtyProbe=()=>false;
 const filters=new WeakMap(),today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Singapore'});
 const overdue=item=>!!item.end&&item.end<today()&&item.status!=='Done';
 const isDirty=()=>dirtyProbe();
 const mayLeave=()=>{if(!isDirty())return true;bridge.toast('Save or cancel the current project edit before changing this view.');return false};
 window.DraftGuard?.register('project-plan',isDirty);
 function clearEditor(){document.querySelectorAll?.('.pp-name[aria-expanded]').forEach(button=>button.setAttribute('aria-expanded','false'));editorItemId=null;editorHost=null;dirtyProbe=()=>false;if(editorShell){editorShell.remove();editorShell=null}['project-plan-editor','task-plan-editor'].forEach(id=>{$(id).hidden=true;$(id).innerHTML=''})}
 const ownersOf=item=>item.owners||(item.owner?[item.owner]:[]);
 const id=()=> 'work-'+Date.now()+'-'+(++serial);
 const stamp=()=>new Date().toLocaleString('en-GB',{timeZone:'Asia/Singapore'})+' SGT';
 const number=date=>Date.parse(date+'T00:00:00Z');
 const iso=text=>{const n=Date.parse(text+' 00:00:00 GMT');return Number.isFinite(n)?new Date(n).toISOString().slice(0,10):''};
 const label=date=>date?new Date(number(date)).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}):'Not set';
 function legacyDue(text,p){if(text==='Missing')return '';if(text.startsWith('Today'))return '2026-10-12';const match=text.match(/(\d{1,2})\s+([A-Za-z]{3})/);return match?iso(match[1]+' '+match[2]+' '+new Date(number(iso(p.end))).getUTCFullYear()):''}
 function ensure(p){
  if(!p.plan){p.plan=[];if(p.tasks.length){const phase={id:'phase-'+p.reference,kind:'phase',name:'Delivery',start:iso(p.start),end:iso(p.end),owner:'',team:'',status:'In progress',estimate:'',description:'Sample phase containing the existing delivery tasks.',history:[],children:[]};phase.children=p.tasks.map((t,i)=>({id:'task-'+p.reference+'-'+i,kind:'task',name:t[0],start:'',end:legacyDue(t[3],p),owner:t[5]||'',team:t[1]||'',status:t[2],estimate:'',description:t[4]||'',history:[],children:[]}));p.plan.push(phase)}}
  if(!p.defaultPhasesInitialized){
   const defaults=[['start',p.startLabel||'Project start',iso(p.start)],['milestone',p.milestone||'Delivery',p.milestoneDate||iso(p.end)],['end',p.endLabel||'Project end',iso(p.end)]];
   const added=defaults.filter(([key])=>!p.plan.some(phase=>phase.defaultPhase===key)).map(([key,name,date])=>({id:'phase-'+p.reference+'-'+key,kind:'phase',defaultPhase:key,name,start:date,end:date,owners:[],owner:'',team:'',status:'Not started',estimate:'',description:'',history:[],children:[]}));
   p.plan.unshift(...added);p.defaultPhasesInitialized=true;
  }
  p.plan.forEach(phase=>{[phase,...phase.children,...phase.children.flatMap(t=>t.children)].forEach(item=>{item.owners=ownersOf(item);item.owner=item.owners.join(', ')})});
  return p.plan;
 }
 function flatten(p){const rows=[],ordered=items=>sort?[...items].sort((a,b)=>(sort.key==='estimate'?(Number(a.estimate)||0)-(Number(b.estimate)||0):String(a[sort.key]||'').localeCompare(String(b[sort.key]||''),undefined,{numeric:true,sensitivity:'base'}))*sort.direction):items;ordered(ensure(p)).forEach(phase=>{rows.push({item:phase,parent:null,depth:0});ordered(phase.children).forEach(task=>{rows.push({item:task,parent:phase,depth:1});ordered(task.children).forEach(sub=>rows.push({item:sub,parent:task,depth:2}))})});return rows}
 function find(p,itemId){return flatten(p).find(row=>row.item.id===itemId)}
 function outside(item,parent){return parent&&((item.start&&parent.start&&item.start<parent.start)||(item.end&&parent.end&&item.end>parent.end))}
 function controls(item){return (item.kind==='phase'?'<button data-plan-add="task" data-plan-parent="'+item.id+'">+ Task</button>':item.kind==='task'?'<button data-plan-add="subtask" data-plan-parent="'+item.id+'">+ Subtask</button>':'')}
 function render(p){
  if(!mayLeave())return false;
  clearEditor();renderedProject=p.reference;
  const rows=flatten(p),allDates=[iso(p.start),iso(p.end),p.milestoneDate,...rows.flatMap(r=>[r.item.start,r.item.end])].filter(Boolean),min=Math.min(...allDates.map(number)),max=Math.max(...allDates.map(number)),span=Math.max(1,(max-min)/day+1);
  const percent=date=>Math.max(0,Math.min(100,(number(date)-min)/day/span*100));
  const ticks=Array.from({length:5},(_,i)=>label(new Date(min+Math.round((span-1)*i/4)*day).toISOString().slice(0,10)));
  const filter=filters.get(p)||{query:'',status:'',owner:''};filters.set(p,filter);
  const isFiltering=!!(filter.query||filter.status||filter.owner),matches=rows.filter(({item})=>(!filter.query||[item.name,item.description,item.owner].join(' ').toLowerCase().includes(filter.query.toLowerCase()))&&(!filter.status||(filter.status==='Overdue'?overdue(item):item.status===filter.status))&&(!filter.owner||(filter.owner==='__unassigned'?!ownersOf(item).length:ownersOf(item).includes(filter.owner))));
  const matchIds=new Set(matches.map(r=>r.item.id));matches.forEach(row=>{let parent=row.parent;while(parent){matchIds.add(parent.id);parent=rows.find(r=>r.item.id===parent.id)?.parent}});
  const workRows=isFiltering?rows.filter(r=>matchIds.has(r.item.id)):rows;
  const ownerNames=[...new Set(rows.flatMap(r=>ownersOf(r.item)))].sort();
  const filterControls='<div class="pp-filters"><label>Search work<input type="search" data-plan-query value="'+esc(filter.query)+'" placeholder="Work item, notes or owner"></label><label>Status<select data-plan-status><option value="">All statuses</option>'+['Overdue',...states].map(v=>'<option '+(v===filter.status?'selected':'')+'>'+v+'</option>').join('')+'</select></label><label>Owner<select data-plan-owner><option value="">All owners</option><option value="__unassigned" '+(filter.owner==='__unassigned'?'selected':'')+'>Unassigned</option>'+ownerNames.map(v=>'<option value="'+esc(v)+'" '+(v===filter.owner?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label></div><p class="pp-help" role="status">'+(isFiltering?matches.length+' matching work items; parent rows retained for context.':rows.length+' work items.')+'</p>';
  const visible=rows.filter(r=>!r.parent||(!collapsed.has(r.parent.id)&&(r.depth!==2||!collapsed.has(rows.find(x=>x.item.id===r.parent.id).parent.id))));
  let html='<div class="pp-axis"><div class="pp-column-heads"><span>Work item</span><span>Owners</span><span>Actions</span></div><div class="pp-ticks">'+ticks.map(t=>'<span>'+t+'</span>').join('')+'</div></div>';
  html+=visible.map(({item,parent,depth})=>{
   const title=item.kind==='phase'?'Phase':item.kind==='task'?'Task':'Subtask',flag=outside(item,parent||{start:iso(p.start),end:iso(p.end)});
   const dates=label(item.start)+' → '+label(item.end),owner=item.owner||'Unassigned';
   let bar=item.start&&item.end?'<button class="pp-bar '+(item.kind==='phase'?'pp-phase-bar':'')+' '+(overdue(item)||item.status==='Blocked'||flag?'pp-warning':'')+'" data-plan-edit="'+item.id+'" style="left:'+percent(item.start)+'%;width:'+(((number(item.end)-number(item.start))/day+1)/span*100)+'%" title="'+dates+'" aria-label="Edit '+esc(item.name)+', '+dates+'">'+esc(item.status)+(overdue(item)?' · Overdue':'')+'</button>':item.end?'<button class="pp-due-marker '+(overdue(item)?'pp-warning':'')+'" data-plan-edit="'+item.id+'" style="left:'+percent(item.end)+'%" title="Due '+label(item.end)+'; start not set" aria-label="Edit '+esc(item.name)+', due '+label(item.end)+'; start not set">◆</button>':'<span class="pp-no-dates">Dates not set</span>';
   return '<div data-plan-anchor="'+item.id+'" class="pp-row pp-level-'+depth+'"><div class="pp-label"><div class="pp-item-heading">'+(item.children.length?'<button class="pp-toggle" data-plan-toggle="'+item.id+'" aria-expanded="'+!collapsed.has(item.id)+'" aria-label="'+(collapsed.has(item.id)?'Expand ':'Collapse ')+esc(item.name)+'">'+(collapsed.has(item.id)?'▸':'▾')+'</button>':'<span class="pp-toggle-space" aria-hidden="true"></span>')+'<button class="pp-name" data-plan-edit="'+item.id+'" title="'+esc(title+': '+item.name+' · '+dates)+'" aria-label="Edit '+esc(title.toLowerCase()+': '+item.name)+'">'+esc(item.name)+'</button>'+(overdue(item)?'<span class="badge warn">Overdue</span>':'')+(flag?'<span class="pp-date-warning" role="img" aria-label="Outside '+(parent?'parent':'project')+' dates" title="Outside '+(parent?'parent':'project')+' dates">⚠</span>':'')+'</div><span class="pp-meta pp-owner" title="'+esc(owner)+'">'+esc(owner)+'</span><div class="pp-item-controls">'+controls(item)+'</div></div><span class="pp-mobile-dates">'+esc(dates)+' · '+esc(item.status)+(overdue(item)?' · Overdue':'')+'</span><div class="pp-track">'+bar+'</div></div>';
  }).join('');
  if(!rows.length)html+='<p class="pp-empty">No phases yet. Add your first phase, then add tasks and subtasks within it.</p>';
  $('project-gantt').innerHTML=html;
  $('project-work-list').innerHTML=filterControls+(workRows.length?'<p class="pp-help">Sort within each phase or task; subtasks stay with their parent.</p><table class="pp-work-table"><thead><tr>'+[['name','Work item'],['kind','Level'],['owner','Owners'],['team','Team'],['start','Start'],['end','Due'],['estimate','Est. hours'],['status','Status']].map(([key,name])=>'<th scope="col" aria-sort="'+(sort?.key===key?(sort.direction===1?'ascending':'descending'):'none')+'"><button type="button" data-plan-sort="'+key+'">'+name+' <span aria-hidden="true">'+(sort?.key===key?(sort.direction===1?'↑':'↓'):'↕')+'</span></button></th>').join('')+'<th scope="col">Actions</th></tr></thead><tbody>'+workRows.map(({item,depth})=>'<tr data-plan-row="'+item.id+'" tabindex="0" aria-label="Edit '+esc(item.name)+'"><td data-label="Work item" class="pp-name-cell pp-indent-'+depth+'">'+esc(item.name)+'</td><td data-label="Level">'+item.kind+'</td><td data-label="Owners">'+esc(item.owner||'Unassigned')+'</td><td data-label="Team">'+esc(item.team||'—')+'</td><td data-label="Start">'+label(item.start)+'</td><td data-label="Due">'+label(item.end)+(overdue(item)?' · Overdue':'')+'</td><td data-label="Est. hours" class="pp-number">'+esc(item.estimate||'—')+'</td><td data-label="Status"><span class="badge '+(overdue(item)||item.status==='Blocked'?'warn':'')+'">'+esc(item.status)+'</span></td><td data-label="Actions">'+controls(item)+'</td></tr>').join('')+'</tbody></table>':rows.length?'<p class="pp-empty">No work matches these filters. Change the search, status or owner to see more.</p>':'<p class="pp-empty">No project work yet. Start with Add phase.</p>');
  const phases=p.plan.length,tasks=rows.filter(r=>r.item.kind==='task').length,subs=rows.filter(r=>r.item.kind==='subtask').length;
  $('project-plan-count').textContent=phases+' phases · '+tasks+' tasks · '+subs+' subtasks';
 }
 function edit(kind,parentId,itemId){
  if(!mayLeave())return;
  const p=bridge.active();if(!p){bridge.toast('Open a project first.');return}
  ensure(p);const existing=itemId?find(p,itemId):null,parent=existing?.parent||(parentId?find(p,parentId)?.item:null);
  if(existing)kind=existing.item.kind;
  if(!['phase','task','subtask'].includes(kind)||(kind==='task'&&parent?.kind!=='phase')||(kind==='subtask'&&parent?.kind!=='task'))return;
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Singapore'}),weekLater=new Date(number(today)+7*day).toISOString().slice(0,10);
  const item=existing?.item||{name:'',start:kind==='phase'?(parent?.start||iso(p.start)):today,end:kind==='phase'?(parent?.end||iso(p.end)):weekLater,owners:[],status:'Not started',estimate:'',description:'',history:[]};
  const members=[...bridge.people()];ownersOf(item).forEach(name=>{if(!members.some(m=>m.name===name))members.push({name,organisation:item.team||''})});
  const inTasks=!$('record-tasks').hidden,container=$(inTasks?'project-work-list':'project-gantt'),anchorId=itemId||parentId;
  clearEditor();
  let host;
  if(anchorId){
   const anchor=container.querySelector(inTasks?'[data-plan-row="'+anchorId+'"]':'[data-plan-anchor="'+anchorId+'"]');
   if(!anchor){bridge.toast('Expand the parent row to edit this item.');return}
   host=document.createElement('div');host.className='pp-editor';
   if(inTasks){editorShell=document.createElement('tr');editorShell.className='pp-editor-row';const cell=document.createElement('td');cell.colSpan=9;cell.append(host);editorShell.append(cell)}else editorShell=host;
   anchor.after(editorShell);
  }else host=$(inTasks?'task-plan-editor':'project-plan-editor');
  const selected=new Set(ownersOf(item));
  host.innerHTML='<div class="pp-editor-heading"><h3 id="pp-editor-title">'+(existing?'Edit ':'Add ')+kind+'</h3><span>'+esc(parent?.name||p.name)+'</span></div><form id="pp-form"><div class="pp-edit-grid"><label class="pp-edit-name">Name *<input id="pp-name" required maxlength="160" value="'+esc(item.name)+'"></label><label class="pp-edit-status">Status<select id="pp-status">'+states.map(state=>'<option '+(state===item.status?'selected':'')+'>'+state+'</option>').join('')+'</select></label><div class="pp-edit-dates"><span class="pp-field-label" id="pp-range-label">Start – end date *</span><div id="pp-range" aria-labelledby="pp-range-label"></div></div>'+(kind==='phase'?'':'<label class="pp-edit-estimate">Estimated hours<input id="pp-estimate" type="number" min="0.25" step="0.25" value="'+esc(item.estimate)+'"></label>')+'<div class="pp-edit-owners"><span class="pp-field-label" id="pp-owners-label">Owners</span><details class="pp-owner-picker"><summary aria-labelledby="pp-owners-label pp-owners-summary"><span id="pp-owners-summary"></span><span aria-hidden="true">▾</span></summary><div class="pp-owner-options">'+members.map((m,i)=>'<label><input type="checkbox" data-owner-index="'+i+'" '+(selected.has(m.name)?'checked':'')+'><span>'+esc(m.name)+'</span><small>'+esc(m.organisation)+'</small></label>').join('')+'</div></details></div></div><div class="pp-edit-secondary"><label>Notes<textarea id="pp-description" rows="2">'+esc(item.description)+'</textarea></label>'+(existing?'<label>Reason for date changes<input id="pp-reason" placeholder="Required when dates change"></label>':'')+'</div><p id="pp-error" class="field-error" role="alert"></p><div class="pp-editor-footer"><button id="pp-save" type="submit">'+(existing?'Save changes':'Add '+kind)+'</button><button id="pp-cancel" type="button">Cancel</button><span class="pp-meta">Owners and dates do not cascade to child items.</span>'+(existing?'<details class="pp-date-log"><summary>Date history</summary>'+item.history.map(h=>'<p>'+esc(h.at)+' · '+esc(h.text)+'</p>').join('')+(item.history.length?'':'<p>No date changes.</p>')+'</details>':'')+'</div></form>';
  editorItemId=itemId||null;editorHost=host;container.querySelector('.pp-name[data-plan-edit="'+itemId+'"]')?.setAttribute('aria-expanded','true');
  host.hidden=false;host.setAttribute('role','region');host.setAttribute('aria-labelledby','pp-editor-title');
  const range=window.createProjectRange($('pp-range'),{start:item.start,end:item.end,fallback:iso(p.start)});
  const ownerLabel=()=>{$('pp-owners-summary').textContent=[...selected].join(', ')||'Select owners';$('pp-owners-summary').title=[...selected].join(', ')};
  ownerLabel();host.querySelector('.pp-owner-options').onchange=e=>{const control=e.target.closest('[data-owner-index]');if(!control)return;const name=members[Number(control.dataset.ownerIndex)]?.name;if(!name)return;control.checked?selected.add(name):selected.delete(name);ownerLabel()};
  const returnFocus=()=>{const target=anchorId?container.querySelector(inTasks?'[data-plan-row="'+anchorId+'"]':'[data-plan-edit="'+anchorId+'"]'):$(inTasks?'task-add-phase':'project-add-phase');(target||$(inTasks?'task-add-phase':'project-add-phase')).focus()};
  const snapshot=()=>JSON.stringify({name:$('pp-name').value,status:$('pp-status').value,...range.value(),estimate:kind==='phase'?'':$('pp-estimate').value,owners:[...selected].sort(),description:$('pp-description').value,reason:existing?$('pp-reason').value:''});
  const initial=snapshot();dirtyProbe=()=>!!$('pp-name')&&snapshot()!==initial;
  $('pp-cancel').onclick=()=>{clearEditor();returnFocus()};
  $('pp-name').focus();
  $('pp-form').onsubmit=e=>{
   e.preventDefault();const name=$('pp-name').value.trim(),{start,end}=range.value(),status=$('pp-status').value,estimate=kind==='phase'?'':$('pp-estimate').value,reason=existing?$('pp-reason').value.trim():'';
   const fail=message=>$('pp-error').textContent=message;
   if(!states.includes(status)){fail('Choose a valid status.');return}
   if(!name){fail('Enter a name.');$('pp-name').focus();return}
   if(!start||!end||!Number.isFinite(number(start))||!Number.isFinite(number(end))||end<start){fail('Choose a start and end date in the calendar.');range.focus();return}
   if(estimate&&(!Number.isFinite(Number(estimate))||Number(estimate)<=0)){fail('Enter a positive estimate or leave it blank.');return}
   if(existing&&((item.defaultPhase==='start'&&start>iso(p.end))||(item.defaultPhase==='end'&&end<iso(p.start)))){fail('Project end must be on or after project start.');return}
   if(existing&&(start!==item.start||end!==item.end)&&!reason){fail('Add a reason for changing these dates.');$('pp-reason').focus();return}
   const owners=[...selected],teams=[...new Set(owners.map(name=>members.find(m=>m.name===name)?.organisation).filter(Boolean))],history=existing?item.history:[];
   if(existing&&(start!==item.start||end!==item.end))history.push({at:stamp(),text:'Start '+label(item.start)+' → '+label(start)+'; due '+label(item.end)+' → '+label(end)+'. '+reason});
   const values={name,start,end,owners,owner:owners.join(', '),team:teams.join(', '),status,estimate,description:$('pp-description').value.trim()};
   if(existing)Object.assign(item,values);else{const created={...values,id:id(),kind,history,children:[]};if(parent){parent.children.push(created);collapsed.delete(parent.id);const parentRow=find(p,parent.id);if(parentRow?.parent)collapsed.delete(parentRow.parent.id)}else p.plan.push(created)}
   if(existing&&item.defaultPhase){
    const key=item.defaultPhase,dateKey=key==='milestone'?'milestoneDate':key,nameKey=key==='milestone'?'milestone':key+'Label',oldDate=key==='milestone'?p.milestoneDate:iso(p[key]),nextDate=key==='start'?start:end;
    p[nameKey]=name;p[dateKey]=key==='milestone'?nextDate:label(nextDate);if(key==='milestone')p.milestoneLabel=label(nextDate);
    if(oldDate!==nextDate)(p.history??=[]).push([stamp(),name+': '+label(oldDate)+' → '+label(nextDate)+'. '+reason]);
   }
   $('pp-save').disabled=true;dirtyProbe=()=>false;render(p);bridge.changed?.(p);returnFocus();bridge.toast((existing?'Updated '+kind:'Added '+kind)+': '+name+'.');
  };
 }
 function onClick(e){if(e.target.closest('.pp-editor'))return;const phaseName=e.target.closest('.pp-name[data-plan-edit]');if(phaseName&&phaseName.dataset.planEdit===editorItemId&&editorHost&&find(bridge.active(),editorItemId)?.item.kind==='phase'){const hidden=!editorHost.hidden;editorHost.hidden=hidden;if(editorShell)editorShell.hidden=hidden;phaseName.setAttribute('aria-expanded',String(!hidden));if(hidden)phaseName.focus();else $('pp-name').focus();return;}if(e.target.closest('button,[data-plan-row]')&&!mayLeave())return;const sortButton=e.target.closest('[data-plan-sort]');if(sortButton){const key=sortButton.dataset.planSort;sort={key,direction:sort?.key===key?-sort.direction:1};render(bridge.active());$('project-work-list').querySelector('[data-plan-sort="'+key+'"]').focus();return}const add=e.target.closest('[data-plan-add]');if(add){edit(add.dataset.planAdd,add.dataset.planParent);return}const toggle=e.target.closest('[data-plan-toggle]');if(toggle){const itemId=toggle.dataset.planToggle;collapsed.has(itemId)?collapsed.delete(itemId):collapsed.add(itemId);render(bridge.active());$('project-gantt').querySelector('[data-plan-toggle="'+itemId+'"]').focus();return}const editButton=e.target.closest('[data-plan-edit]'),row=e.target.closest('[data-plan-row]');if(editButton||row)edit(null,null,editButton?.dataset.planEdit||row.dataset.planRow)}
 $('project-add-phase').onclick=()=>edit('phase');$('task-add-phase').onclick=()=>edit('phase');
 $('project-gantt').onclick=onClick;$('project-work-list').onclick=onClick;
 const changeFilter=e=>{const target=e.target;if(!target.matches('[data-plan-query],[data-plan-status],[data-plan-owner]'))return;const p=bridge.active(),filter=filters.get(p),key=target.matches('[data-plan-query]')?'query':target.matches('[data-plan-status]')?'status':'owner';if(!mayLeave()){target.value=filter[key];return}filter[key]=target.value;const selector=key==='query'?'[data-plan-query]':key==='status'?'[data-plan-status]':'[data-plan-owner]',cursor=target.selectionStart;render(p);const input=$('project-work-list').querySelector(selector);input.focus();if(key==='query'&&cursor!==null)input.setSelectionRange?.(cursor,cursor)};
 $('project-work-list').oninput=e=>{if(e.target.matches('[data-plan-query]'))changeFilter(e)};
 $('project-work-list').onchange=e=>{if(!e.target.matches('[data-plan-query]'))changeFilter(e)};
 $('project-work-list').onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-plan-row]')){e.preventDefault();edit(null,null,e.target.dataset.planRow)}};
 return {render,ensure,edit,isDirty};
};
