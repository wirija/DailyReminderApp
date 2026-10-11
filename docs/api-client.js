/* Authenticated backend boundary. Static previews stay independent of server records. */
(function (root) {
  'use strict';
  const api = { enabled: root.PLANNER_SERVER === true, user: null, members: [], revision: 0, workspaceId: null, provider: 'ollama', providerName: 'Ollama' };
  let csrfToken = '', snapshot = null, baseline = '', timer = null, saving = false, pending = false, conflict = false, destroyed = false;
  const doc = root.document;
  const serialize = value => JSON.stringify(value, (key, item) => key === 'file' ? undefined : item);
  const element = (tag, text, className) => { const node = doc.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  function setStatus(message, state = 'ready') {
    const node = doc?.getElementById('workspace-save-status');
    if (node) { node.textContent = message; node.dataset.state = state; }
    const retry = doc?.getElementById('workspace-retry'); if (retry) retry.hidden = !['error','auth'].includes(state);
    const exportButton = doc?.getElementById('workspace-export'); if (exportButton) exportButton.hidden = !['error', 'conflict', 'auth'].includes(state);
    const signIn = doc?.getElementById('workspace-sign-in'); if (signIn) signIn.hidden = state !== 'auth';
  }
  const errorText = value => Array.isArray(value) ? value.map(errorText).join(' ') : value && typeof value === 'object' ? Object.entries(value).slice(0, 4).map(([key,item]) => (['detail','non_field_errors'].includes(key) ? '' : key.replaceAll('_',' ') + ': ') + errorText(item)).join(' · ') : String(value ?? '');
  api.request = async function (path, options = {}) {
    const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    const timeout = controller ? root.setTimeout(() => controller.abort(), options.timeout || 30000) : null;
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    const method = options.method || 'GET';
    if (!['GET', 'HEAD'].includes(method) && csrfToken) headers['X-CSRFToken'] = csrfToken;
    let body = options.body;
    if (body !== undefined && !(typeof root.FormData === 'function' && body instanceof root.FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    try {
      const response = await root.fetch(path, { method, headers, body, credentials: 'same-origin', cache: 'no-store', signal: controller?.signal });
      const type = response.headers.get('content-type') || '';
      const data = type.includes('application/json') ? await response.json() : null;
      if (!response.ok) { const error = new Error(data && typeof data === 'object' ? errorText(data) : ('Request failed (' + response.status + '). Please retry.')); error.status = response.status; error.data = data; throw error; }
      return data;
    } catch (error) { if (error.name === 'AbortError') throw new Error('The server took too long to respond. Your changes are still here; retry when it is available.'); throw error; }
    finally { if (timeout !== null) root.clearTimeout(timeout); }
  };
  function gate(message, failed) {
    let host = doc.getElementById('app-loading');
    if (!host) { host = element('section', undefined, 'app-loading panel'); host.id = 'app-loading'; host.setAttribute('aria-label', 'Workspace connection'); doc.body.append(host); }
    host.replaceChildren(element('h1', failed ? 'Workspace unavailable' : 'Opening your workspace'), element('p', message));
    host.setAttribute('role', failed ? 'alert' : 'status');
    const shell = doc.querySelector('.shell'); if (shell) shell.hidden = true;
    if (failed) { const retry = element('button', 'Retry', 'primary'); retry.onclick = () => root.location.reload(); const login = element('a', 'Sign in'); login.href = '/accounts/login/?next='+encodeURIComponent('/app/'+(root.location?.hash||'')); host.append(retry, login); }
  }
  api.boot = async function () {
    if (!api.enabled) return null;
    gate('Loading your saved records…', false);
    try {
      const session = await api.request('/api/auth/session/');
      if (!session.user?.id) throw new Error('The server did not identify the signed-in workspace. Sign in again.');
      api.user = session.user; api.workspaceId = String(session.user.id); csrfToken = session.csrfToken || '';
      const data = await api.request('/api/workspace/');
      if (!data || !Array.isArray(data.clients) || !Array.isArray(data.projects) || !Array.isArray(data.opportunities)) throw new Error('The server returned an invalid workspace. Your saved records have not been changed.');
      if (String(data.workspaceId) !== api.workspaceId) throw new Error('The signed-in account changed while loading. Reopen the app to load the correct workspace.');
      api.revision = data.revision;
      api.members = data.teamMembers || data.members || [];
      return data;
    } catch (error) { gate(error.status === 401 ? 'Sign in to open your saved workspace.' : error.message, true); return false; }
  };
  function unsaved() { return snapshot && serialize(snapshot()) !== baseline; }
  api.hasUnsaved = () => !!unsaved();
  api.flush = async function () {
    if (!api.enabled || !snapshot || destroyed) return true;
    if (conflict) return false;
    if (saving) { pending = true; return false; }
    const payload = snapshot(), serialized = serialize(payload);
    if (serialized === baseline) { setStatus('All changes saved'); return true; }
    saving = true; pending = false; setStatus('Saving…', 'saving');
    try {
      const result = await api.request('/api/workspace/', { method: 'PUT', body: { ...JSON.parse(serialized), workspaceId: api.workspaceId, revision: api.revision } });
      if (!Number.isInteger(result?.revision)) throw new Error('Save confirmation was incomplete. Please retry before leaving.');
      api.revision = result.revision; baseline = serialized;
      setStatus('All changes saved');
      if (api.onSaved && !unsaved()) api.onSaved();
      return true;
    } catch (error) {
      if (error.status === 409) { conflict = true; setStatus('Another window changed this workspace. Download your unsaved changes before reopening. Nothing was overwritten.', 'conflict'); }
      else if (error.status === 401 || error.status === 403) setStatus('Your sign-in expired. Sign in again, then retry saving. Your changes are still on this page.', 'auth');
      else setStatus('Not saved: ' + error.message, 'error');
      return false;
    } finally {
      saving = false;
      if (pending && !conflict) { pending = false; api.changed(); }
      else if (unsaved() && !conflict && doc.getElementById('workspace-save-status')?.dataset.state === 'ready') api.changed();
    }
  };
  api.changed = function () {
    if (!api.enabled || !snapshot || conflict || destroyed || !unsaved()) return;
    if (saving) { pending = true; return; }
    if (timer !== null) root.clearTimeout(timer);
    setStatus(root.navigator?.onLine === false ? 'Offline · changes waiting to save. Keep this window open.' : 'Unsaved changes', 'pending');
    timer = root.setTimeout(() => { timer = null; api.flush(); }, 500);
  };
  api.connect = function (getSnapshot) {
    if (!api.enabled) return;
    snapshot = getSnapshot; baseline = serialize(snapshot());
    doc.getElementById('app-loading')?.remove();
    const shell = doc.querySelector('.shell'); if (shell) shell.hidden = false;
    const banner = element('div', undefined, 'workspace-sync'); banner.id = 'workspace-sync';
    const status = element('span', 'All changes saved'); status.id = 'workspace-save-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const retry = element('button', 'Retry saving'); retry.id = 'workspace-retry'; retry.hidden = true; retry.onclick = () => api.flush();
    const exportButton = element('button', 'Download unsaved changes'); exportButton.id = 'workspace-export'; exportButton.hidden = true;
    exportButton.onclick = () => { const url = root.URL.createObjectURL(new root.Blob([serialize({ ...snapshot(), workspaceId: api.workspaceId, revision: api.revision })], { type: 'application/json' })); const link = element('a'); link.href = url; link.download = 'planner-unsaved-changes.json'; link.click(); root.setTimeout(() => root.URL.revokeObjectURL(url), 1000); };
    const login = element('a', 'Sign in again'); login.id = 'workspace-sign-in'; login.href = '/accounts/login/?next='+encodeURIComponent('/app/'+(root.location?.hash||'')); login.target = '_blank'; login.rel = 'noopener'; login.hidden = true;
    banner.append(status, retry, exportButton, login); doc.querySelector('main')?.prepend(banner);
    const profile = doc.querySelector('.profile'); if (profile) profile.textContent = (api.user?.display_name || api.user?.username || 'My') + ' · Personal workspace · Singapore time';
    const badge = doc.getElementById('workspace-mode'); if (badge) badge.textContent = 'Private workspace';
    const admin = element('a', 'Team administration'); admin.href = '/admin/'; admin.className = 'server-admin-link';
    const logout = element('button', 'Sign out'); logout.type = 'button'; logout.onclick = async () => { logout.disabled = true; try { if (await api.whenSaved()) { await api.request('/accounts/logout/', { method: 'POST', body: {} }); root.location.assign('/accounts/login/'); } } catch (error) { setStatus(error.message, 'error'); } finally { logout.disabled = false; } };
    if(api.user?.is_superuser){const users=element('a','User administration');users.href='/administration/users/';users.className='server-admin-link';doc.querySelector('nav')?.append(users);}if(api.user?.is_superuser)doc.querySelector('nav')?.append(admin);doc.querySelector('nav')?.append(logout);
    // Capture after the existing handlers finish, including inline editors and Undo.
    ['input', 'change', 'click', 'submit', 'drop'].forEach(name => doc.addEventListener(name, () => root.setTimeout(api.changed, 0)));
    root.addEventListener('online', () => api.flush());
    root.addEventListener('beforeunload', event => { if (unsaved() || saving) { event.preventDefault(); event.returnValue = ''; } });
    root.addEventListener('focus', async () => { if (doc.getElementById('workspace-save-status')?.dataset.state !== 'auth') return; try { const session = await api.request('/api/auth/session/'); if (!session.user?.id || String(session.user.id) !== api.workspaceId) { conflict = true; setStatus('A different account is signed in. These changes belong to the original account. Download them, then reopen its workspace; nothing was sent to the new account.', 'conflict'); return; } csrfToken = session.csrfToken || csrfToken; await api.flush(); } catch (_) { /* Keep sign-in notice visible. */ } });
    api.poll = root.setInterval(() => { if (unsaved() && !saving && timer === null && !['error', 'auth', 'conflict'].includes(doc.getElementById('workspace-save-status')?.dataset.state)) api.changed(); }, 1000);
  };
  api.whenSaved = async function () { for(let attempt=0;saving&&attempt<150;attempt++)await new Promise(resolve=>root.setTimeout(resolve,200));return api.flush(); };
  api.upload = async function (file, fields) {
    if(!await api.whenSaved())throw new Error('Save the workspace successfully before uploading. Your selected file has not been uploaded.');
    const body=new root.FormData();body.append('file',file);Object.entries(fields||{}).forEach(([key,value])=>body.append(key,value));body.append('expected_revision',String(api.revision));
    const previous=api.revision;saving=true;setStatus('Uploading…','saving');
    try{
      const result=await api.request('/api/integrations/files/',{method:'POST',body,timeout:120000});
      if(Number.isInteger(result.workspace_revision)){
        if(result.previous_revision!==undefined&&result.previous_revision!==previous){conflict=true;setStatus('Another window changed this workspace. Your uploaded file is saved, but these local edits need review before saving.','conflict');throw new Error('Workspace changed during upload. Download your unsaved changes before reopening.');}
        api.revision=result.workspace_revision;
      }
      setStatus('Upload saved');return {...result,id:String(result.id)};
    }catch(error){
      if(error.status===409){conflict=true;setStatus('Another window changed this workspace. Download your unsaved changes before reopening. Nothing was overwritten.','conflict');}
      throw error;
    }finally{saving=false;if(!conflict&&unsaved())api.changed();else if(!conflict)setStatus('All changes saved');}
  };
  api.waitJob = async function (id) {
    id = typeof id === 'object' ? id.id : id;
    if(!id)throw new Error('The server did not return a background job reference.');
    for(let attempt=0;attempt<120;attempt++){
      const job=await api.request('/api/integrations/jobs/'+encodeURIComponent(id)+'/');
      if(job.status==='completed')return job;
      if(job.status==='failed')throw new Error(job.error||'Background processing failed. Check the connection and retry.');
      await new Promise(resolve=>root.setTimeout(resolve,2000));
    }
    throw new Error('Processing is still running. Check the background job in administration before retrying.');
  };
  api.draft = async function (body) {
    const provider = api.provider || 'ollama';
    if(!await api.whenSaved())throw new Error('Save your workspace before requesting an AI draft.');
    const response=await api.request('/api/integrations/ai/drafts/',{method:'POST',body:{...body,provider}});
    const job=await api.waitJob(response.job);
    const draft=response.draft?.id||response.draft||job.result?.draft_id;
    return api.request('/api/integrations/ai/drafts/'+encodeURIComponent(draft)+'/');
  };
  api.download = function (url, name) { const link = element('a'); link.href = url; link.download = name || ''; link.click(); };
  api.destroy = () => { destroyed = true; if (timer !== null) root.clearTimeout(timer); if (api.poll) root.clearInterval(api.poll); };
  root.PlannerAPI = api;
})(typeof window !== 'undefined' ? window : globalThis);
