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
  const slotsFor = item => Math.ceil(Number(item.estimateMinutes || item.length * QUARTER) / QUARTER);
  const overlaps = (start, end, otherStart, otherEnd) => start < otherEnd && end > otherStart;
  const itemEnd = item => item.slot + slotsFor(item);
  const isMeeting = item => item.kind === 'client' || item.kind === 'internal';
  const allItems = model => [...model.tasks.filter(t => t.status !== 'Completed'), ...model.meetings.filter(m => m.date === model.day)];
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
    const task = { id: 'task-' + (++model.serial), name, project: String(fields.project || 'General'), estimateMinutes: minutes, duration: minutes + 'm', due, priority, slot: null, pinned: false, status: 'Ready', createdAt: now };
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
    if (!conflicts.length) { item.slot = slot; if (!isMeeting(item)) item.pinned = true; return { ok: true, message: item.name + ' moved to ' + slotLabel(slot) + '. ' + (isMeeting(item) ? 'Replan will preserve its time.' : 'This time is pinned; the deadline is unchanged.') }; }
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
    const movable = model.tasks.filter(t => t.status !== 'Completed' && !t.pinned && !openSession(model, t.id));
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
  function computeReport(sessions, period = 'This week', now = Date.now()) {
    const [from, to] = periodBounds(period, now), effectiveTo = Math.min(to, now);
    const entries = sessions.map(s => ({ ...s, interval: [Math.max(from, s.start), Math.min(effectiveTo, s.end === null ? now : s.end)] })).filter(s => s.interval[1] > s.interval[0]);
    const intervals = mergeIntervals(entries.map(s => s.interval)), total = intervals.reduce((sum, [a, b]) => sum + b - a, 0), normal = normalMilliseconds(intervals);
    const groups = new Map();
    entries.forEach(s => { const key = String(s.itemId); if (!groups.has(key)) groups.set(key, { itemId: s.itemId, name: s.name, project: s.project, kind: s.kind, intervals: [] }); groups.get(key).intervals.push(s.interval); });
    const activities = [...groups.values()].map(group => ({ ...group, milliseconds: mergeIntervals(group.intervals).reduce((sum, [a, b]) => sum + b - a, 0) })).sort((a, b) => b.milliseconds - a.milliseconds);
    return { total, normal, overtime: total - normal, activities, intervals, from, to };
  }
  function clockText(milliseconds) { const s = Math.floor(Math.max(0, milliseconds) / 1000); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, '0')).join(':'); }
  function durationText(milliseconds) { const seconds = Math.floor(milliseconds / 1000), minutes = Math.floor(seconds / 60); return minutes ? Math.floor(minutes / 60) + 'h ' + String(minutes % 60).padStart(2, '0') + 'm' : seconds + 's'; }
  const Core = { QUARTER, DAY_START, DAY_END, SLOT_COUNT, dateKey, dayStart, shiftDate, slotLabel, slotsFor, overlaps, allItems, createModel, addTask, canPlace, moveItem, replan, startItem, pauseItem, finishTask, elapsedFor, mergeIntervals, periodBounds, normalMilliseconds, computeReport, clockText, durationText };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  root.DayPlannerCore = Core;
  root.createDayPlanner = function ({ document, toast, modal, projectOptions = () => [], onTasksChanged = () => {}, now = () => Date.now(), model = createModel({ now: now() }), setInterval: interval = root.setInterval?.bind(root) }) {
    const $ = id => document.getElementById(id), esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let drag = null, timer = null;
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
    const commit = (intent = focusedItem()) => { render(); onTasksChanged(model.tasks); restoreItemFocus(intent); };
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
    function card(item, scheduled) {
      const meeting = isMeeting(item), node = element('div', undefined, (scheduled ? 'event' : 'task') + (meeting ? ' meeting ' + item.kind : item.project === 'General' ? ' nonproject' : '') + (item.pinned ? ' pinned' : ''));
      node.draggable = true; node.dataset.plannerItem = String(item.id);
      const overdue = !meeting && item.due && item.due < model.day;
      node.append(element('span', (meeting ? item.kind === 'client' ? 'Client meeting' : 'Internal project meeting' : item.project === 'General' ? 'Non-project task' : 'Project task') + (item.pinned ? ' · Pinned' : '') + (overdue ? ' · Overdue' : ''), 'badge' + (overdue ? ' warn' : '')));
      node.append(element('strong', item.name));
      const reservation = slotsFor(item) * QUARTER;
      node.append(element('small', (item.project || 'General') + ' · ' + item.estimateMinutes + 'm estimate' + (reservation !== item.estimateMinutes ? ' · ' + reservation + 'm reserved' : '') + (!meeting ? ' · ' + item.priority + ' priority' + (item.due ? ' · Due ' + item.due : '') : '') + (scheduled ? ' · ' + slotLabel(item.slot) + '–' + slotLabel(itemEnd(item)) : '')));
      node.ondragstart = e => { drag = item.id; e.dataTransfer?.setData('text/plain', String(item.id)); };
      const controls = element('div', undefined, 'row');
      const active = openSession(model, item.id);
      const timerButton = button(active ? meeting ? 'End meeting' : 'Pause' : item.status === 'Paused' || elapsedFor(model, item.id, now()) ? 'Resume' : 'Start', () => { if (active) { pauseItem(model, item.id, now()); commit({ itemId: item.id, action: 'timer' }); toast(meeting ? 'Meeting time recorded.' : 'Task paused.'); } else requestStart(item); }); timerButton.dataset.plannerAction = 'timer'; controls.append(timerButton);
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
      const report = computeReport(model.sessions, period.value || 'This week', now());
      $('total').textContent = durationText(report.total); $('normal').textContent = durationText(report.normal); $('overtime').textContent = durationText(report.overtime);
      let host = $('day-time-breakdown');
      if (!host) { const panel = $('reports')?.querySelector('section.panel'); if (!panel) return; panel.replaceChildren(); host = element('div'); host.id = 'day-time-breakdown'; panel.append(host); }
      host.innerHTML = '<h2>Recorded activity</h2><p>Actual timer sessions · ' + esc(period.value) + ' · Singapore time. Overall totals count overlaps once; individual activities may overlap.</p>' + (report.activities.length ? '<div class="table-wrap"><table class="register-table"><thead><tr><th scope="col">Activity</th><th scope="col">Project</th><th scope="col">Type</th><th scope="col">Recorded time</th></tr></thead><tbody>' + report.activities.map(a => '<tr><td data-label="Activity">' + esc(a.name) + '</td><td data-label="Project">' + esc(a.project || 'General') + '</td><td data-label="Type">' + esc(a.kind === 'meeting' ? 'Meeting' : 'Task') + '</td><td data-label="Recorded time" class="pp-number">' + durationText(a.milliseconds) + '</td></tr>').join('') + '</tbody></table></div>' : '<p>No recorded time in this period. Start a task or meeting timer in My day, then pause or finish to review your activity here.</p>');
    }
    function updateNow() {
      const line = $('planner-now'); if (!line) return;
      const current = now(), minutes = (current - dayStart(model.day)) / 60000;
      if (minutes < DAY_START || minutes >= DAY_END) { line.hidden = true; return; }
      const index = Math.floor((minutes - DAY_START) / QUARTER), row = $('schedule').querySelector('[data-planner-slot="' + index + '"]');
      if (!row) return; line.hidden = false; line.style.top = row.offsetTop + row.offsetHeight * (((minutes - DAY_START) % QUARTER) / QUARTER) + 'px';
      line.setAttribute('aria-label', 'Current Singapore time ' + timeLabel(Math.floor(minutes)));
    }
    function render() {
      const backlog = model.tasks.filter(t => t.status !== 'Completed' && t.slot === null);
      $('backlog-count').textContent = backlog.length + ' tasks'; $('backlog').replaceChildren();
      if (!backlog.length) $('backlog').append(element('p', 'No unscheduled tasks. Add a task whenever something comes up.', 'muted'));
      backlog.forEach(t => $('backlog').append(card(t, false)));
      const completed = model.tasks.filter(t => t.status === 'Completed');
      if (completed.length) { const details = element('details'), summary = element('summary', 'Completed tasks (' + completed.length + ')'); details.append(summary); completed.forEach(t => details.append(element('p', t.name + ' · ' + durationText(elapsedFor(model, t.id, now()))))); $('backlog').append(details); }
      $('schedule').replaceChildren();
      for (let i = 0; i < SLOT_COUNT; i++) {
        const row = element('div', undefined, 'hour'); row.dataset.plannerSlot = String(i);
        const label = element('span', slotLabel(i)), slot = element('div', undefined, 'slot');
        slot.ondragover = e => e.preventDefault(); slot.ondrop = e => { e.preventDefault(); const id = e.dataTransfer?.getData('text/plain') || drag; const result = moveItem(model, id, i); if (result.ok) commit(); tell(result); };
        const items = allItems(model).filter(item => item.slot !== null && i >= item.slot && i < itemEnd(item));
        items.forEach(item => { if (i === item.slot) slot.append(card(item, true)); else { const continued = element('div', item.name + ' · continued', 'event' + (isMeeting(item) ? ' meeting ' + item.kind : item.project === 'General' ? ' nonproject' : '')); continued.setAttribute('aria-label', item.name + ', reserved until ' + slotLabel(itemEnd(item))); slot.append(continued); } });
        row.append(label, slot); $('schedule').append(row);
      }
      const line = element('div', undefined, 'now'); line.id = 'planner-now'; line.setAttribute('role', 'img'); $('schedule').append(line);
      renderTimer(); renderReports(); updateNow();
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
      modal('<h2>Add a personal task</h2><form id="dp-task-form"><label for="dp-name">Task name *</label><input id="dp-name" required maxlength="200" aria-describedby="dp-name-error"><p id="dp-name-error" class="field-error"></p><label for="dp-estimate">Estimated minutes *</label><input id="dp-estimate" type="number" min="1" max="720" step="1" value="30" required aria-describedby="dp-estimate-error"><p id="dp-estimate-error" class="field-error"></p><p>Time is reserved in 15-minute blocks, rounded up from your estimate.</p><label for="dp-due">Deadline (optional)</label><input id="dp-due" type="date" aria-describedby="dp-due-error"><p id="dp-due-error" class="field-error"></p><label for="dp-priority">Priority *</label><select id="dp-priority">' + priorities.map(p => '<option' + (p === 'Normal' ? ' selected' : '') + '>' + p + '</option>').join('') + '</select><p id="dp-priority-error" class="field-error"></p><label for="dp-project">Project (optional)</label><select id="dp-project"><option value="General">No project — General</option>' + options.map(p => '<option value="' + esc(p) + '">' + esc(p) + '</option>').join('') + '</select><p id="dp-task-error" class="field-error" role="alert"></p><button id="dp-save" type="submit">Add to my to-dos</button><p>Saved for this mockup session. Reloading clears personal tasks and timer records.</p></form>');
      $('dp-task-form').onsubmit = e => { e.preventDefault(); const result = addTask(model, { name: $('dp-name').value, estimateMinutes: $('dp-estimate').value, due: $('dp-due').value, priority: $('dp-priority').value, project: $('dp-project').value }, now()); ['name', 'estimate', 'due', 'priority'].forEach(key => { $('dp-' + key + '-error').textContent = result.errors?.[key] || ''; $('dp-' + key).setAttribute('aria-invalid', String(Boolean(result.errors?.[key]))); }); if (!result.ok) { $('dp-task-error').textContent = 'Check the highlighted task details.'; $('dp-' + Object.keys(result.errors)[0]).focus(); return; } $('dp-save').disabled = true; closeModal(); commit(); toast('Task added to My day → Unscheduled tasks. Deadline, priority and estimate saved.'); };
      $('dp-name').focus();
    }
    $('new').onclick = newTask;
    $('timer-value').setAttribute('role', 'timer'); $('timer-value').setAttribute('aria-label', 'Accumulated time for the current task');
    $('pause').onclick = () => { const task = findItem(model, model.currentTaskId); if (!task || task.status === 'Completed') return; if (openSession(model, task.id)) { pauseItem(model, task.id, now()); commit(); toast('Task paused. Its accumulated time is retained.'); } else requestStart(task); };
    $('finish').onclick = () => { if (finishTask(model, model.currentTaskId, now())) { commit(); toast('Task completed. Time recorded and its planned slot released.'); } };
    $('simulate').onclick = () => overlapPrompt(model.meetings.find(m => m.kind === 'client'));
    $('replan').onclick = () => { modal('<h2>Rearrange today</h2><p>Arrange tasks from the next available 15-minute boundary, by priority then deadline. Meetings, pinned times and running tasks remain in place. Every task needs enough space for its full estimate.</p><div class="row"><button id="dp-normal-plan">Normal hours only</button><button id="dp-overtime-plan">Include overtime</button></div><p>Normal hours: Monday–Friday, 08:45–18:00. Overtime can use 08:00–20:00; weekends are entirely overtime. Tasks that do not fit remain unscheduled.</p>'); const plan = allowOvertime => { const result = replan(model, { allowOvertime, now: now() }); closeModal(); commit(); toast(result.message); }; $('dp-normal-plan').onclick = () => plan(false); $('dp-overtime-plan').onclick = () => plan(true); $('dp-normal-plan').focus(); };
    if ($('period')) $('period').onchange = renderReports;
    function tick() {
      const today = dateKey(now());
      if (today !== model.day) { model.day = today; model.tasks.filter(t => t.status !== 'Completed').forEach(t => { t.slot = null; t.pinned = false; }); warnedMeetings.clear(); render(); toast('A new day has started. Unfinished tasks are ready to arrange; active timers continue until you pause them.'); }
      renderTimer(); updateNow();
      if ($('reports') && !$('reports').classList.contains('hidden')) renderReports();
      const active = model.sessions.some(s => s.kind === 'task' && s.end === null);
      if (active && !$('modal').open) { const minutes = (now() - dayStart(model.day)) / 60000; const meeting = model.meetings.find(m => m.date === model.day && minutes >= DAY_START + m.slot * QUARTER && minutes < DAY_START + itemEnd(m) * QUARTER && !warnedMeetings.has(m.id) && !model.sessions.some(s => String(s.itemId) === String(m.id))); if (meeting) { warnedMeetings.add(meeting.id); overlapPrompt(meeting); } }
    }
    render(); if (interval) timer = interval(tick, 1000);
    return { tasks: model.tasks, meetings: model.meetings, sessions: model.sessions, model, render, renderReports, newTask, move: (id, slot) => { const result = moveItem(model, id, slot); if (result.ok) commit(); return tell(result); }, replan: options => { const result = replan(model, { ...options, now: now() }); commit(); return tell(result); }, start: (id, options) => { const result = startItem(model, id, now(), options); commit(); return result; }, pause: id => { const result = pauseItem(model, id ?? model.currentTaskId, now()); commit(); return result; }, finish: id => { const result = finishTask(model, id ?? model.currentTaskId, now()); commit(); return result; }, report: period => computeReport(model.sessions, period, now()), tick, destroy: () => { if (timer !== null) root.clearInterval?.(timer); },
      addAction(context, action, owner) { const existing = model.tasks.find(t => t.actionItemId === action.id); if (existing) { toast('This action is already in My day.'); return existing; } const result = addTask(model, { name: action.title, estimateMinutes: 30, due: action.due || '', priority: 'Normal', project: owner.projectName || owner.name || 'General' }, now()); if (!result.ok) { toast('This action needs a valid name and due date before scheduling.'); return null; } result.task.actionItemId = action.id; if (context.startsWith('opportunity:')) result.task.opportunityId = owner.id; commit(); toast('Action added to My day → Unscheduled tasks.'); return result.task; }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
