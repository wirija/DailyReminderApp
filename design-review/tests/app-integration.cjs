'use strict';
// Dependency-free, non-rendering DOM checks against the actual script load order.
// This deliberately does not emulate layout, browser security, CSS or accessibility APIs.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const docs = path.resolve(__dirname, '../../docs');
const decode = value => String(value).replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&nbsp;', '\u00a0');
const dataKey = value => value.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
let document;
class Node {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.childNodes = []; this.parentNode = null;
    this.dataset = {}; this.style = {}; this.listeners = {}; this._text = ''; this.value = attrs.value || ''; this.checked = 'checked' in attrs; this.disabled = 'disabled' in attrs; this.open = false; this.selectionStart = 0;
    this.offsetTop = 0; this.offsetHeight = 32;
    for (const [key, value] of Object.entries(attrs)) if (key.startsWith('data-')) this.dataset[dataKey(key)] = value;
    const classes = () => new Set(this.className.split(/\s+/).filter(Boolean));
    this.classList = { add: (...values) => { const set = classes(); values.forEach(v => set.add(v)); this.className = [...set].join(' '); }, remove: (...values) => { const set = classes(); values.forEach(v => set.delete(v)); this.className = [...set].join(' '); }, contains: value => classes().has(value), toggle: (value, force) => { const set = classes(), on = force === undefined ? !set.has(value) : force; on ? set.add(value) : set.delete(value); this.className = [...set].join(' '); return on; } };
  }
  get id() { return this.attrs.id || ''; } set id(value) { this.attrs.id = value; }
  get name() { return this.attrs.name || ''; } set name(value) { this.attrs.name = value; }
  get className() { return this.attrs.class || ''; } set className(value) { this.attrs.class = value; }
  get hidden() { return 'hidden' in this.attrs; } set hidden(value) { value ? this.attrs.hidden = '' : delete this.attrs.hidden; }
  get children() { return this.childNodes; }
  get firstElementChild() { return this.childNodes[0] || null; }
  get previousElementSibling() { const list = this.parentNode?.childNodes || []; return list[list.indexOf(this) - 1] || null; }
  get nextElementSibling() { const list = this.parentNode?.childNodes || []; return list[list.indexOf(this) + 1] || null; }
  get isConnected() { let node = this; while (node.parentNode) node = node.parentNode; return node === document?.documentElement; }
  get textContent() { return this._text + this.childNodes.map(node => node.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get elements() { return Object.fromEntries(this.querySelectorAll('input,select,textarea,button').filter(n => n.name || n.id).map(n => [n.name || n.id, n])); }
  get selectedOptions() { return this.querySelectorAll('option').filter(o => (o.attrs.value ?? o.textContent) === this.value); }
  getAttribute(key) { if (key.startsWith('data-')) return this.dataset[dataKey(key)] ?? null; return this.attrs[key] ?? null; }
  setAttribute(key, value) { this.attrs[key] = String(value); if (key.startsWith('data-')) this.dataset[dataKey(key)] = String(value); }
  removeAttribute(key) { delete this.attrs[key]; if (key.startsWith('data-')) delete this.dataset[dataKey(key)]; }
  hasAttribute(key) { return this.getAttribute(key) !== null; }
  append(...nodes) { nodes.forEach(node => { node.remove(); node.parentNode = this; this.childNodes.push(node); }); }
  replaceChildren(...nodes) { this.childNodes.forEach(node => { node.parentNode = null; }); this.childNodes = []; this._text = ''; this.append(...nodes); }
  remove() { if (this.parentNode) { const siblings = this.parentNode.childNodes; siblings.splice(siblings.indexOf(this), 1); this.parentNode = null; } }
  after(node) { assert(this.parentNode, 'after requires a connected anchor'); node.remove(); const siblings = this.parentNode.childNodes; siblings.splice(siblings.indexOf(this) + 1, 0, node); node.parentNode = this.parentNode; }
  before(node) { assert(this.parentNode, 'before requires a connected anchor'); node.remove(); const siblings = this.parentNode.childNodes; siblings.splice(siblings.indexOf(this), 0, node); node.parentNode = this.parentNode; }
  focus() { document.activeElement = this; } select() {} setSelectionRange(start) { this.selectionStart = start; }
  setCustomValidity(value) { this.validationMessage = value; } reportValidity() { return !this.validationMessage; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch('close', {}, false); }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  dispatch(type, extra = {}, bubbles = true) {
    const event = { type, target: this, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
    for (let node = this; node; node = bubbles ? node.parentNode : null) { node['on' + type]?.(event); for (const fn of node.listeners[type] || []) fn(event); if (event.stopped) break; }
    if (bubbles && !event.stopped) for (const fn of document.listeners[type] || []) fn(event);
    return event;
  }
  click() { if (!this.disabled) this.dispatch('click'); }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
    let test = selector.trim(); const checked = test.endsWith(':checked'); if (checked) test = test.slice(0, -8);
    const attributes = [...test.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)]; test = test.replace(/\[[^\]]*\]/g, '');
    if (attributes.some(([, key, value]) => !this.hasAttribute(key) || (value !== undefined && this.getAttribute(key) !== value))) return false;
    const id = test.match(/#([\w-]+)/); if (id && this.id !== id[1]) return false;
    const classes = [...test.matchAll(/\.([\w-]+)/g)].map(m => m[1]); if (classes.some(c => !this.classList.contains(c))) return false;
    const tag = test.match(/^[\w-]+/); return (!tag || this.tagName === tag[0].toUpperCase()) && (!checked || this.checked);
  }
  closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) {
    const alternatives = selector.split(',').map(s => s.trim()), result = [];
    const matchesChain = (node, chain) => { if (!node.matches(chain.at(-1))) return false; let ancestor = node.parentNode; for (let index = chain.length - 2; index >= 0; index--) { while (ancestor && ancestor !== this && !ancestor.matches(chain[index])) ancestor = ancestor.parentNode; if (!ancestor || ancestor === this && !ancestor.matches(chain[index])) return false; ancestor = ancestor.parentNode; } return true; };
    const walk = parent => parent.childNodes.forEach(node => { if (alternatives.some(s => matchesChain(node, s.split(/\s+(?![^\[]*\])/)))) result.push(node); walk(node); }); walk(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  set innerHTML(html) {
    this.replaceChildren(); this._html = String(html); const stack = [this];
    for (const match of this._html.matchAll(/<!--[\s\S]*?-->|<\/?([a-z][\w-]*)([^>]*)>|([^<]+)/gi)) {
      if (match[0].startsWith('<!--')) continue;
      if (match[3]) { stack.at(-1)._text += decode(match[3]); continue; }
      if (match[0].startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      const attrs = {}; for (const a of match[2].matchAll(/([^\s=]+)(?:="([^"]*)"|'([^']*)'|([^\s]+))?/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? a[4] ?? '');
      const node = new Node(match[1], attrs); stack.at(-1).append(node); if (!['INPUT', 'BR', 'HR', 'META', 'LINK', 'IMG', 'SOURCE', 'WBR', 'AREA', 'COL', 'EMBED', 'PARAM'].includes(node.tagName)) stack.push(node);
    }
    this.querySelectorAll('select').forEach(select => { const options = select.querySelectorAll('option'), selected = options.find(o => o.hasAttribute('selected')) || options[0]; select.value = selected?.attrs.value ?? selected?.textContent ?? ''; });
    this.querySelectorAll('textarea').forEach(node => { node.value = node.textContent; });
  }
  get innerHTML() { return this._html || ''; }
}
const html = fs.readFileSync(path.join(docs, 'mockup.html'), 'utf8');
const documentElement = new Node('html'), body = new Node('body'); documentElement.append(body);
document = { documentElement, body, activeElement: null, listeners: {}, getElementById: id => documentElement.querySelector('[id="' + id + '"]'), createElement: tag => new Node(tag), querySelector: selector => documentElement.querySelector(selector), querySelectorAll: selector => documentElement.querySelectorAll(selector), addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); } };
body.innerHTML = html.slice(html.indexOf('<div class="shell">'), html.indexOf('<script'));
const frozenNow = Date.parse('2026-10-12T10:00:00+08:00');
class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [frozenNow])); } static now() { return frozenNow; } }
let intervalCount = 0;
const context = { MutationObserver: class { observe() {} disconnect() {} }, matchMedia: () => ({ matches: false, addEventListener() {} }), document, console, Date: TestDate, Intl, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Blob, URL, setTimeout: () => 1, clearTimeout() {}, setInterval: () => ++intervalCount, clearInterval() {}, queueMicrotask, FormData: class { constructor(form) { this.form = form; } entries() { return this.form.querySelectorAll('input,select,textarea').filter(n => n.name && !n.disabled && (!(n.attrs.type === 'checkbox' || n.attrs.type === 'radio') || n.checked)).map(n => [n.name, n.value]); } }, confirm: () => { throw new Error('Unexpected native confirm in test'); } };
context.window = context; context.self = context; context.globalThis = context;
vm.createContext(context);
const loadedScripts = [];
for (const match of html.matchAll(/<script(?:\s+src="([^"]+)")?[^>]*>([\s\S]*?)<\/script>/g)) {
  if (match[1]) { const fullPath = path.resolve(docs, match[1]); assert(fullPath.startsWith(docs + path.sep), 'local scripts only'); vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: match[1] }); loadedScripts.push(match[1]); }
  else { const script = match[2], last = script.lastIndexOf('})();'); assert(last >= 0, 'expected main closure'); const exposed = 'window.integration={projectRecords,opportunities,workspace,projectPlan,showOpportunity,renderOpportunities,renderPortfolio,refreshProjectSignals,showProject,setRecordTab,view,dayPlanner,tasks,esc};'; vm.runInContext(script.slice(0, last) + exposed + script.slice(last), context, { filename: 'mockup-inline-test.js' }); }
}
const app = context.integration, $ = id => { const node = document.getElementById(id); assert(node, 'Missing actual element #' + id); return node; };
let count = 0; function test(name, fn) { fn(); count++; console.log('PASS ' + name); }
test('all real modules initialize in actual HTML order without missing-element fallbacks', () => {
  assert(loadedScripts.includes('vendor/jszip.min.js')); assert(loadedScripts.includes('day-planner.js')); assert(loadedScripts.includes('review-ui.js')); assert.equal(typeof context.JSZip, 'function'); assert.equal(intervalCount, 1);
  assert($('meeting-workspace')); assert($('register-rows').innerHTML.includes('PRJ-001')); assert($('client-rows').innerHTML.includes('Client A')); assert($('opportunity-rows').innerHTML.includes('Reporting automation'));
  assert.equal($('schedule').querySelectorAll('[data-planner-slot]').length, 96); assert.equal($('total').textContent, '0s');
});
test('navigation and grouped project tabs reveal the correct panels and remember category choice', () => {
  app.view('projects'); app.showProject(app.projectRecords[0].name);
  $('record-tab-documents').click(); assert.equal($('record-documents').hidden, false); assert.equal($('record-nav-reference').hidden, false); assert.equal($('record-overview').hidden, true);
  const delivery = document.querySelector('[data-record-category="delivery"]'), reference = document.querySelector('[data-record-category="reference"]'); delivery.click(); assert.equal($('record-overview').hidden, false); reference.click(); assert.equal($('record-documents').hidden, false);
  assert.equal($('record-tab-documents').getAttribute('aria-selected'), 'true'); assert.equal(reference.getAttribute('aria-pressed'), 'true'); assert.equal($('record-nav-delivery').hidden, true);
  reference.dispatch('keydown', { key: 'Home' }); assert.equal(document.activeElement, delivery); assert.equal($('record-overview').hidden, false);
  assert.equal(app.projectRecords[0].repositorySections.length, 8); assert.equal(app.projectRecords[0].agreedSections.length, 8);
});
test('global Add task remains connected to new day planner and saves real task metadata', () => {
  app.view('clients'); const original = app.tasks.length; $('new').click();
  $('dp-name').value = 'Integration follow-up'; $('dp-estimate').value = '20'; $('dp-priority').value = 'High'; $('dp-due').value = '2026-10-16'; $('dp-project').value = 'Client portal'; $('dp-task-form').dispatch('submit');
  assert.equal(app.tasks.length, original + 1); const task = app.tasks.at(-1); assert.equal(task.due, '2026-10-16'); assert.equal(task.priority, 'High'); assert.equal(task.estimateMinutes, 20); assert.equal(task.project, 'Client portal'); assert.equal($('modal').open, false); assert($('backlog').textContent.includes('Integration follow-up'));
});
test('opportunity details edit persists name, description and proposal and reaches register', () => {
  app.view('opportunities'); app.showOpportunity(1); $('opportunity-edit').click();
  $('edit-opportunity-name').value = 'Reporting automation revised'; $('edit-opportunity-summary').value = 'Revised scope <review>'; $('edit-opportunity-proposal').value = 'Proposal v2 shared; approval pending.';
  $('edit-opportunity-form').dispatch('submit'); const record = app.opportunities.find(o => o.id === 1);
  assert.equal(record.name, 'Reporting automation revised'); assert.equal(record.summary, 'Revised scope <review>'); assert.equal(record.proposal, 'Proposal v2 shared; approval pending.'); assert.equal($('modal').open, false); assert.equal($('opportunity-summary').textContent, record.summary); assert.equal($('opportunity-proposal').textContent, record.proposal);
  app.view('opportunities'); assert($('opportunity-rows').innerHTML.includes('Reporting automation revised')); app.showOpportunity(1); assert.equal($('opportunity-proposal').textContent, record.proposal);
});
test('actual action-list schedule handler creates one My day task with retained due/source', () => {
  const owner = app.workspace.ensure('opportunity:1'), action = owner.actionItems.find(a => a.due && a.status !== 'Done'); assert(action);
  const before = app.tasks.length, button = $('opportunity-next-actions').querySelector('[data-action-schedule="' + action.id + '"]'); assert(button); button.click();
  assert.equal(app.tasks.length, before + 1); const task = app.tasks.at(-1); assert.equal(task.actionItemId, action.id); assert.equal(task.due, action.due); assert.equal(task.opportunityId, 1); assert.equal(task.name, action.title); assert.equal(task.project, owner.name);
  button.click(); assert.equal(app.tasks.length, before + 1); assert($('toast').textContent.includes('already'));
});
test('saved work refreshes project attention and escapes task names in summary markup', () => {
  app.view('projects'); const project = app.projectRecords[0]; app.showProject(project.name); assert(project.plan?.some(phase=>phase.children.length));
  const work = project.plan.find(phase=>phase.children.length).children[0]; work.name = '<img src=x onerror="bad()">'; work.status = 'Blocked'; work.team = 'Hanoi'; work.end = '2026-10-01'; work.children = [];
  app.refreshProjectSignals(project); const html = $('portfolio-rows').innerHTML;
  assert(html.includes('&lt;img src=x onerror=&quot;bad()&quot;&gt;')); assert(!html.includes('<img src=x')); assert.equal($('portfolio-rows').querySelectorAll('img').length, 0); assert($('overview-signals').textContent.includes('blocked work item'));
  work.status = 'Done'; app.refreshProjectSignals(project); assert(!$('overview-signals').textContent.includes('1 blocked work item')); assert(project.hn[0] >= 1);
});
test('theme changes use the real Settings handler and retain global task access', () => {
  app.view('settings'); $('review-theme').value = 'dark'; $('review-theme').dispatch('change'); assert.equal(document.documentElement.dataset.theme, 'dark'); assert.equal($('toast').textContent, 'Dark theme selected.');
  app.view('projects'); assert.equal(document.documentElement.dataset.theme, 'dark'); assert.equal($('new').textContent, '+ Add task');
  app.view('settings'); $('review-theme').value = 'light'; $('review-theme').dispatch('change'); assert.equal(document.documentElement.dataset.theme, 'light');
});
console.log('\n' + count + ' actual-app integration checks passed; ' + loadedScripts.length + ' local scripts loaded. Inert DOM only: no browser, visual, layout or accessibility conformance claims.');
