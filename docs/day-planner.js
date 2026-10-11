/* Session-only personal planning and time records. Singapore time; no network calls. */
(function (root) {
  'use strict';
  const QUARTER = 15, DAY_START = 480, DAY_END = 1200, SLOT_COUNT = 48;
  const OFFSET = 8 * 60 * 60 * 1000, DAY = 86400000;
  const priorities = ['High', 'Normal', 'Low'];
  const dateKey = value => new Date(Number(value) + OFFSET).toISOString().slice(0, 10);
  const dayStart = date => Date.parse(date + 'T00:00:00+08:00');
  const shiftDate = (date, days) => dateKey(dayStart(date) + days * DAY);
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(dayStart(value)) && dateKey(dayStart(value)) === value;
  const timeLabel = minutes => String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
  const slotLabel = slot => timeLabel(DAY_START + slot * QUARTER);
  const slotsFor = item => Math.ceil((Number(item.estimateMinutes || item.length * QUARTER) + (item.scheduledStart ? new Date(item.scheduledStart).getUTCMinutes() % QUARTER : 0)) / QUARTER);
  const overlaps = (start, end, otherStart, otherEnd) => start < otherEnd && end > otherStart;
  const itemEnd = item => item.slot + slotsFor(item);
  const isMeeting = item => item.kind === 'client' || item.kind === 'internal';
  const allItems = model => [...model.tasks.filter(t => t.status !== 'Completed' && (!t.date || t.date===model.day)), ...model.meetings.filter(m => m.date === model.day)];
  const findItem = (model, id) => [...model.tasks, ...model.meetings].find(item => String(item.id) === String(id));
  const openSession = (model, id) => model.sessions.find(s => String(s.itemId) === String(id) && s.end === null);
  function createModel({ now = Date.now(), sample = true } = {}) {
    const day = dateKey(now);
    const task = (id, name, project, minutes, slot, priority = 'Normal', due = '') => ({ id, name, project, estimateMinutes: minutes, duration: minutes + 'm', slot, priority, due, pinned: false, status: 'Ready', createdAt: now });
    return {
      day, serial: 100, sessions: [], currentTaskId: null,
      tasks: sample ? [task(1, 'Follow up on sample data', 'Client portal', 15, null, 'High', shiftDate(day, -3)), task(2, 'Review API progress', 'Client portal', 45, 3), task(3, 'Prepare proposal', 'General', 60, 28), task(4, 'Confirm export scope', 'Reporting platform', 20, null), task(5, 'Review weekly team plans', 'General', 30, null)] : [],
      meetings: sample ? [{ id: 'meeting-hanoi', name: 'Hanoi project check-in', kind: 'internal', project: 'General', slot: 12, length: 2, estimateMinutes: 30, date: day }, { id: 'meeting-client', name: 'Client walkthrough', kind: 'client', project: 'Automation rollout', slot: 24, length: 4, estimateMinutes: 60, date: day }] : []
    };
  }
  function addTask(model, fields, now = Date.now()) {
    const name = String(fields.name || '').trim(), minutes = Number(fields.estimateMinutes), due = String(fields.due || ''), priority = fields.priority || 'Normal';
    const errors = {};
    if (!name || name.length > 200) errors.name = 'Enter a task name of up to 200 characters.';
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 720 || !Number.isInteger(minutes)) errors.estimate = 'Enter a whole number from 1 to 720 minutes.';
    if (due && !validDate(due)) errors.due = 'Choose a valid deadline.';
    if (!priorities.includes(priority)) errors.priority = 'Choose High, Normal or Low priority.';
    if (Object.keys(errors).length) return { ok: false, errors };
    const task = { id: 'task-' + (++model.serial), name, project: String(fields.project || 'General'), estimateMinutes: minutes, duration: minutes + 'm', due, priority, date:model.day, slot: null, pinned: false, status: 'Ready', createdAt: now };
    model.tasks.push(task);
    return { ok: true, task };
  }
  function canPlace(model, item, slot, excluded = []) {
    if (!Number.isInteger(slot) || slot < 0 || slot + slotsFor(item) > SLOT_COUNT) return false;
    const ids = new Set([String(item.id), ...excluded.map(String)]);
    return !allItems(model).some(other => !ids.has(String(other.id)) && other.slot !== null && overlaps(slot, slot + slotsFor(item), other.slot, itemEnd(other)));
  }
  function moveItem(model, id, slot) {
    const item = findItem(model, id);
    if (!item || item.status === 'Completed') return { ok: false, message: 'Choose an unfinished task or meeting.' };
    if (slot === null && !isMeeting(item)) { item.slot = null; item.pinned = false; return { ok: true, message: item.name + ' returned to Unscheduled tasks.' }; }
    if (!Number.isInteger(slot) || slot < 0 || slot + slotsFor(item) > SLOT_COUNT) return { ok: false, message: 'The full duration must fit between 08:00 and 20:00.' };
    if (slot === item.slot) return { ok: true, message: 'The time is unchanged.' };
    const conflicts = allItems(model).filter(other => other !== item && other.slot !== null && overlaps(slot, slot + slotsFor(item), other.slot, itemEnd(other)));
    if (!conflicts.length) { item.slot = slot; if (isMeeting(item)) item.scheduledStart = new Date(dayStart(item.date) + (DAY_START + slot * QUARTER) * 60000).toISOString(); if (!isMeeting(item)) item.pinned = true; return { ok: true, message: item.name + ' moved to ' + slotLabel(slot) + '. ' + (isMeeting(item) ? 'Replan will preserve its time.' : 'This time is pinned; the deadline is unchanged.') }; }
    if (isMeeting(item) || conflicts.some(isMeeting)) return { ok: false, message: 'This overlaps a meeting. Move the meeting itself or choose enough open time for the full duration.' };
    if (conflicts.length !== 1) return { ok: false, message: 'The full task overlaps more than one item. Choose another time.' };
    const other = conflicts[0], oldSlot = item.slot, nextSlot = other.slot;
    if (!canPlace(model, item, nextSlot, [other.id]) || (oldSlot !== null && (!canPlace(model, other, oldSlot, [item.id]) || overlaps(nextSlot, nextSlot + slotsFor(item), oldSlot, oldSlot + slotsFor(other))))) return { ok: false, message: 'These tasks cannot swap: their full durations would overlap another item. Choose another time.' };
    item.slot = nextSlot; item.pinned = true; other.slot = oldSlot; other.pinned = oldSlot !== null;
    return { ok: true, swapped: other.id, message: item.name + ' swapped with ' + other.name + '. ' + (oldSlot === null ? other.name + ' returned to Unscheduled tasks.' : 'Both times are pinned.') + ' Deadlines unchanged.' };
  }
  function replan(model, { allowOvertime = false, now = Date.now() } = {}) {
    const dayOfWeek = new Date(dayStart(model.day) + OFFSET).getUTCDay();
    const normalDay = dayOfWeek > 0 && dayOfWeek < 6;
    const firstAvailable = model.day === dateKey(now) ? Math.ceil(((now - dayStart(model.day)) / 60000 - DAY_START) / QUARTER) : 0;
    const start = Math.max(allowOvertime ? 0 : 3, firstAvailable), end = allowOvertime ? SLOT_COUNT : 40;
    const movable = model.tasks.filter(t => (!t.date || t.date===model.day) && t.status !== 'Completed' && !t.pinned && !openSession(model, t.id));
    movable.forEach(t => { t.slot = null; });
    movable.sort((a, b) => priorities.indexOf(a.priority) - priorities.indexOf(b.priority) || (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt);
    const overflow = [];
    movable.forEach(t => {
      let slot = -1;
      if (allowOvertime || normalDay) for (let i = start; i + slotsFor(t) <= end; i++) if (canPlace(model, t, i)) { slot = i; break; }
      if (slot < 0) overflow.push(t); else t.slot = slot;
    });
    return { placed: movable.length - overflow.length, overflow, message: (movable.length - overflow.length) + ' tasks arranged. Meetings, pinned times and running tasks kept in place. ' + (overflow.length ? overflow.length + ' did not fit and remain unscheduled. Choose overtime or keep them for another day.' : 'Every planned task has space for its full estimate.') };
  }
  function startItem(model, id, now = Date.now(), { pauseCurrent = false } = {}) {
    const item = findItem(model, id);
    if (!item || item.status === 'Completed') return { ok: false, message: 'Choose an unfinished task or meeting.' };
    if (openSession(model, id)) return { ok: true, message: 'Already running.' };
    const runningTask = model.sessions.find(s => s.kind === 'task' && s.end === null);
    if (!isMeeting(item) && runningTask && String(runningTask.itemId) !== String(id)) {
      if (!pauseCurrent) return { ok: false, conflict: runningTask.itemId, message: 'Another task is running. Pause it before starting this task.' };
      pauseItem(model, runningTask.itemId, now);
    }
    model.sessions.push({ id: 'session-' + (++model.serial), itemId: item.id, kind: isMeeting(item) ? 'meeting' : 'task', name: item.name, project: item.project || 'General', start: now, end: null });
    if (!isMeeting(item)) { item.status = 'In progress'; model.currentTaskId = item.id; }
    return { ok: true, message: (isMeeting(item) ? 'Meeting' : 'Task') + ' timer started.' };
  }
  function pauseItem(model, id, now = Date.now()) {
    const session = openSession(model, id), item = findItem(model, id);
    if (session) session.end = Math.max(session.start, now);
    if (item && !isMeeting(item) && item.status !== 'Completed') item.status = 'Paused';
    return Boolean(session);
  }
  function finishTask(model, id, now = Date.now()) {
    const task = model.tasks.find(t => String(t.id) === String(id));
    if (!task) return false;
    pauseItem(model, id, now); task.status = 'Completed'; task.completedAt = now; task.slot = null; task.pinned = false;
    return true;
  }
  function elapsedFor(model, id, now = Date.now()) { return model.sessions.filter(s => String(s.itemId) === String(id)).reduce((total, s) => total + Math.max(0, (s.end === null ? now : s.end) - s.start), 0); }
  function mergeIntervals(intervals) {
    const sorted = intervals.filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start).sort((a, b) => a[0] - b[0]), merged = [];
    sorted.forEach(([start, end]) => { const last = merged.at(-1); if (last && start <= last[1]) last[1] = Math.max(last[1], end); else merged.push([start, end]); });
    return merged;
  }
  function periodBounds(period, now) {
    const day = dayStart(dateKey(now)), weekday = new Date(day + OFFSET).getUTCDay();
    if (/month/i.test(period)) { const key = dateKey(now), start = dayStart(key.slice(0, 7) + '-01'), d = new Date(start + OFFSET); d.setUTCMonth(d.getUTCMonth() + 1); return [start, d.getTime() - OFFSET]; }
    if (/week/i.test(period)) { const start = day - ((weekday + 6) % 7) * DAY; return [start, start + 7 * DAY]; }
    if (/today|day/i.test(period)) return [day, day + DAY];
    return [-Infinity, Infinity];
  }
  function normalMilliseconds(intervals) {
    let total = 0;
    intervals.forEach(([start, end]) => {
      for (let day = dayStart(dateKey(start)); day < end; day += DAY) {
        const weekday = new Date(day + OFFSET).getUTCDay();
        if (weekday && weekday !== 6) total += Math.max(0, Math.min(end, day + 18 * 3600000) - Math.max(start, day + (8 * 60 + 45) * 60000));
      }
    });
    return total;
  }
  // Derived report entries are never added to the persisted timer session list.
  function reportEntries(model) {
    const corrected = new Set((model.meetings || []).filter(m => Number.isFinite(Date.parse(m.actualStart)) && Date.parse(m.actualEnd) >= Date.parse(m.actualStart)).map(m => String(m.id)));
    const entries = (model.sessions || []).filter(s => !corrected.has(String(s.itemId))).map(s => ({ ...s, source: 'Actual timer' }));
    const timed = new Set((model.sessions || []).map(s => String(s.itemId)));
    (model.meetings || []).forEach(m => {
      const actual = corrected.has(String(m.id));
      if (!actual && timed.has(String(m.id))) return;
      const start = actual ? Date.parse(m.actualStart) : (m.scheduledStart ? Date.parse(m.scheduledStart) : validDate(m.date) && m.slot !== null ? dayStart(m.date) + (DAY_START + m.slot * QUARTER) * 60000 : NaN);
      const end = actual ? Date.parse(m.actualEnd) : start + Number(m.estimateMinutes || m.length * QUARTER) * 60000;
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) entries.push({ itemId: m.id, name: m.name, project: m.project || 'General', kind: 'meeting', start, end, source: actual ? 'Actual correction' : 'Scheduled estimate' });
    });
    return entries;
  }
  function upsertMeeting(model, record, project = 'General') {
    const existing = model.meetings.find(m => String(m.meetingId || m.id) === String(record.id));
    if (!validDate(record.date) || !/^\d{2}:\d{2}$/.test(record.time || '')) {
      if (existing && !(model.sessions || []).some(s => String(s.itemId) === String(existing.id))) model.meetings.splice(model.meetings.indexOf(existing), 1);
      return null;
    }
    const [hour, minute] = record.time.split(':').map(Number), start = dayStart(record.date) + (hour * 60 + minute) * 60000, duration = Number(record.durationMinutes || 60);
    if (hour > 23 || minute > 59 || !Number.isInteger(duration) || duration < 1 || duration > 1440) return null;
    const values = { meetingId: record.id, name: record.title || 'Untitled meeting', kind: record.kind || existing?.kind || 'client', project, date: record.date, slot: Math.floor((hour * 60 + minute - DAY_START) / QUARTER), scheduledStart: new Date(start).toISOString(), estimateMinutes: duration, length: Math.ceil(duration / QUARTER), actualStart: 'actualStart' in record ? record.actualStart || null : existing?.actualStart || null, actualEnd: 'actualEnd' in record ? record.actualEnd || null : existing?.actualEnd || null };
    if (existing) Object.assign(existing, values); else model.meetings.push({ id: 'calendar-' + record.id, ...values });
    return existing || model.meetings.at(-1);
  }
  function computeReport(sessions, period = 'This week', now = Date.now()) {
    const [from, to] = periodBounds(period, now), effectiveTo = Math.min(to, now);
    const entries = sessions.map(s => ({ ...s, interval: [Math.max(from, s.start), Math.min(effectiveTo, s.end === null ? now : s.end)] })).filter(s => s.interval[1] > s.interval[0]);
    const intervals = mergeIntervals(entries.map(s => s.interval)), total = intervals.reduce((sum, [a, b]) => sum + b - a, 0), normal = normalMilliseconds(intervals);
    const groups = new Map();
    entries.forEach(s => { const key = String(s.itemId); if (!groups.has(key)) groups.set(key, { itemId: s.itemId, name: s.name, project: s.project, kind: s.kind, source: s.source || 'Actual timer', intervals: [] }); groups.get(key).intervals.push(s.interval); });
    const activities = [...groups.values()].map(group => ({ ...group, milliseconds: mergeIntervals(group.intervals).reduce((sum, [a, b]) => sum + b - a, 0) })).sort((a, b) => b.milliseconds - a.milliseconds);
    return { total, normal, overtime: total - normal, activities, intervals, from, to };
  }
  function clockText(milliseconds) { const s = Math.floor(Math.max(0, milliseconds) / 1000); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, '0')).join(':'); }
  function durationText(milliseconds) { const seconds = Math.floor(milliseconds / 1000), minutes = Math.floor(seconds / 60); return minutes ? Math.floor(minutes / 60) + 'h ' + String(minutes % 60).padStart(2, '0') + 'm' : seconds + 's'; }
  function planFromJSON(model, source, {now=Date.now(), projects=[]}={}) {
    const fail=message=>{throw new Error(message)};
    if(!source||typeof source!=='object'||Array.isArray(source))fail('Use a JSON object from the downloadable template.');
    if(source.version!==1||source.timezone!=='Asia/Singapore')fail('Use version 1 and timezone Asia/Singapore.');
    if(source.date!==model.day)fail('This import is for '+model.day+'. Change the template date to the day shown in My day.');
    if(typeof source.allowOvertime!=='boolean')fail('Set allowOvertime to true or false.');
    if(!Array.isArray(source.tasks)||!Array.isArray(source.meetings)||source.tasks.length+source.meetings.length<1||source.tasks.length+source.meetings.length>200)fail('Include between 1 and 200 tasks and meetings.');
    const copy=JSON.parse(JSON.stringify(model)),seen=new Set([...copy.tasks,...copy.meetings].map(x=>x.importKey).filter(Boolean)),added=[],originalPins=new Map(copy.tasks.map(t=>[String(t.id),t.pinned]));
    copy.tasks.forEach(t=>{t.pinned=true});
    function fields(row,type,index){
      const label=type+' '+(index+1);if(!row||typeof row!=='object'||Array.isArray(row))fail(label+': expected an object.');
      if(typeof row.id!=='string'||!row.id.trim()||row.id.length>100)fail(label+': provide a unique id of up to 100 characters.');
      const importKey=source.date+':'+row.id;if(seen.has(importKey))fail(label+': id "'+row.id+'" was already imported or appears twice.');seen.add(importKey);
      if(typeof row.title!=='string'||!row.title.trim()||row.title.length>200)fail(label+': enter a title of up to 200 characters.');
      const project=row.project||'General';if(project!=='General'&&!projects.includes(project))fail(label+': project "'+project+'" does not exist. Use its exact name or leave project blank.');
      if(!Number.isInteger(row.durationMinutes)||row.durationMinutes<1||row.durationMinutes>720)fail(label+': durationMinutes must be a whole number from 1 to 720.');
      return {name:row.title.trim(),project,estimateMinutes:row.durationMinutes,importKey};
    }
    function timeSlot(value,label){if(typeof value!=='string'||!/^\d{2}:\d{2}$/.test(value))fail(label+': use HH:MM for startTime.');const [h,m]=value.split(':').map(Number),slot=(h*60+m-DAY_START)/15;if(h>23||m>59||m%15||slot<0||slot>=48)fail(label+': startTime must be a 15-minute time within 08:00–19:45.');return slot;}
    source.meetings.forEach((row,index)=>{const values=fields(row,'Meeting',index);if(!['client','internal'].includes(row.kind))fail('Meeting '+(index+1)+': kind must be client or internal.');const slot=timeSlot(row.startTime,'Meeting '+(index+1)),meeting={...values,id:'json-meeting-'+(++copy.serial),date:copy.day,kind:row.kind,slot,length:Math.ceil(values.estimateMinutes/15),pinned:true};if(!canPlace(copy,meeting,slot))fail('Meeting '+(index+1)+': the full duration overlaps existing work or extends past 20:00. Choose another time.');copy.meetings.push(meeting);added.push(meeting);});
    source.tasks.forEach((row,index)=>{const values=fields(row,'Task',index);if(row.due!==undefined&&typeof row.due!=='string')fail('Task '+(index+1)+': due must be YYYY-MM-DD or empty.');const result=addTask(copy,{...values,priority:row.priority,due:row.due},now);if(!result.ok)fail('Task '+(index+1)+': '+Object.values(result.errors).join(' '));Object.assign(result.task,{importKey:values.importKey});if(row.startTime){const slot=timeSlot(row.startTime,'Task '+(index+1));const weekend=[0,6].includes(new Date(dayStart(copy.day)+OFFSET).getUTCDay());if(!source.allowOvertime&&(weekend||slot<3||slot+slotsFor(result.task)>40))fail('Task '+(index+1)+': this time is overtime. Set allowOvertime to true or leave startTime empty.');if(!canPlace(copy,result.task,slot))fail('Task '+(index+1)+': the full duration overlaps other work or extends past 20:00.');result.task.slot=slot;result.task.pinned=true;}added.push(result.task);});
    replan(copy,{allowOvertime:source.allowOvertime,now});copy.tasks.forEach(t=>{if(originalPins.has(String(t.id)))t.pinned=originalPins.get(String(t.id))});
    return {model:copy,added,unscheduled:added.filter(t=>!isMeeting(t)&&t.slot===null).length};
  }
  const Core = { planFromJSON, QUARTER, DAY_START, DAY_END, SLOT_COUNT, dateKey, dayStart, shiftDate, slotLabel, slotsFor, overlaps, allItems, createModel, addTask, canPlace, moveItem, replan, startItem, pauseItem, finishTask, elapsedFor, mergeIntervals, periodBounds, normalMilliseconds, reportEntries, upsertMeeting, computeReport, clockText, durationText };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  root.DayPlannerCore = Core;
  root.createDayPlanner = function ({ document, toast, modal, projectOptions = () => [], onTasksChanged = () => {}, onMeetingsChanged = () => {}, now = () => Date.now(), model = createModel({ now: now() }), setInterval: interval = root.setInterval?.bind(root) }) {
    const $ = id => document.getElementById(id), esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let drag = null, timer = null;
    model.tasks.forEach(t=>{if(!t.date)t.date=model.day});
    let calendarView=model.calendarView||'day',lastToday=dateKey(now());
    const warnedMeetings = new Set();
    const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
    const closeModal = () => $('modal').close();
    const tell = result => { toast(result.message); return result; };
    function focusedItem() {
      const active = document.activeElement, card = active?.closest?.('[data-planner-item]');
      return card ? { itemId: card.dataset.plannerItem, action: active.dataset.plannerAction || 'timer' } : null;
    }
    function restoreItemFocus(intent) {
      if (!intent) return;
      const selector = '[data-planner-item="' + intent.itemId + '"]', card = $('schedule').querySelector(selector) || $('backlog').querySelector(selector);
      const target = card?.querySelector('[data-planner-action="' + intent.action + '"]') || card?.querySelector('[data-planner-action="timer"]');
      if (target) target.focus(); else { $('timer-name').tabIndex = -1; $('timer-name').focus(); }
    }
    const commit = (intent = focusedItem()) => { onMeetingsChanged(model.meetings); render(); onTasksChanged(model.tasks); restoreItemFocus(intent); };
    const button = (text, click) => { const b = element('button', text); b.type = 'button'; b.onclick = click; return b; };
    function requestStart(item) {
      const activeTask = model.sessions.find(s => s.kind === 'task' && s.end === null);
      if (activeTask && String(activeTask.itemId) !== String(item.id)) {
        modal('<h2>Another task is running</h2><p>' + esc(activeTask.name) + ' is being timed.</p><div class="row"><button id="dp-switch">Pause task &amp; start ' + (isMeeting(item) ? 'meeting' : 'task') + '</button>' + (isMeeting(item) ? '<button id="dp-overlap">Continue task &amp; start meeting</button>' : '') + '<button id="dp-cancel">Cancel</button></div>');
        $('dp-switch').onclick = () => { pauseItem(model, activeTask.itemId, now()); tell(startItem(model, item.id, now())); closeModal(); commit({ itemId: item.id, action: 'timer' }); };
        if ($('dp-overlap')) $('dp-overlap').onclick = () => { tell(startItem(model, item.id, now())); closeModal(); commit({ itemId: item.id, action: 'timer' }); toast('Both timers continue. Overall working time counts overlapping minutes once.'); };
        $('dp-cancel').onclick = closeModal; $('dp-switch').focus(); return;
      }
      tell(startItem(model, item.id, now())); commit({ itemId: item.id, action: 'timer' });
    }
    function moveDialog(item) {
      modal('<h2>Move ' + esc(item.name) + '</h2><form id="dp-move-form"><label for="dp-move-slot">Start time (Singapore)</label><select id="dp-move-slot">' + (!isMeeting(item) ? '<option value="">Unscheduled</option>' : '') + Array.from({ length: SLOT_COUNT }, (_, i) => '<option value="' + i + '"' + (i === item.slot ? ' selected' : '') + '>' + slotLabel(i) + '</option>').join('') + '</select><p>Reserves ' + slotsFor(item) * QUARTER + ' minutes. Dropping onto one task swaps their times only when both full durations fit. Meetings are moved directly.</p><p id="dp-move-error" class="field-error" role="alert"></p><button type="submit">Move item</button></form>');
      if (item.slot === null) $('dp-move-slot').value = '';
      $('dp-move-form').onsubmit = e => { e.preventDefault(); const value = $('dp-move-slot').value; const result = moveItem(model, item.id, value === '' ? null : Number(value)); if (!result.ok) { $('dp-move-error').textContent = result.message; return; } closeModal(); commit({ itemId: item.id, action: 'move' }); tell(result); };
      $('dp-move-slot').focus();
    }
    function editMeetingActual(item) {
      const toInput = value => Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + OFFSET).toISOString().slice(0, 16) : '';
      const schedule = item.scheduledStart || new Date(dayStart(item.date) + (DAY_START + item.slot * QUARTER) * 60000).toISOString();
      const actualStart = item.actualStart || schedule, actualEnd = item.actualEnd || new Date(Date.parse(schedule) + item.estimateMinutes * 60000).toISOString();
      modal('<h2>Correct meeting time</h2><p>' + esc(item.name) + '</p><form id="dp-actual-form"><label>Actual start (Singapore) *<input id="dp-actual-start" type="datetime-local" value="'+esc(toInput(actualStart))+'" required></label><label>Actual end (Singapore) *<input id="dp-actual-end" type="datetime-local" value="'+esc(toInput(actualEnd))+'" required></label><p>The correction replaces this meeting’s estimate and timer duration in reports. Original timer records are retained. Equal start and end records zero time.</p><p id="dp-actual-error" class="field-error" role="alert"></p><div class="row"><button type="submit">Save actual time</button><button type="button" id="dp-actual-reset">Use timer or schedule</button></div></form>');
      $('dp-actual-form').onsubmit = e => { e.preventDefault(); const start = Date.parse($('dp-actual-start').value + '+08:00'), end = Date.parse($('dp-actual-end').value + '+08:00'); if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end > now()) { $('dp-actual-error').textContent = 'Enter a valid start and end, with the end no earlier than the start and no later than now.'; return; } item.actualStart = new Date(start).toISOString(); item.actualEnd = new Date(end).toISOString(); closeModal(); commit({ itemId: item.id, action: 'actual' }); toast('Actual meeting time saved.'); };
      $('dp-actual-reset').onclick = () => { item.actualStart = null; item.actualEnd = null; closeModal(); commit({ itemId: item.id, action: 'actual' }); toast('Meeting reports use timer records when available, otherwise the scheduled estimate.'); };
      $('dp-actual-start').focus();
    }
    function card(item, scheduled) {
      const meeting = isMeeting(item), node = element('div', undefined, (scheduled ? 'event' : 'task') + (meeting ? ' meeting ' + item.kind : item.project === 'General' ? ' nonproject' : '') + (item.pinned ? ' pinned' : ''));
      node.draggable = true; node.dataset.plannerItem = String(item.id);
      const overdue = !meeting && item.due && item.due < model.day;
      node.append(element('span', (meeting ? item.kind === 'client' ? 'Client meeting' : 'Internal project meeting' : item.project === 'General' ? 'Non-project task' : 'Project task') + (item.pinned ? ' · Pinned' : '') + (overdue ? ' · Overdue' : ''), 'badge' + (overdue ? ' warn' : '')));
      node.append(element('strong', item.name));
      const reservation = slotsFor(item) * QUARTER;
      node.append(element('small', (item.project || 'General') + ' · ' + item.estimateMinutes + 'm estimate' + (reservation !== item.estimateMinutes ? ' · ' + reservation + 'm reserved' : '') + (!meeting ? ' · ' + item.priority + ' priority' + (item.due ? ' · Due ' + item.due : '') : '') + (scheduled ? ' · ' + (meeting && item.scheduledStart ? new Date(Date.parse(item.scheduledStart)+OFFSET).toISOString().slice(11,16)+'–'+new Date(Date.parse(item.scheduledStart)+OFFSET+item.estimateMinutes*60000).toISOString().slice(11,16) : slotLabel(item.slot) + '–' + slotLabel(itemEnd(item))) : '')));
      node.ondragstart = e => { drag = item.id; e.dataTransfer?.setData('text/plain', String(item.id)); };
      const controls = element('div', undefined, 'row');
      const active = openSession(model, item.id);
      const timerButton = button(active ? meeting ? 'End meeting' : 'Pause' : item.status === 'Paused' || elapsedFor(model, item.id, now()) ? 'Resume' : 'Start', () => { if (active) { pauseItem(model, item.id, now()); commit({ itemId: item.id, action: 'timer' }); toast(meeting ? 'Meeting time recorded.' : 'Task paused.'); } else requestStart(item); }); timerButton.dataset.plannerAction = 'timer'; controls.append(timerButton);
      if (meeting) { const actualButton = button('Correct actual time', () => editMeetingActual(item)); actualButton.dataset.plannerAction = 'actual'; controls.append(actualButton); }
      const moveButton = button('Move', () => moveDialog(item)); moveButton.dataset.plannerAction = 'move'; controls.append(moveButton);
      if (!meeting && item.pinned) { const unpin = button('Unpin', () => { item.pinned = false; commit({ itemId: item.id, action: 'timer' }); toast('Task unpinned. Replan may move it.'); }); unpin.dataset.plannerAction = 'unpin'; controls.append(unpin); }
      node.append(controls); return node;
    }
    function renderTimer() {
      const task = findItem(model, model.currentTaskId);
      $('timer-name').textContent = task ? task.name + ' · ' + (task.status === 'Completed' ? 'Completed' : openSession(model, task.id) ? 'Running' : 'Paused') : 'No task started';
      $('timer-value').textContent = task ? clockText(elapsedFor(model, task.id, now())) : '00:00:00';
      const enabled = task && task.status !== 'Completed';
      $('pause').disabled = !enabled; $('finish').disabled = !enabled;
      $('pause').textContent = enabled && !openSession(model, task.id) ? 'Resume' : 'Pause';
      let meetingHost = $('planner-active-meetings');
      const meetingSessions = model.sessions.filter(s => s.kind === 'meeting' && s.end === null), key = meetingSessions.map(s => s.id).join(',');
      if (!meetingHost) { meetingHost = element('div'); meetingHost.id = 'planner-active-meetings'; $('timer-name').parentNode.append(meetingHost); }
      if (meetingHost.dataset.sessions !== key) {
        meetingHost.dataset.sessions = key; meetingHost.replaceChildren();
        meetingSessions.forEach(s => { const row = element('div', undefined, 'row'), time = element('span'); time.dataset.meetingTimer = String(s.itemId); row.append(element('strong', s.name), time, button('End meeting', () => { pauseItem(model, s.itemId, now()); commit({ itemId: s.itemId, action: 'timer' }); toast('Meeting time recorded.'); })); meetingHost.append(row); });
      }
      meetingSessions.forEach(s => { const output = meetingHost.querySelector('[data-meeting-timer="' + s.itemId + '"]'); if (output) output.textContent = clockText(elapsedFor(model, s.itemId, now())); });
    }
    function renderReports() {
      const period = $('period'); if (!period) return;
      const report = computeReport(reportEntries(model), period.value || 'This week', now());
      $('total').textContent = durationText(report.total); $('normal').textContent = durationText(report.normal); $('overtime').textContent = durationText(report.overtime);
      let host = $('day-time-breakdown');
      if (!host) { const panel = $('reports')?.querySelector('section.panel'); if (!panel) return; panel.replaceChildren(); host = element('div'); host.id = 'day-time-breakdown'; panel.append(host); }
      host.innerHTML = '<h2>Working time</h2><p>Timers and elapsed scheduled meetings · ' + esc(period.value) + ' · Singapore time. Overall totals count overlaps once. A meeting’s actual correction takes priority, followed by its timer records, then its scheduled estimate.</p>' + (report.activities.length ? '<div class="table-wrap"><table class="register-table"><thead><tr><th scope="col">Activity</th><th scope="col">Project</th><th scope="col">Type</th><th scope="col">Recorded time</th></tr></thead><tbody>' + report.activities.map(a => '<tr><td data-label="Activity">' + esc(a.name) + '</td><td data-label="Project">' + esc(a.project || 'General') + '</td><td data-label="Type">' + esc((a.kind === 'meeting' ? 'Meeting' : 'Task') + ' · ' + a.source) + '</td><td data-label="Recorded time" class="pp-number">' + durationText(a.milliseconds) + (a.kind === 'meeting' ? ' <button type="button" data-report-actual="'+esc(a.itemId)+'">Correct actual time</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p>No working time in this period. Scheduled meetings count automatically as their time elapses. Start a task timer to record other work.</p>');
    }
    if ($('reports')) $('reports').onclick = e => { const button = e.target.closest('[data-report-actual]'); if (!button) return; const item = model.meetings.find(m => String(m.id) === button.dataset.reportActual); if (item) editMeetingActual(item); };
    function updateNow() {
      const line = $('planner-now'); if (!line) return;
      const current = now(), minutes = (current - dayStart(model.day)) / 60000;
      if (minutes < DAY_START || minutes >= DAY_END) { line.hidden = true; return; }
      const index = Math.floor((minutes - DAY_START) / QUARTER), row = $('schedule').querySelector('[data-planner-slot="' + index + '"]');
      if (!row) return; line.hidden = false; line.style.top = row.offsetTop + row.offsetHeight * (((minutes - DAY_START) % QUARTER) / QUARTER) + 'px';
      line.setAttribute('aria-label', 'Current Singapore time ' + timeLabel(Math.floor(minutes)));
    }
    function render() {
      const backlog = model.tasks.filter(t => t.date===model.day && t.status !== 'Completed' && t.slot === null);
      $('backlog-count').textContent = backlog.length + ' tasks'; $('backlog').replaceChildren();
      if (!backlog.length) $('backlog').append(element('p', 'No unscheduled tasks. Add a task whenever something comes up.', 'muted'));
      backlog.forEach(t => $('backlog').append(card(t, false)));
      const completed = model.tasks.filter(t => t.date===model.day && t.status === 'Completed');
      if (completed.length) { const details = element('details'), summary = element('summary', 'Completed tasks (' + completed.length + ')'); details.append(summary); completed.forEach(t => details.append(element('p', t.name + ' · ' + durationText(elapsedFor(model, t.id, now()))))); $('backlog').append(details); }
      $('schedule').replaceChildren();
      model.meetings.filter(m => m.date === model.day && (m.slot < 0 || m.slot >= SLOT_COUNT)).forEach(m => $('schedule').append(card(m, true)));
      for (let i = 0; i < SLOT_COUNT; i++) {
        const row = element('div', undefined, 'hour'); row.dataset.plannerSlot = String(i);
        const label = element('span', slotLabel(i)), slot = element('div', undefined, 'slot');
        slot.ondragover = e => e.preventDefault(); slot.ondrop = e => { e.preventDefault(); const id = e.dataTransfer?.getData('text/plain') || drag; const result = moveItem(model, id, i); if (result.ok) commit(); tell(result); };
        const items = allItems(model).filter(item => item.slot !== null && i >= item.slot && i < itemEnd(item));
        items.forEach(item => { if (i === item.slot) slot.append(card(item, true)); else { const continued = element('div', item.name + ' · continued', 'event' + (isMeeting(item) ? ' meeting ' + item.kind : item.project === 'General' ? ' nonproject' : '')); continued.setAttribute('aria-label', item.name + ', reserved until ' + slotLabel(itemEnd(item))); slot.append(continued); } });
        row.append(label, slot); $('schedule').append(row);
      }
      const line = element('div', undefined, 'now'); line.id = 'planner-now'; line.setAttribute('role', 'img'); $('schedule').append(line);
      renderTimer(); renderReports(); updateNow(); renderCalendar();
    }
    const longDate=date=>new Date(dayStart(date)).toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',day:'numeric',month:'long',year:'numeric'});
    function calendarDates(){const dow=new Date(dayStart(model.day)+OFFSET).getUTCDay();if(calendarView==='week'){const first=shiftDate(model.day,-((dow+6)%7));return Array.from({length:7},(_,i)=>shiftDate(first,i));}const first=model.day.slice(0,7)+'-01',weekday=new Date(dayStart(first)+OFFSET).getUTCDay(),start=shiftDate(first,-((weekday+6)%7));return Array.from({length:42},(_,i)=>shiftDate(start,i));}
    function chooseDay(date){if(!validDate(date))return;if(root.DraftGuard&&!root.DraftGuard.canLeave())return;model.day=date;render();onTasksChanged(model.tasks);}
    function renderCalendar(){if(!$('calendar-overview'))return;model.calendarView=calendarView;$('calendar-date').value=model.day;$('calendar-day').hidden=calendarView!=='day';$('calendar-overview').hidden=calendarView==='day';document.querySelectorAll('[data-calendar-view]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.calendarView===calendarView));b.classList.toggle('primary',b.dataset.calendarView===calendarView)});const dates=calendarDates();$('calendar-heading').textContent=calendarView==='month'?new Date(dayStart(model.day)).toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',month:'long',year:'numeric'}):calendarView==='week'?longDate(dates[0])+' – '+longDate(dates[6]):longDate(model.day);const summary=document.querySelector('.timeline-summary');if(summary)summary.textContent=(model.day===dateKey(now())?'Today’s timeline':'Timeline · '+longDate(model.day));if(calendarView==='day')return;
      $('calendar-overview').className='panel calendar-overview calendar-'+calendarView;
      $('calendar-overview').innerHTML=(calendarView==='week'?'<div class="calendar-hour-axis"><button class="calendar-date-button" disabled>SGT</button><div class="calendar-hours">'+Array.from({length:12},(_,i)=>'<span>'+timeLabel(480+i*60)+'</span>').join('')+'</div></div>':'')+dates.map(date=>{const items=[...model.meetings.filter(m=>m.date===date),...model.tasks.filter(t=>t.date===date&&t.status!=='Completed')].sort((a,b)=>(a.slot??99)-(b.slot??99));return '<section class="calendar-cell '+(date===dateKey(now())?'calendar-current':'')+' '+(calendarView==='month'&&date.slice(0,7)!==model.day.slice(0,7)?'calendar-adjacent':'')+'"><button class="calendar-date-button" data-calendar-date="'+date+'" aria-label="Open '+longDate(date)+'">'+new Date(dayStart(date)).toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',weekday:'short',day:'numeric',month:'short'})+'</button><div class="calendar-items">'+((calendarView==='week'?items.filter(item=>item.slot!==null&&item.slot>=0&&item.slot<48):items).map(item=>'<button class="calendar-event '+(isMeeting(item)?item.kind:'task')+(calendarView==='week'&&item.slot!==null&&item.slot>=0&&item.slot<48?' calendar-timed':'')+'" '+(calendarView==='week'&&item.slot!==null&&item.slot>=0&&item.slot<48?'style="top:'+(item.slot/48*100)+'%;height:'+(Math.min(slotsFor(item),48-item.slot)/48*100)+'%"':'')+' data-calendar-date="'+date+'" title="'+esc(item.name)+'"><span>'+ (item.slot===null?'Unscheduled':item.scheduledStart?new Date(item.scheduledStart).toLocaleTimeString('en-GB',{timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit'}):slotLabel(item.slot))+'</span> '+esc(item.name)+' <span>· '+item.estimateMinutes+' min</span></button>').join('')||'<p class="muted">No items</p>')+'</div>'+(calendarView==='week'?'<div class="calendar-unplanned">'+items.filter(item=>item.slot===null||item.slot<0||item.slot>=48).map(item=>'<button class="calendar-event" data-calendar-date="'+date+'">'+esc(item.name)+' · '+(item.slot===null?'Unscheduled':slotLabel(item.slot))+'</button>').join('')+'</div>':'')+'</section>';}).join('');
    }
    if($('calendar-prev')){
      const navigate=direction=>{if(calendarView==='month'){const d=new Date(dayStart(model.day)+OFFSET);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+direction);chooseDay(d.toISOString().slice(0,10));}else chooseDay(shiftDate(model.day,direction*(calendarView==='week'?7:1)));};
      $('calendar-prev').onclick=()=>navigate(-1);$('calendar-next').onclick=()=>navigate(1);$('calendar-today').onclick=()=>chooseDay(dateKey(now()));$('calendar-date').onchange=e=>chooseDay(e.target.value);
      document.querySelectorAll('[data-calendar-view]').forEach(b=>b.onclick=()=>{calendarView=b.dataset.calendarView;render();onTasksChanged(model.tasks)});
      $('calendar-overview').onclick=e=>{const b=e.target.closest('[data-calendar-date]');if(!b)return;calendarView='day';chooseDay(b.dataset.calendarDate)};
    }
    function overlapPrompt(meeting) {
      const active = model.sessions.find(s => s.kind === 'task' && s.end === null);
      if (!active) { toast('Start a task first to try a meeting overlap.'); return; }
      modal('<h2>Meeting overlap</h2><p>' + esc(meeting?.name || 'A client meeting') + ' is starting while ' + esc(active.name) + ' is running. Choose whether to pause your task.</p><div class="row"><button id="dp-pause-overlap">Pause task</button><button id="dp-continue-overlap">Continue task</button></div><p>Start the meeting timer from its timeline card when you begin the meeting.</p>');
      $('dp-pause-overlap').onclick = () => { pauseItem(model, active.itemId, now()); closeModal(); commit(); toast('Task paused. Meeting time unchanged.'); };
      $('dp-continue-overlap').onclick = () => { closeModal(); toast('Task timer continues. You control when to pause or finish.'); };
      $('dp-pause-overlap').focus();
    }
    function newTask() {
      const options = [...new Set(projectOptions().filter(Boolean))];
      modal('<h2>Add a personal task</h2><form id="dp-task-form"><label for="dp-name">Task name *</label><input id="dp-name" required maxlength="200" aria-describedby="dp-name-error"><p id="dp-name-error" class="field-error"></p><label for="dp-estimate">Estimated minutes *</label><input id="dp-estimate" type="number" min="1" max="720" step="1" value="30" required aria-describedby="dp-estimate-error"><p id="dp-estimate-error" class="field-error"></p><p>Time is reserved in 15-minute blocks, rounded up from your estimate.</p><label for="dp-due">Deadline (optional)</label><input id="dp-due" type="date" aria-describedby="dp-due-error"><p id="dp-due-error" class="field-error"></p><label for="dp-priority">Priority *</label><select id="dp-priority">' + priorities.map(p => '<option' + (p === 'Normal' ? ' selected' : '') + '>' + p + '</option>').join('') + '</select><p id="dp-priority-error" class="field-error"></p><label for="dp-project">Project (optional)</label><select id="dp-project"><option value="General">No project — General</option>' + options.map(p => '<option value="' + esc(p) + '">' + esc(p) + '</option>').join('') + '</select><p id="dp-task-error" class="field-error" role="alert"></p><button id="dp-save" type="submit">Add to my to-dos</button><p>' + (root.PlannerAPI?.enabled ? 'Tasks and timer records are saved to your private server.' : 'Saved for this mockup session. Reloading clears personal tasks and timer records.') + '</p></form>');
      $('dp-task-form').onsubmit = e => { e.preventDefault(); const result = addTask(model, { name: $('dp-name').value, estimateMinutes: $('dp-estimate').value, due: $('dp-due').value, priority: $('dp-priority').value, project: $('dp-project').value }, now()); ['name', 'estimate', 'due', 'priority'].forEach(key => { $('dp-' + key + '-error').textContent = result.errors?.[key] || ''; $('dp-' + key).setAttribute('aria-invalid', String(Boolean(result.errors?.[key]))); }); if (!result.ok) { $('dp-task-error').textContent = 'Check the highlighted task details.'; $('dp-' + Object.keys(result.errors)[0]).focus(); return; } $('dp-save').disabled = true; closeModal(); commit(); toast('Task added to My day → Unscheduled tasks. Deadline, priority and estimate saved.'); };
      $('dp-name').focus();
    }
    $('new').onclick = newTask;
    $('timer-value').setAttribute('role', 'timer'); $('timer-value').setAttribute('aria-label', 'Accumulated time for the current task');
    $('pause').onclick = () => { const task = findItem(model, model.currentTaskId); if (!task || task.status === 'Completed') return; if (openSession(model, task.id)) { pauseItem(model, task.id, now()); commit(); toast('Task paused. Its accumulated time is retained.'); } else requestStart(task); };
    $('finish').onclick = () => { if (finishTask(model, model.currentTaskId, now())) { commit(); toast('Task completed. Time recorded and its planned slot released.'); } };
    $('simulate').onclick = () => overlapPrompt(model.meetings.find(m => m.kind === 'client'));
    $('replan').onclick = () => { modal('<h2>Rearrange today</h2><p>Arrange tasks from the next available 15-minute boundary, by priority then deadline. Meetings, pinned times and running tasks remain in place. Every task needs enough space for its full estimate.</p><div class="row"><button id="dp-normal-plan">Normal hours only</button><button id="dp-overtime-plan">Include overtime</button></div><p>Normal hours: Monday–Friday, 08:45–18:00. Overtime can use 08:00–20:00; weekends are entirely overtime. Tasks that do not fit remain unscheduled.</p>'); const plan = allowOvertime => { const result = replan(model, { allowOvertime, now: now() }); closeModal(); commit(); toast(result.message); }; $('dp-normal-plan').onclick = () => plan(false); $('dp-overtime-plan').onclick = () => plan(true); $('dp-normal-plan').focus(); };
    const toolbar=$('timeline-actions');
    if(toolbar){
      const templateButton=element('button','Download JSON template'),importButton=element('button','Import JSON');templateButton.type=importButton.type='button';toolbar.append(templateButton,importButton);
      templateButton.onclick=()=>{const template={version:1,timezone:'Asia/Singapore',date:model.day,allowOvertime:false,instructions:'Use unique IDs. Existing work stays in place. Tasks with empty startTime are assigned automatically by priority and deadline. Times use HH:MM and 15-minute boundaries; durations are whole minutes. project is an existing project name or empty. Reimporting the same IDs for the same date is rejected.',meetings:[{id:'meeting-001',title:'Client discussion',kind:'client',project:'',startTime:'14:00',durationMinutes:60}],tasks:[{id:'task-001',title:'Prepare discussion notes',project:'',durationMinutes:30,priority:'High',due:model.day,startTime:''},{id:'task-002',title:'Review project progress',project:'',durationMinutes:45,priority:'Normal',due:model.day,startTime:''}]};const url=URL.createObjectURL(new Blob([JSON.stringify(template,null,2)],{type:'application/json'})),link=element('a');link.href=url;link.download='daily-plan-template.json';link.click();root.setTimeout(()=>URL.revokeObjectURL(url),1000);};
      importButton.onclick=()=>{
        if(root.DraftGuard&&!root.DraftGuard.canLeave())return;
        modal('<h2>Import daily plan</h2><p>Upload the JSON template for '+esc(model.day)+'. Review the assigned times before adding anything. Existing tasks and meetings stay in place.</p><label>JSON file<input id="dp-json-file" type="file" accept=".json,application/json"></label><p class="muted">Maximum 1 MB and 200 items. Empty task start times are assigned around existing work. Meetings keep the start time in the file.</p><p id="dp-json-error" class="field-error" role="alert"></p><div id="dp-json-preview"></div><div class="row"><button id="dp-json-apply" disabled>Import plan</button><button id="dp-json-cancel" type="button">Cancel</button></div>');
        let candidate=null,baseline='',previewSlots='',reading=0;
        $('dp-json-cancel').onclick=closeModal;
        $('dp-json-file').onchange=async event=>{const token=++reading;candidate=null;$('dp-json-apply').disabled=true;$('dp-json-preview').innerHTML='';$('dp-json-error').textContent='';const file=event.target.files[0];if(!file)return;try{if(file.size>1024*1024)throw new Error('Use a JSON file smaller than 1 MB.');const text=await file.text();if(token!==reading||!$('modal').open)return;let source;try{source=JSON.parse(text)}catch{throw new Error('This file is not valid JSON. Check commas, brackets and double quotes.');}const result=planFromJSON(model,source,{now:now(),projects:projectOptions()});baseline=JSON.stringify(model);previewSlots=JSON.stringify(result.added.map(item=>[item.id,item.slot]));candidate=source;$('dp-json-preview').innerHTML='<p>'+result.added.length+' items · '+result.unscheduled+' remain unscheduled because there is insufficient space. '+(source.allowOvertime?'Overtime allowed.':'Normal working hours only for tasks.')+'</p><table><thead><tr><th>Item</th><th>Type</th><th>Start</th><th>Minutes</th></tr></thead><tbody>'+result.added.map(item=>'<tr><td data-label="Item">'+esc(item.name)+'</td><td data-label="Type">'+(isMeeting(item)?'Meeting':'Task')+'</td><td data-label="Start">'+(item.slot===null?'Unscheduled':slotLabel(item.slot))+'</td><td data-label="Minutes">'+item.estimateMinutes+'</td></tr>').join('')+'</tbody></table>';$('dp-json-apply').disabled=false;}catch(error){$('dp-json-error').textContent=error.message;}};
        $('dp-json-apply').onclick=()=>{if(!candidate)return;try{if(JSON.stringify(model)!==baseline)throw new Error('Your day changed while reviewing. Select the file again for an updated preview.');const result=planFromJSON(model,candidate,{now:now(),projects:projectOptions()});if(JSON.stringify(result.added.map(item=>[item.id,item.slot]))!==previewSlots)throw new Error('Time has moved on since the preview. Select the file again to review updated times.');model.tasks.splice(0,model.tasks.length,...result.model.tasks);model.meetings.splice(0,model.meetings.length,...result.model.meetings);model.serial=result.model.serial;closeModal();commit();toast(result.added.length+' items imported; '+result.unscheduled+' remain unscheduled.');}catch(error){$('dp-json-error').textContent=error.message;$('dp-json-apply').disabled=true;}};
      };
    }
    if ($('period')) $('period').onchange = renderReports;
    function tick() {
      const today = dateKey(now());
      if(today!==lastToday){const wasToday=model.day===lastToday;lastToday=today;warnedMeetings.clear();if(wasToday)model.day=today;render();}
      renderTimer(); updateNow();
      if ($('reports') && !$('reports').classList.contains('hidden')) renderReports();
      const active = model.sessions.some(s => s.kind === 'task' && s.end === null);
      if (active && !$('modal').open) { const minutes = (now() - dayStart(today)) / 60000; const meeting = model.meetings.find(m => m.date === today && minutes >= DAY_START + m.slot * QUARTER && minutes < DAY_START + itemEnd(m) * QUARTER && !warnedMeetings.has(m.id) && !model.sessions.some(s => String(s.itemId) === String(m.id))); if (meeting) { warnedMeetings.add(meeting.id); overlapPrompt(meeting); } }
    }
    render(); if (interval) timer = interval(tick, 1000);
    return { tasks: model.tasks, meetings: model.meetings, sessions: model.sessions, model, render, renderReports, newTask, move: (id, slot) => { const result = moveItem(model, id, slot); if (result.ok) commit(); return tell(result); }, replan: options => { const result = replan(model, { ...options, now: now() }); commit(); return tell(result); }, start: (id, options) => { const result = startItem(model, id, now(), options); commit(); return result; }, pause: id => { const result = pauseItem(model, id ?? model.currentTaskId, now()); commit(); return result; }, finish: id => { const result = finishTask(model, id ?? model.currentTaskId, now()); commit(); return result; }, report: period => computeReport(reportEntries(model), period, now()), editMeetingActual, syncMeeting: (record, project) => { const item = upsertMeeting(model, record, project); render(); onTasksChanged(model.tasks); return item; }, tick, destroy: () => { if (timer !== null) root.clearInterval?.(timer); },
      addAction(context, action, owner) { const existing = model.tasks.find(t => t.actionItemId === action.id); if (existing) { toast('This action is already in My day.'); return existing; } const result = addTask(model, { name: action.title, estimateMinutes: 30, due: action.due || '', priority: 'Normal', project: owner.projectName || owner.name || 'General' }, now()); if (!result.ok) { toast('This action needs a valid name and due date before scheduling.'); return null; } result.task.actionItemId = action.id; if (context.startsWith('opportunity:')) result.task.opportunityId = owner.id; commit(); toast('Action added to My day → Unscheduled tasks.'); return result.task; }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
