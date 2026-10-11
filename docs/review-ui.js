/* Shared safeguards for the session-only prototype. No network or persistence. */
(()=>{
 const checks=new Map();let undo=null;
 window.DraftGuard={
  register(key,isDirty){checks.set(key,isDirty)},
  watchForm(key,form){const snapshot=()=>JSON.stringify([...form.querySelectorAll('input,select,textarea')].map(f=>[f.name||f.id||'',f.value,f.checked]));const initial=snapshot();checks.set(key,()=>form.isConnected&&!form.closest('[hidden]')&&snapshot()!==initial)},
  isDirty(){return [...checks.values()].some(check=>{try{return check()}catch{return false}})},
  canLeave(){if(!this.isDirty())return true;const status=document.getElementById('toast');if(status)status.textContent='Save or cancel your current edit before leaving this record.';return false}
 };
 window.ReviewUndo={offer(label,restore){
  let host=document.getElementById('review-undo');if(!host){host=document.createElement('div');host.id='review-undo';host.className='review-undo';host.setAttribute('role','status');document.querySelector('main').append(host)}
  undo=restore;host.replaceChildren();const message=document.createElement('span');message.textContent=label+' ';const button=document.createElement('button');button.type='button';button.textContent='Undo';button.onclick=()=>{if(!window.DraftGuard.canLeave())return;const action=undo;undo=null;if(action)action();host.textContent='Restored.'};host.append(message,button);
 }};
 window.initReviewUI=function(){
  const theme=document.getElementById('review-theme');if(theme){theme.value='light';theme.onchange=()=>{document.documentElement.dataset.theme=theme.value;document.getElementById('toast').textContent=theme.value==='dark'?'Dark theme selected.':'Light theme selected.'}}
  document.querySelectorAll('table.register-table').forEach(table=>{const headers=[...table.querySelectorAll('thead th')].map(th=>th.textContent.replace(/[↕↑↓]/g,'').trim());table.querySelectorAll('tbody tr').forEach(row=>[...row.querySelectorAll('td')].forEach((td,i)=>td.dataset.label=headers[i]||''))});
  const modal=document.getElementById('modal'),content=document.getElementById('modal-content');let modalDirty=false;window.DraftGuard.register('global-modal',()=>!!modal?.open&&modalDirty);if(modal){modal.addEventListener('input',()=>modalDirty=true);modal.addEventListener('change',()=>modalDirty=true);modal.addEventListener('close',()=>modalDirty=false);const close=()=>{if(!modalDirty){modal.close();return}let guard=content.querySelector('[data-modal-discard]');if(!guard){guard=document.createElement('div');guard.setAttribute('data-modal-discard','');guard.className='review-draft-warning';guard.setAttribute('role','alert');const message=document.createElement('p');message.textContent='This form has unsaved changes.';const discard=document.createElement('button');discard.type='button';discard.textContent='Discard changes';discard.onclick=()=>{modalDirty=false;modal.close()};const keep=document.createElement('button');keep.type='button';keep.textContent='Keep editing';keep.onclick=()=>guard.remove();guard.append(message,discard,keep);content.append(guard);keep.focus()}};document.getElementById('close').onclick=close;modal.addEventListener('cancel',e=>{if(modalDirty){e.preventDefault();close()}})}if(modal&&content&&typeof MutationObserver!=='undefined')new MutationObserver(()=>{const heading=content.querySelector('h2');if(heading){if(!heading.id)heading.id='review-dialog-title';modal.removeAttribute('aria-label');modal.setAttribute('aria-labelledby',heading.id)}}).observe(content,{childList:true});
 };
 window.reviewLabelTables=function(){document.querySelectorAll('table.register-table,table.overview,#record-minutes table').forEach(table=>{const headers=[...table.querySelectorAll('thead th')].map(th=>th.textContent.replace(/[↕↑↓]/g,'').trim());table.querySelectorAll('tbody tr').forEach(row=>[...row.querySelectorAll('td')].forEach((td,i)=>td.dataset.label=headers[i]||''))})};
})();
