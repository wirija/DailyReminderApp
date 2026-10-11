/* Populated workbook downloads and reviewed issue upserts. */
window.renderIssueExchange=function(mount,project,{esc,toast,beforeAction,onChange}){
 let rows=null,fileName='',busy=false;
 mount.innerHTML='<div class="pr-exchange-tools"><button type="button" data-issue-download>Download Excel template</button><button type="button" data-issue-upload>Upload Excel</button><input type="file" data-issue-file accept=".xlsx" aria-label="Upload issue workbook" hidden></div><p class="pbc-help">Download includes all saved issues in this project. Upload updates matching IDs; blank IDs add issues. Omitted rows are kept.</p><section data-issue-preview class="pbc-import" aria-live="polite" hidden></section>';
 const panel=mount.querySelector('[data-issue-preview]'),input=mount.querySelector('[data-issue-file]'),upload=mount.querySelector('[data-issue-upload]'),download=mount.querySelector('[data-issue-download]');
 const message=text=>{panel.hidden=false;panel.textContent=text};
 const lock=value=>{busy=value;download.disabled=value;upload.disabled=value};
 function cancel(){rows=null;panel.hidden=true;upload.focus()}
 mount.onclick=e=>e.stopPropagation();mount.onkeydown=e=>e.stopPropagation();
 download.onclick=async()=>{if(beforeAction())return;lock(true);try{const blob=await window.IssueExchange.download(project),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=project.reference+'-Issues.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Downloaded '+project.issueRecords.length+' issues with their IDs.')}catch(e){message('Could not download: '+e.message)}finally{lock(false)}};
 upload.onclick=()=>{if(!beforeAction())input.click()};
 input.onchange=async()=>{const file=input.files[0];input.value='';if(!file||beforeAction())return;lock(true);message('Reading workbook…');try{
  if(!/\.xlsx$/i.test(file.name)||file.size>5*1024*1024)throw Error('Choose an .xlsx workbook smaller than 5 MB.');
  rows=await window.IssueExchange.read(await file.arrayBuffer());fileName=file.name;if(!rows.length)throw Error('No issues found. Fill in the template and upload again.');
  const entries=window.IssueExchange.plan(rows,project),invalid=entries.some(r=>r.errors.length);
  panel.innerHTML='<h3>Review issue import</h3><p>'+esc(fileName)+' · '+entries.filter(r=>r.action==='Add').length+' new · '+entries.filter(r=>r.action==='Update').length+' updates · '+entries.filter(r=>r.action==='Unchanged').length+' unchanged</p><div class="pbc-import-rows">'+entries.map(r=>'<div><strong>Row '+r.row+' · '+esc(r.item.reference||'New ID on import')+' · '+r.action+'</strong><div class="pbc-import-values">'+window.IssueExchange.keys.slice(1).map((k,index)=>'<span><strong>'+window.IssueExchange.headers[index+1]+':</strong> '+esc(r.item[k]||'Not set')+'</span>').join('')+'</div><p>'+esc(r.errors.join(' ')||r.changes.map(k=>k+': '+(r.existing[k]||'not set')+' → '+(r.item[k]||'cleared')).join('; ')||'Ready')+'</p></div>').join('')+'</div>'+(entries.some(r=>r.dateChanged)?'<label>Reason for changed dates *<textarea data-issue-import-reason rows="2"></textarea></label>':'')+'<p data-issue-import-error role="alert"></p><button type="button" data-issue-import-save '+(invalid?'disabled':'')+'>Import issues</button> <button type="button" data-issue-import-cancel>Cancel</button>';
  panel.querySelector('[data-issue-import-cancel]').onclick=cancel;
  panel.querySelector('[data-issue-import-save]').onclick=()=>{const button=panel.querySelector('[data-issue-import-save]');button.disabled=true;try{const count=window.IssueExchange.apply(window.IssueExchange.plan(rows,project),project,panel.querySelector('[data-issue-import-reason]')?.value||'',fileName);rows=null;onChange();toast(count+' issues imported.')}catch(e){panel.querySelector('[data-issue-import-error]').textContent=e.message;button.disabled=false}};
 }catch(e){rows=null;message(e.message)}finally{lock(false)}};
 return {isActive:()=>busy||!!rows};
};
