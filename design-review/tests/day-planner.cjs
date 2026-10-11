'use strict';
const assert = require('node:assert/strict');
const core = require('../../docs/day-planner.js');
const ms = value => Date.parse(value);
const monday = ms('2026-10-12T08:00:00+08:00');
const fresh = () => core.createModel({ now: monday, sample: false });
const add = (model, name, minutes = 30, extra = {}) => {
  const result = core.addTask(model, { name, estimateMinutes: minutes, priority: 'Normal', ...extra }, monday);
  assert.equal(result.ok, true, JSON.stringify(result.errors)); return result.task;
};
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS ' + name); }
const session = (id, start, end, extra = {}) => ({ itemId: id, name: id, kind: 'task', project: 'General', start: ms(start), end: end === null ? null : ms(end), ...extra });
test('task fields validate and preserve priority, deadline, project and estimate', () => {
  const model = fresh(), task = add(model, ' Send questions ', 20, { priority: 'High', due: '2026-10-15', project: 'Client portal' });
  assert.equal(task.name, 'Send questions'); assert.equal(task.estimateMinutes, 20); assert.equal(task.duration, '20m'); assert.equal(core.slotsFor(task), 2);
  assert.equal(task.priority, 'High'); assert.equal(task.due, '2026-10-15'); assert.equal(task.project, 'Client portal');
  for (const value of [0, -1, 1.5, NaN, Infinity, 721, '']) assert.equal(core.addTask(model, { name: 'Bad', estimateMinutes: value }, monday).ok, false);
  assert.equal(core.addTask(model, { name: ' ', estimateMinutes: 30 }, monday).ok, false);
  assert.equal(core.addTask(model, { name: 'Bad date', estimateMinutes: 30, due: '2026-02-30' }, monday).ok, false);
  assert.equal(core.addTask(model, { name: 'Bad priority', estimateMinutes: 30, priority: 'Urgently' }, monday).ok, false);
  assert.equal(model.tasks.length, 1, 'invalid submissions must not create tasks');
});
test('moving checks the full task and meeting duration, including final partial estimate block', () => {
  const model = fresh(), t = add(model, 'Work', 45);
  model.meetings.push({ id: 'm', name: 'Meeting', kind: 'client', date: model.day, slot: 6, estimateMinutes: 30, length: 2 });
  assert.equal(core.moveItem(model, t.id, 4).ok, false); assert.equal(t.slot, null);
  assert.equal(core.moveItem(model, t.id, 3).ok, true);
  assert.equal(core.moveItem(model, 'm', 5).ok, false, 'meeting tail must not overlap task');
  assert.equal(core.moveItem(model, 'm', 8).ok, true);
  assert.equal(core.moveItem(model, t.id, 46).ok, false); assert.equal(t.slot, 3);
});
test('scheduled tasks swap starts, preserve estimates and deadlines, and pin both', () => {
  const model = fresh(), a = add(model, 'Long', 45, { due: '2026-10-15' }), b = add(model, 'Short', 15);
  a.slot = 3; b.slot = 12;
  const result = core.moveItem(model, a.id, 12);
  assert.equal(result.ok, true); assert.equal(result.swapped, b.id); assert.equal(a.slot, 12); assert.equal(b.slot, 3);
  assert.equal(a.pinned, true); assert.equal(b.pinned, true); assert.equal(a.estimateMinutes, 45); assert.equal(a.due, '2026-10-15');
});
test('unequal-duration swap rejects third-item conflict without partial mutation', () => {
  const model = fresh(), a = add(model, 'Long', 60), b = add(model, 'Short', 15), third = add(model, 'Third', 30);
  a.slot = 3; b.slot = 12; third.slot = 13;
  assert.equal(core.moveItem(model, a.id, 12).ok, false); assert.deepEqual([a.slot, b.slot, third.slot], [3, 12, 13]);
});
test('overlap with multiple tasks rejects and unscheduled one-task swap returns target to backlog', () => {
  const model = fresh(), a = add(model, 'Source', 30), b = add(model, 'B', 15), c = add(model, 'C', 15); b.slot = 10; c.slot = 11;
  assert.equal(core.moveItem(model, a.id, 10).ok, false); c.slot = 15;
  assert.equal(core.moveItem(model, a.id, 10).ok, true); assert.equal(a.slot, 10); assert.equal(b.slot, null); assert.equal(b.pinned, false);
});
test('empty placement and unscheduling are exact rather than first-free-slot moves', () => {
  const model = fresh(), a = add(model, 'A'); assert.equal(core.moveItem(model, a.id, 17).ok, true); assert.equal(a.slot, 17);
  assert.equal(core.moveItem(model, a.id, null).ok, true); assert.equal(a.slot, null); assert.equal(a.pinned, false);
});
test('replan uses full intervals, priority/deadline order and preserves meetings/pinned/running', () => {
  const model = fresh(), later = add(model, 'Later', 30, { due: '2026-10-20' }), urgent = add(model, 'Urgent', 45, { priority: 'High' }), earlier = add(model, 'Earlier', 30, { due: '2026-10-14' }), pinned = add(model, 'Pinned', 30), running = add(model, 'Running', 15);
  pinned.slot = 4; pinned.pinned = true; running.slot = 12; core.startItem(model, running.id, monday);
  model.meetings.push({ id: 'm', kind: 'client', name: 'Call', date: model.day, slot: 8, estimateMinutes: 30 });
  core.replan(model, { now: monday });
  assert.equal(pinned.slot, 4); assert.equal(running.slot, 12); assert.equal(model.meetings[0].slot, 8);
  assert.equal(urgent.slot, 13, 'highest priority gets the first full 45-minute gap');
  assert.equal(earlier.slot, 6, 'shorter tasks may fill earlier gaps that cannot hold urgent work'); assert.equal(later.slot, 10);
  const all = core.allItems(model).filter(t => t.slot !== null);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.equal(core.overlaps(all[i].slot, all[i].slot + core.slotsFor(all[i]), all[j].slot, all[j].slot + core.slotsFor(all[j])), false);
});
test('equal-size tasks are allocated by marked priority then earliest deadline', () => {
  const model = fresh(), later = add(model, 'Later', 30, { due: '2026-10-20' }), earlier = add(model, 'Earlier', 30, { due: '2026-10-14' }), urgent = add(model, 'Urgent', 30, { priority: 'High' });
  core.replan(model, { now: monday }); assert.equal(urgent.slot, 3); assert.equal(earlier.slot, 5); assert.equal(later.slot, 7);
});
test('same-day replanning starts at the next quarter-hour and never fills elapsed time', () => {
  const model = fresh(), first = add(model, 'First', 30), second = add(model, 'Second', 30), pinned = add(model, 'Pinned', 30), running = add(model, 'Running', 30);
  pinned.slot = 8; pinned.pinned = true; running.slot = 24; core.startItem(model, running.id, ms('2026-10-12T14:00:00+08:00'));
  core.replan(model, { now: ms('2026-10-12T16:00:00+08:00') }); assert.equal(first.slot, 32); assert.equal(second.slot, 34); assert.equal(pinned.slot, 8); assert.equal(running.slot, 24);
  core.replan(model, { now: ms('2026-10-12T16:00:01+08:00') }); assert.equal(first.slot, 33, 'seconds after the boundary round forward');
  const result = core.replan(model, { now: ms('2026-10-12T18:00:00+08:00') }); assert.equal(first.slot, null); assert.equal(second.slot, null); assert.equal(result.overflow.length, 2); assert.equal(pinned.slot, 8); assert.equal(running.slot, 24);
  core.replan(model, { now: ms('2026-10-12T18:00:00+08:00'), allowOvertime: true }); assert.equal(first.slot, 40); assert.equal(second.slot, 42);
});
test('overflow stays unscheduled; overtime requires explicit choice; weekends have no normal capacity', () => {
  const model = fresh(), a = add(model, 'Full day', 600), b = add(model, 'Another', 120);
  const normal = core.replan(model, { now: monday }); assert.equal(a.slot, null); assert(normal.overflow.includes(a)); assert(b.slot >= 3);
  const overtime = core.replan(model, { allowOvertime: true, now: monday }); assert.equal(overtime.overflow.length, 0); assert.equal(a.slot, 0); assert.equal(b.slot, 40);
  model.day = '2026-10-11'; assert.equal(core.replan(model, { now: monday }).overflow.length, 2); assert.equal(a.slot, null); assert.equal(b.slot, null);
});
test('timer pause/resume accumulates only its task and conflict never silently switches tasks', () => {
  const model = fresh(), a = add(model, 'A'), b = add(model, 'B');
  core.startItem(model, a.id, monday); core.pauseItem(model, a.id, monday + 60000);
  core.startItem(model, a.id, monday + 120000);
  assert.equal(core.elapsedFor(model, a.id, monday + 180000), 120000);
  assert.equal(core.startItem(model, b.id, monday + 180000).ok, false); assert.equal(model.sessions.length, 2);
  assert.equal(core.startItem(model, b.id, monday + 180000, { pauseCurrent: true }).ok, true);
  assert.equal(core.elapsedFor(model, a.id, monday + 240000), 120000); assert.equal(core.elapsedFor(model, b.id, monday + 240000), 60000);
  assert.equal(model.currentTaskId, b.id); assert.equal(a.status, 'Paused');
});
test('finish keeps sessions and completed state while releasing slot; completed task cannot restart/replan', () => {
  const model = fresh(), a = add(model, 'A'); a.slot = 3; a.pinned = true; core.startItem(model, a.id, monday);
  assert.equal(core.finishTask(model, a.id, monday + 60000), true); assert.equal(a.status, 'Completed'); assert.equal(a.slot, null); assert.equal(a.pinned, false);
  assert.equal(core.elapsedFor(model, a.id, monday + 120000), 60000); assert.equal(core.startItem(model, a.id, monday + 120000).ok, false);
  core.replan(model, { now: monday }); assert.equal(a.slot, null); assert.equal(model.sessions.length, 1);
});
test('meeting and task timers remain separate and total report deduplicates their overlap', () => {
  const model = fresh(), a = add(model, 'A'); model.meetings.push({ id: 'm', name: 'Call', kind: 'client', project: 'Client A', date: model.day, slot: 4, estimateMinutes: 30 });
  const nine = ms('2026-10-12T09:00:00+08:00'); core.startItem(model, a.id, nine); core.startItem(model, 'm', nine + 30 * 60000); core.pauseItem(model, a.id, nine + 60 * 60000); core.pauseItem(model, 'm', nine + 90 * 60000);
  const result = core.computeReport(model.sessions, 'This week', nine + 100 * 60000); assert.equal(result.total, 90 * 60000); assert.equal(result.normal, result.total); assert.equal(result.activities.length, 2); assert.equal(result.activities.reduce((s, a) => s + a.milliseconds, 0), 120 * 60000);
});
test('Singapore normal hours are weekdays 08:45–18:00 including exact boundaries', () => {
  const data = [session('long', '2026-10-12T08:00:00+08:00', '2026-10-12T20:00:00+08:00')];
  const report = core.computeReport(data, 'All time', ms('2026-10-13T00:00:00+08:00'));
  assert.equal(report.total, 12 * 3600000); assert.equal(report.normal, (9 * 60 + 15) * 60000); assert.equal(report.overtime, (2 * 60 + 45) * 60000);
});
test('weekend is wholly overtime and Friday overnight is split across local days', () => {
  const data = [session('cross', '2026-10-16T17:00:00+08:00', '2026-10-17T09:00:00+08:00'), session('sunday', '2026-10-18T09:00:00+08:00', '2026-10-18T10:00:00+08:00')];
  const report = core.computeReport(data, 'This week', ms('2026-10-18T12:00:00+08:00'));
  assert.equal(report.total, 17 * 3600000); assert.equal(report.normal, 3600000); assert.equal(report.overtime, 16 * 3600000);
});
test('week/month/today clipping handles open sessions and excludes future time', () => {
  const now = ms('2026-11-02T01:00:00+08:00');
  const data = [session('cross', '2026-10-31T23:00:00+08:00', null), session('future', '2026-11-03T09:00:00+08:00', '2026-11-03T10:00:00+08:00')];
  assert.equal(core.computeReport(data, 'All time', now).total, 26 * 3600000);
  assert.equal(core.computeReport(data, 'This month', now).total, 25 * 3600000);
  assert.equal(core.computeReport(data, 'This week', now).total, 3600000);
  assert.equal(core.computeReport(data, 'Today', now).total, 3600000);
});
test('reports merge nested/adjacent overlaps without double count and empty state is zero', () => {
  assert.deepEqual(core.mergeIntervals([[0, 100], [10, 30], [90, 200], [200, 250], [300, 350], [9, 9]]), [[0, 250], [300, 350]]);
  const report = core.computeReport([], 'This month', monday); assert.equal(report.total, 0); assert.equal(report.normal, 0); assert.equal(report.overtime, 0); assert.deepEqual(report.activities, []);
});
test('timer formatting does not wrap after 24 hours', () => { assert.equal(core.clockText(25 * 3600000 + 2000), '25:00:02'); assert.equal(core.slotLabel(48), '20:00'); });

// Small inert DOM to exercise generated forms/handlers. It performs no rendering,
// loads no URLs, and cannot establish pixel, browser, accessibility or layout fidelity.
let inertFocus = null;
const decode = text => text.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
class Element {
  constructor(tag = 'div', attributes = {}) { this.tagName = tag; this.attributes = { ...attributes }; this.childNodes = []; this.parentNode = null; this.dataset = {}; this.style = {}; this.textContent = ''; this.value = attributes.value || ''; this.hidden = 'hidden' in attributes; this.open = false; this.offsetTop = 0; this.offsetHeight = 32; this.classList = { contains: value => this.className.split(' ').includes(value) }; Object.keys(attributes).filter(k => k.startsWith('data-')).forEach(k => { this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attributes[k]; }); }
  get id() { return this.attributes.id; } set id(value) { this.attributes.id = value; }
  get className() { return this.attributes.class || ''; } set className(value) { this.attributes.class = value; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  append(...nodes) { nodes.forEach(node => { node.parentNode = this; this.childNodes.push(node); }); }
  replaceChildren(...nodes) { this.childNodes.forEach(n => { n.parentNode = null; }); this.childNodes = []; this.append(...nodes); }
  focus() { this.focused = true; inertFocus = this; } close() { this.open = false; }
  matches(selector) {
    const match = selector.match(/^([\w-]+)?(?:\.([\w-]+))?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/);
    if (!match) return false;
    const value = match[3]?.startsWith('data-') ? this.dataset[match[3].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : this.attributes[match[3]];
    return (!match[1] || this.tagName === match[1]) && (!match[2] || this.className.split(' ').includes(match[2])) && (!match[3] || (value !== undefined && (match[4] === undefined || value === match[4])));
  }
  closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) { const result = []; const walk = node => node.childNodes.forEach(child => { if (child.matches(selector)) result.push(child); walk(child); }); walk(this); return result; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  set innerHTML(html) {
    this.replaceChildren(); this.html = html; const stack = [this];
    for (const match of html.matchAll(/<\/?([a-z][\w-]*)([^>]*)>|([^<]+)/gi)) {
      if (match[3]) { stack.at(-1).textContent += decode(match[3]); continue; }
      if (match[0].startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      const attrs = {}; for (const attribute of match[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) attrs[attribute[1]] = decode(attribute[2] || '');
      const node = new Element(match[1], attrs); stack.at(-1).append(node); if (!['input', 'br', 'hr'].includes(match[1])) stack.push(node);
    }
    this.querySelectorAll('select').forEach(select => { const options = select.querySelectorAll('option'), selected = options.find(o => 'selected' in o.attributes) || options[0]; select.value = selected?.attributes.value ?? selected?.textContent ?? ''; });
  }
  get innerHTML() { return this.html || ''; }
}
test('inert DOM smoke: initialization, task form validation, exact Move, sessions, reports, completed state and action bridge', () => {
  const root = new Element(), ids = ['schedule', 'backlog', 'backlog-count', 'timer-name', 'timer-value', 'pause', 'finish', 'simulate', 'replan', 'new', 'period', 'total', 'normal', 'overtime', 'modal'];
  ids.forEach(id => root.append(new Element(id === 'period' ? 'select' : 'div', { id })));
  const reports = new Element('div', { id: 'reports', class: 'view hidden' }); reports.append(new Element('section', { class: 'panel' })); root.append(reports);
  const get = id => root.querySelector('[id="' + id + '"]'), document = { getElementById: get, createElement: tag => new Element(tag), get activeElement() { return inertFocus; } };
  get('period').value = 'This week'; let time = monday, toast = '', modalText = '';
  const api = globalThis.createDayPlanner({ document, now: () => time, setInterval: null, model: fresh(), projectOptions: () => ['Client portal'], toast: text => { toast = text; }, modal: html => { modalText = html; get('modal').innerHTML = html; get('modal').open = true; } });
  assert.equal(get('schedule').querySelectorAll('[data-planner-slot]').length, 48); assert.equal(get('total').textContent, '0s');
  get('new').onclick(); assert(modalText.includes('Project (optional)')); get('dp-name').value = 'Follow up'; get('dp-estimate').value = '0'; get('dp-task-form').onsubmit({ preventDefault() {} }); assert.equal(api.tasks.length, 0); assert(get('dp-estimate-error').textContent.includes('whole number'));
  get('dp-estimate').value = '20'; get('dp-priority').value = 'High'; get('dp-due').value = '2026-10-15'; get('dp-project').value = 'Client portal'; get('dp-task-form').onsubmit({ preventDefault() {} }); assert.equal(api.tasks.length, 1); assert.equal(api.tasks[0].priority, 'High'); assert.equal(get('modal').open, false);
  const card = get('backlog').querySelector('[data-planner-item]'); card.querySelectorAll('button').find(b => b.textContent === 'Move').onclick(); get('dp-move-slot').value = '17'; get('dp-move-form').onsubmit({ preventDefault() {} }); assert.equal(api.tasks[0].slot, 17); assert.equal(get('modal').open, false);
  assert.equal(inertFocus.dataset.plannerAction, 'move', 'Move restores focus to the corresponding newly rendered control');
  let scheduled = get('schedule').querySelector('[data-planner-item]'); scheduled.querySelector('[data-planner-action="unpin"]').onclick(); assert.equal(api.tasks[0].pinned, false); assert.equal(inertFocus.dataset.plannerAction, 'timer', 'removed Unpin returns focus to a remaining task control');
  scheduled = get('schedule').querySelector('[data-planner-item]'); const startButton = scheduled.querySelector('[data-planner-action="timer"]'); startButton.focus(); startButton.onclick(); assert.equal(inertFocus.dataset.plannerAction, 'timer'); assert.notEqual(inertFocus, startButton, 'Start focuses the replacement button after rendering'); assert.equal(inertFocus.textContent, 'Pause');
  inertFocus.onclick(); assert.equal(inertFocus.dataset.plannerAction, 'timer'); assert.equal(inertFocus.textContent, 'Resume', 'Pause focuses the replacement Resume button'); inertFocus.onclick();
  api.start(api.tasks[0].id); time += 60000; api.tick(); assert.equal(get('timer-value').textContent, '00:01:00'); get('pause').onclick(); assert.equal(get('pause').textContent, 'Resume'); time += 60000; get('pause').onclick(); time += 60000; get('finish').onclick(); assert.equal(api.tasks[0].status, 'Completed'); assert.equal(get('timer-value').textContent, '00:02:00'); assert.equal(get('finish').disabled, true); assert(get('backlog').querySelector('summary').textContent.includes('Completed'));
  api.addAction('opportunity:3', { id: 'action-3', title: 'Call contact', due: '2026-10-15' }, { id: 3, name: 'New lead' }); assert.equal(api.tasks[1].due, '2026-10-15'); assert.equal(api.tasks[1].opportunityId, 3); api.addAction('opportunity:3', { id: 'action-3', title: 'Call contact' }, { id: 3, name: 'New lead' }); assert.equal(api.tasks.length, 2); assert(toast.includes('already'));
  get('period').value = 'All time'; get('period').onchange(); assert.equal(get('total').textContent, '0h 02m'); assert.equal(get('overtime').textContent, '0h 02m'); assert.equal(get('normal').textContent, '0s'); assert(get('day-time-breakdown').innerHTML.includes('Follow up')); assert(get('day-time-breakdown').innerHTML.includes('class="register-table"')); assert.equal(get('day-time-breakdown').querySelectorAll('[data-label]').length, 4);
  time = ms('2026-10-12T14:20:00+08:00'); api.meetings.push({ id: 'late-meeting', name: 'Late alert call', kind: 'client', date: api.model.day, slot: 24, estimateMinutes: 60 }); api.start(api.tasks[1].id); api.tick(); assert.equal(get('modal').open, true); assert(modalText.includes('Late alert call'), 'a delayed tick warns during the whole meeting, not only its first minute'); get('dp-continue-overlap').onclick(); time += 60000; api.tick(); assert.equal(get('modal').open, false, 'the overlap warning is shown once');
  time = ms('2026-10-12T16:00:00+08:00'); const late = add(api.model, 'Late work', 30); api.replan({ allowOvertime: false }); assert(late.slot >= 32, 'public API passes current time into replan'); api.destroy();
});
console.log('\n' + count + ' day planner checks passed. Pure model and inert DOM checks; no browser rendering asserted.');
