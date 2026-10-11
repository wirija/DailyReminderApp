/* Shared, session-only searchable client dropdown. */
window.createClientPicker=function({host,clients,esc,multiple=false,selected=[],locked=[]}){
 const chosen=new Set(selected),fixed=new Set(locked),prefix=host.id;
 host.innerHTML='<span id="'+prefix+'-label" class="cp-label">'+(multiple?'Clients':'Client')+' *</span><details class="cp-dropdown"><summary aria-labelledby="'+prefix+'-label '+prefix+'-selection"><span id="'+prefix+'-selection"></span><span aria-hidden="true">⌄</span></summary><div class="cp-panel"><label for="'+prefix+'-search">Search clients</label><input id="'+prefix+'-search" type="search" autocomplete="off" placeholder="Client name, contact or email"><div class="cp-results"></div><p class="cp-count" role="status" aria-live="polite"></p></div></details>';
 const dropdown=host.querySelector('details'),summary=host.querySelector('summary'),search=host.querySelector('input'),results=host.querySelector('.cp-results'),count=host.querySelector('.cp-count'),selection=host.querySelector('#'+prefix+'-selection');
 function updateSelection(){const names=clients.filter(c=>chosen.has(c.id)).map(c=>c.name);selection.textContent=names.join(', ')||(multiple?'Select one or more clients':'Select a client');selection.title=names.join(', ')}
 function render(){const query=search.value.trim().toLowerCase(),matches=clients.filter(c=>[c.name,c.contact,c.email].join(' ').toLowerCase().includes(query));results.innerHTML=matches.map(c=>'<label class="cp-option"><input type="'+(multiple?'checkbox':'radio')+'" name="'+prefix+'-choice" value="'+c.id+'" '+(chosen.has(c.id)?'checked ':'')+(fixed.has(c.id)?'disabled ':'')+'><span>'+esc(c.name)+'</span><small>'+esc(c.contact||c.email||'')+'</small>'+(fixed.has(c.id)?'<small>Linked opportunity</small>':'')+'</label>').join('')||'<p class="cp-empty">No matching clients. Add a new client from Clients first.</p>';count.textContent=matches.length+' matching client'+(matches.length===1?'':'s');updateSelection()}
 search.oninput=render;
 results.onchange=e=>{const input=e.target;if(!input.matches('input'))return;const id=Number(input.value);if(fixed.has(id)||!clients.some(c=>c.id===id))return;if(!multiple)chosen.clear();if(input.checked)chosen.add(id);else chosen.delete(id);updateSelection();if(!multiple){dropdown.open=false;summary.focus()}};
 dropdown.addEventListener('toggle',()=>{if(dropdown.open)search.focus()});
 host.addEventListener('keydown',e=>{if(e.key==='Escape'&&dropdown.open){e.preventDefault();e.stopPropagation();dropdown.open=false;summary.focus()}});
 render();
 return {values:()=>[...chosen],focus:()=>summary.focus()};
};
