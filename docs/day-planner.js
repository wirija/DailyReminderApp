/* Session-only personal planning and time records. Singapore time; no network calls. */
(function (root) {
  'use strict';
  const QUARTER = 15, DAY_START = 0, DAY_END = 1440, SLOT_COUNT = 96;
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
  const allItems = model => [...model.tasks.filter(t => t.status !== 'Completed' && (!t.date || t.date === model.day)), ...model.meetings.filter(m => itemInterval(model, m, model.day))];
  const findItem = (model, id) => [...model.tasks, ...model.meetings].find(item => String(item.id) === String(id));
  const openSession = (model, id) => model.sessions.find(s => String(s.itemId) === String(id) && s.end === null);
  function createModel({ now = Date.now(), sample = true } = {}) {
    const day = dateKey(now);
    const task = (id, name, project, minutes, slot, priority = 'Normal', due = '') => ({ id, name, project, estimateMinutes: minutes, duration: minutes + 'm', slot, priority, due, pinned: false, status: 'Ready', createdAt: now });
    return {
      day, slotOrigin: 0, serial: 100, sessions: [], currentTaskId: null,
      tasks: sample ? [task(1, 'Follow up on sample data', 'Client portal', 15, null, 'High', shiftDate(day, -3)), task(2, 'Review API progress', 'Client portal', 45, 35), task(3, 'Prepare proposal', 'General', 60, 60), task(4, 'Confirm export scope', 'Reporting platform', 20, null), task(5, 'Review weekly team plans', 'General', 30, null)] : [],
      meetings: sample ? [{ id: 'meeting-hanoi', name: 'Hanoi project check-in', kind: 'internal', project: 'General', slot: 44, length: 2, estimateMinutes: 30, date: day }, { id: 'meeting-client', name: 'Client walkthrough', kind: 'client', project: 'Automation rollout', slot: 56, length: 4, estimateMinutes: 60, date: day }] : []
    };
  }
  function addTask(model, fields, now = Date.now()) {
    const name = String(fields.name || '').trim(), minutes = Number(fields.estimateMinutes), due = String(fields.due || ''), priority = fields.priority || 'Normal';
    const errors = {};
    if (!name || name.length > 200) errors.name = 'Enter a task name of up to 200 characters.';
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440 || !Number.isInteger(minutes)) errors.estimate = 'Enter a whole number from 1 to 1440 minutes.';
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
    return ![...model.tasks, ...model.meetings].some(other => {
      if (ids.has(String(other.id)) || other.status === 'Completed') return false;
      const entry = itemInterval(model, other, item.date || model.day);
      return entry && overlaps(slot * QUARTER, (slot + slotsFor(item)) * QUARTER, entry.start, entry.end);
    });
  }
  function moveItem(model, id, slot, { allowOverlap = false, date = null } = {}) {
    const item = findItem(model, id);
    if (!item || item.status === 'Completed') return { ok: false, message: 'Choose an unfinished task or meeting.' };
    if (slot === null && !isMeeting(item)) { item.slot = null; item.pinned = false; return { ok: true, message: item.name + ' returned to Unscheduled tasks.' }; }
    const targetDate = date ?? item.date ?? model.day;
    if (!validDate(targetDate)) return { ok: false, message: 'Choose a valid calendar date.' };
    const length = Math.ceil(Number(item.estimateMinutes || item.length * QUARTER) / QUARTER);
    if (!Number.isInteger(slot) || slot < 0 || slot + length > SLOT_COUNT) return { ok: false, message: 'The full duration must fit between 00:00 and 24:00.' };
    if (slot === item.slot && targetDate === item.date) return { ok: true, message: 'The time is unchanged.' };
    const conflicts = calendarLayout(model, targetDate).filter(entry => entry.item !== item && overlaps(slot * QUARTER, (slot + length) * QUARTER, entry.start, entry.end)).map(entry => entry.item);
    if (!conflicts.length || allowOverlap) { item.date = targetDate; item.slot = slot; if (isMeeting(item)) item.scheduledStart = new Date(dayStart(item.date) + (DAY_START + slot * QUARTER) * 60000).toISOString(); if (!isMeeting(item)) item.pinned = true; return { ok: true, message: item.name + ' moved to ' + targetDate + ' at ' + slotLabel(slot) + '.' }; }
    if (targetDate !== item.date) return { ok: false, message: 'This time overlaps other work. Choose another time or allow overlapping items.' };
    if (isMeeting(item) || conflicts.some(isMeeting)) return { ok: false, message: 'This overlaps a meeting. Move the meeting itself or choose enough open time for the full duration.' };
    if (conflicts.length !== 1) return { ok: false, message: 'The full task overlaps more than one item. Choose another time.' };
    const other = conflicts[0], oldSlot = item.slot, nextSlot = other.slot;
    if (!canPlace(model, item, nextSlot, [other.id]) || (oldSlot !== null && (!canPlace(model, other, oldSlot, [item.id]) || overlaps(nextSlot, nextSlot + slotsFor(item), oldSlot, oldSlot + slotsFor(other))))) return { ok: false, message: 'These tasks cannot swap: their full durations would overlap another item. Choose another time.' };
    item.slot = nextSlot; item.pinned = true; other.slot = oldSlot; other.pinned = oldSlot !== null;
    return { ok: true, swapped: other.id, message: item.name + ' swapped with ' + other.name + '. ' + (oldSlot === null ? other.name + ' returned to Unscheduled tasks.' : 'Both times are pinned.') + ' Deadlines unchanged.' };
  }
  function carryUnfinishedTasks(model, today = dateKey(Date.now())) {
    if (!validDate(today)) return [];
    const carried = [];
    model.tasks.forEach(item => {
      const plannedDate = item.date || model.day;
      if (!isMeeting(item) && item.status !== 'Completed' && validDate(plannedDate) && plannedDate < today) {
        item.date = today; item.slot = null; item.pinned = false; carried.push(item.id);
      }
    });
    return carried;
  }
  function setTaskDuration(model, id, minutes) {
    const item = findItem(model, id), value = Number(minutes);
    if (!item || isMeeting(item) || item.project !== 'General' || item.status === 'Completed') return { ok: false, message: 'Choose an unfinished non-project task.' };
    if (!Number.isInteger(value) || value < 1 || value > 1440) return { ok: false, message: 'Enter a whole number from 1 to 1440 minutes.' };
    if (item.slot !== null && item.slot !== undefined && item.slot * QUARTER + Math.ceil(value / QUARTER) * QUARTER > DAY_END) return { ok: false, message: 'The task must finish by midnight. Shorten it or reschedule its start.' };
    item.estimateMinutes = value; item.duration = value + 'm';
    return { ok: true, message: 'Task duration updated. Recorded time is unchanged.' };
  }
  function replan(model, { allowOvertime = false, now = Date.now() } = {}) {
    const dayOfWeek = new Date(dayStart(model.day) + OFFSET).getUTCDay();
    const normalDay = dayOfWeek > 0 && dayOfWeek < 6;
    const firstAvailable = model.day === dateKey(now) ? Math.ceil(((now - dayStart(model.day)) / 60000 - DAY_START) / QUARTER) : 0;
    const start = Math.max(allowOvertime ? 0 : 35, firstAvailable), end = allowOvertime ? SLOT_COUNT : 72;
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
  // Persisted schedules before the 24-hour calendar counted slots from 08:00.
  // The marker makes this migration idempotent; timestamps remain unchanged.
  function normalizeModel(model) {
    if (model.slotOrigin !== 0) {
      const origin = Number.isFinite(model.slotOrigin) ? model.slotOrigin : 480;
      [...model.tasks, ...model.meetings].forEach(item => {
        if (Number.isFinite(item.slot)) item.slot += origin / QUARTER;
      });
      model.slotOrigin = 0;
    }
    model.tasks.forEach(task => { if (!task.date) task.date = model.day; });
    return model;
  }
  function itemInterval(model, item, date) {
    if (item.slot === null || item.slot === undefined) return null;
    const itemDate = item.date || model.day, duration = Number(item.estimateMinutes || item.length * QUARTER);
    const start = isMeeting(item) && item.scheduledStart ? Date.parse(item.scheduledStart) : dayStart(itemDate) + item.slot * QUARTER * 60000;
    const end = start + duration * 60000, from = dayStart(date), to = from + DAY;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= from || start >= to || end <= start) return null;
    return { item, start: Math.max(0, (start - from) / 60000), end: Math.min(DAY_END, (end - from) / 60000), continuesBefore: start < from, continuesAfter: end > to };
  }
  // A connected overlap group shares one lane count, so adjoining blocks never
  // cover one another. End-to-start neighbours can reuse the same lane.
  function calendarLayout(model, date = model.day) {
    const entries = [...model.tasks.filter(t => t.status !== 'Completed'), ...model.meetings]
      .map(item => itemInterval(model, item, date)).filter(Boolean)
      .sort((a, b) => a.start - b.start || b.end - a.end || String(a.item.id).localeCompare(String(b.item.id)));
    let group = [], groupEnd = -Infinity, laneEnds = [];
    const finishGroup = () => { group.forEach(entry => { entry.lanes = laneEnds.length; }); group = []; laneEnds = []; };
    entries.forEach(entry => {
      if (entry.start >= groupEnd) finishGroup();
      let lane = laneEnds.findIndex(end => end <= entry.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = entry.end; entry.lane = lane; group.push(entry);
      groupEnd = Math.max(groupEnd, entry.end);
    });
    finishGroup();
    return entries;
  }
  function planFromJSON(model, source, { now = Date.now(), projects = [] } = {}) {
    const fail = message => { throw new Error(message); };
    if (!source || typeof source !== 'object' || Array.isArray(source)) fail('Use a JSON object from the downloadable template.');
    if (![1, 2].includes(source.version) || source.timezone !== 'Asia/Singapore') fail('Use version 1 or 2 and timezone Asia/Singapore.');
    const period = source.version === 1 ? 'day' : source.period;
    if (!['day', 'week', 'month'].includes(period)) fail('Set period to day, week or month.');
    if (!validDate(source.date)) fail('Set date to a valid YYYY-MM-DD anchor date.');
    if (source.date !== model.day) fail('This import is anchored on ' + model.day + '. Use the date shown in My day or navigate to the template date.');
    if (typeof source.allowOvertime !== 'boolean') fail('Set allowOvertime to true or false.');
    const maximum = source.version === 1 ? 200 : 1000;
    if (!Array.isArray(source.tasks) || !Array.isArray(source.meetings) || source.tasks.length + source.meetings.length < 1 || source.tasks.length + source.meetings.length > maximum) fail('Include between 1 and ' + maximum + ' tasks and meetings.');
    const [from, to] = periodBounds(period, dayStart(source.date)), startDate = dateKey(from), endDate = dateKey(to - 1);
    const copy = normalizeModel(JSON.parse(JSON.stringify(model))), selectedDate = copy.day;
    const seen = new Set([...copy.tasks, ...copy.meetings].map(x => x.importKey).filter(Boolean)), added = [], dates = new Set();
    const originalPins = new Map(copy.tasks.map(task => [String(task.id), task.pinned]));
    copy.tasks.forEach(task => { task.pinned = true; });
    function fields(row, type, index) {
      const label = type + ' ' + (index + 1);
      if (!row || typeof row !== 'object' || Array.isArray(row)) fail(label + ': expected an object.');
      const date = source.version === 1 ? (row.date || source.date) : row.date;
      if (!validDate(date) || dayStart(date) < from || dayStart(date) >= to) fail(label + ': date must be within ' + startDate + ' and ' + endDate + '.');
      if (typeof row.id !== 'string' || !row.id.trim() || row.id.length > 100) fail(label + ': provide a unique id of up to 100 characters.');
      const importKey = date + ':' + row.id.trim();
      if (seen.has(importKey)) fail(label + ': id "' + row.id + '" was already imported or appears twice on this date.');
      seen.add(importKey); dates.add(date);
      if (typeof row.title !== 'string' || !row.title.trim() || row.title.length > 200) fail(label + ': enter a title of up to 200 characters.');
      const project = row.project || 'General';
      if (project !== 'General' && !projects.includes(project)) fail(label + ': project "' + project + '" does not exist. Use its exact name or leave project blank.');
      if (!Number.isInteger(row.durationMinutes) || row.durationMinutes < 1 || row.durationMinutes > 1440) fail(label + ': durationMinutes must be a whole number from 1 to 1440.');
      if (row.startTime !== undefined && typeof row.startTime !== 'string') fail(label + ': startTime must be HH:MM or empty.');
      return { name: row.title.trim(), project, date, estimateMinutes: row.durationMinutes, importKey };
    }
    function timeSlot(value, duration, label) {
      if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) fail(label + ': use HH:MM for startTime.');
      const [hour, minute] = value.split(':').map(Number), total = hour * 60 + minute;
      if (hour > 23 || minute > 59 || minute % QUARTER) fail(label + ': startTime must be a 15-minute time from 00:00 to 23:45.');
      if (total + duration > DAY_END) fail(label + ': the duration crosses midnight. Split it into an item on each date.');
      return total / QUARTER;
    }
    source.meetings.forEach((row, index) => {
      const values = fields(row, 'Meeting', index);
      if (!['client', 'internal'].includes(row.kind)) fail('Meeting ' + (index + 1) + ': kind must be client or internal.');
      const slot = timeSlot(row.startTime, values.estimateMinutes, 'Meeting ' + (index + 1));
      const meeting = { ...values, id: 'json-meeting-' + (++copy.serial), kind: row.kind, slot, length: Math.ceil(values.estimateMinutes / QUARTER), pinned: true, scheduledStart: new Date(dayStart(values.date) + slot * QUARTER * 60000).toISOString() };
      copy.meetings.push(meeting); added.push(meeting);
    });
    source.tasks.forEach((row, index) => {
      const values = fields(row, 'Task', index);
      if (row.due !== undefined && typeof row.due !== 'string') fail('Task ' + (index + 1) + ': due must be YYYY-MM-DD or empty.');
      copy.day = values.date;
      const result = addTask(copy, { ...values, priority: row.priority, due: row.due }, now);
      if (!result.ok) fail('Task ' + (index + 1) + ': ' + Object.values(result.errors).join(' '));
      Object.assign(result.task, { importKey: values.importKey });
      if (row.startTime) { result.task.slot = timeSlot(row.startTime, values.estimateMinutes, 'Task ' + (index + 1)); result.task.pinned = true; }
      added.push(result.task);
    });
    dates.forEach(date => { copy.day = date; replan(copy, { allowOvertime: source.allowOvertime, now }); });
    copy.day = selectedDate;
    copy.tasks.forEach(task => { if (originalPins.has(String(task.id))) task.pinned = originalPins.get(String(task.id)); });
    const addedIds = new Set(added.map(item => String(item.id))); let overlapCount = 0;
    dates.forEach(date => {
      const entries = calendarLayout(copy, date);
      for (let a = 0; a < entries.length; a++) for (let b = a + 1; b < entries.length; b++) {
        if ((addedIds.has(String(entries[a].item.id)) || addedIds.has(String(entries[b].item.id))) && overlaps(entries[a].start, entries[a].end, entries[b].start, entries[b].end)) overlapCount++;
      }
    });
    return { model: copy, added, unscheduled: added.filter(task => !isMeeting(task) && task.slot === null).length, overlaps: overlapCount, period, startDate, endDate };
  }
  function makeTemplate(model, period = 'day') {
    if (!['day', 'week', 'month'].includes(period)) period = 'day';
    const [from, to] = periodBounds(period, dayStart(model.day)), first = dateKey(from), second = dateKey(Math.min(to - DAY, from + (period === 'month' ? 7 : 1) * DAY));
    return {
      version: 2, timezone: 'Asia/Singapore', period, date: model.day, allowOvertime: true,
      instructions: 'Use unique IDs per date. Dates must be within ' + first + ' to ' + dateKey(to - 1) + '. Explicit startTime accepts 00:00–23:45 in 15-minute steps; overlaps appear side by side. A blank task startTime finds free time; allowOvertime controls automatic placement only (false: weekdays 08:45–18:00; true: all 24 hours). Split work crossing midnight into one item per date. Existing items are preserved; re-imported IDs are rejected.',
      tasks: [{ id: 'task-1', date: first, title: 'Prepare meeting notes', project: '', durationMinutes: 30, priority: 'Normal', due: '', startTime: '09:00' }, { id: 'task-2', date: second, title: 'Follow up', project: '', durationMinutes: 30, priority: 'Normal', due: '', startTime: '' }],
      meetings: [{ id: 'meeting-1', date: first, title: 'Planning call', project: '', kind: 'internal', durationMinutes: 60, startTime: '09:00' }]
    };
  }
  const Core = { normalizeModel, calendarLayout, makeTemplate, planFromJSON, carryUnfinishedTasks, setTaskDuration, QUARTER, DAY_START, DAY_END, SLOT_COUNT, dateKey, dayStart, shiftDate, slotLabel, slotsFor, overlaps, allItems, createModel, addTask, canPlace, moveItem, replan, startItem, pauseItem, finishTask, elapsedFor, mergeIntervals, periodBounds, normalMilliseconds, reportEntries, upsertMeeting, computeReport, clockText, durationText };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  root.DayPlannerCore = Core;
  root.createDayPlanner = function ({ document, toast, modal, projectOptions = () => [], onTasksChanged = () => {}, onMeetingsChanged = () => {}, now = () => Date.now(), model = createModel({ now: now() }), setInterval: interval = root.setInterval?.bind(root) }) {
    const $ = id => document.getElementById(id), esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let drag = null, timer = null, detailId = null, detailTrigger = null, scrolledDate = null, weekScrollKey = null, newestTaskId = null, todoSort = {key:'due',direction:1}, durationDraft = null;
    normalizeModel(model);
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
      if (detailId && $('dp-detail')?.open) { renderDetails(); $('dp-detail-body').querySelector('[data-planner-action="' + intent.action + '"]')?.focus(); return; }
      const selector = '[data-planner-item="' + intent.itemId + '"]', host = $('day-todo') && !$('day-todo').hidden ? $('todo-list') : calendarView === 'day' ? $('schedule') : $('calendar-overview'), card = Array.from(host?.querySelectorAll(selector) || []).find(node => !node.getClientRects || node.getClientRects().length) || $('backlog').querySelector(selector);
      const target = card?.querySelector('[data-planner-action="' + intent.action + '"]') || card?.querySelector('[data-planner-action="timer"]') || (['BUTTON','TR'].includes(card?.tagName?.toUpperCase()) ? card : null);
      if (target) target.focus(); else { $('timer-name').tabIndex = -1; $('timer-name').focus(); }
    }
    const commit = (intent = focusedItem()) => { onMeetingsChanged(model.meetings); render(); onTasksChanged(model.tasks); restoreItemFocus(intent); };
    const outsideCalendar = event => !event.target?.closest?.('#schedule,#calendar-overview');
    document.addEventListener?.('dragover', event => {
      const item = findItem(model, drag);
      if (item && !isMeeting(item) && item.slot !== null && outsideCalendar(event)) event.preventDefault();
    });
    document.addEventListener?.('drop', event => {
      if (event.defaultPrevented) return;
      const item = findItem(model, drag);
      if (!item || isMeeting(item) || item.slot === null || !outsideCalendar(event)) return;
      event.preventDefault();
      const result = moveItem(model, item.id, null);
      drag = null;
      if(result.ok){setBacklogOpen(true);commit({itemId:item.id,action:'move'});}
      tell(result);
    });
    const button = (text, click) => { const b = element('button', text); b.type = 'button'; b.onclick = click; return b; };
    function requestStart(item) {
      const activeTask = model.sessions.find(s => s.kind === 'task' && s.end === null);
      if (activeTask && String(activeTask.itemId) !== String(item.id)) {
        closeDetails();
        modal('<h2>Another task is running</h2><p>' + esc(activeTask.name) + ' is being timed.</p><div class="row"><button id="dp-switch">Pause task &amp; start ' + (isMeeting(item) ? 'meeting' : 'task') + '</button>' + (isMeeting(item) ? '<button id="dp-overlap">Continue task &amp; start meeting</button>' : '') + '<button id="dp-cancel">Cancel</button></div>');
        $('dp-switch').onclick = () => { pauseItem(model, activeTask.itemId, now()); tell(startItem(model, item.id, now())); closeModal(); commit({ itemId: item.id, action: 'timer' }); };
        if ($('dp-overlap')) $('dp-overlap').onclick = () => { tell(startItem(model, item.id, now())); closeModal(); commit({ itemId: item.id, action: 'timer' }); toast('Both timers continue. Overall working time counts overlapping minutes once.'); };
        $('dp-cancel').onclick = closeModal; $('dp-switch').focus(); return;
      }
      tell(startItem(model, item.id, now())); commit({ itemId: item.id, action: 'timer' });
    }
    function moveDialog(item, date = item.date || model.day) {
      closeDetails();
      modal('<h2>Move ' + esc(item.name) + '</h2><form id="dp-move-form"><label for="dp-move-date">Date</label><input id="dp-move-date" type="date" value="' + esc(date) + '" required><label for="dp-move-slot">Start time (Singapore)</label><select id="dp-move-slot">' + (!isMeeting(item) ? '<option value="">Unscheduled</option>' : '') + Array.from({ length: SLOT_COUNT }, (_, i) => '<option value="' + i + '"' + (i === item.slot ? ' selected' : '') + '>' + slotLabel(i) + '</option>').join('') + '</select><p>Reserves ' + slotsFor(item) * QUARTER + ' minutes. Overlapping items are shown side by side. Removing a task from the schedule keeps its time records.</p><p id="dp-move-error" class="field-error" role="alert"></p><button type="submit">Move item</button></form>');
      if (item.slot === null) $('dp-move-slot').value = '';
      $('dp-move-form').onsubmit = e => { e.preventDefault(); const value = $('dp-move-slot').value; const result = moveItem(model, item.id, value === '' ? null : Number(value), {allowOverlap:true,date:$('dp-move-date').value}); if (!result.ok) { $('dp-move-error').textContent = result.message; return; } closeModal(); commit({ itemId: item.id, action: 'move' }); tell(result); };
      $('dp-move-slot').focus();
    }
    function editMeetingActual(item) {
      closeDetails();
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
      const cardTags=element('div',undefined,'backlog-tags');node.append(cardTags);
      cardTags.append(element('span', (meeting ? item.kind === 'client' ? 'Client meeting' : 'Internal project meeting' : item.project === 'General' ? 'Non-project task' : 'Project task') + (item.pinned ? ' · Pinned' : '') + (overdue ? ' · Overdue' : ''), 'badge' + (overdue ? ' warn' : '')));
      const title=element('strong');const titleButton=button(item.name,()=>openDetails(item,titleButton));titleButton.className='backlog-title';title.append(titleButton);node.append(title);
      const reservation = slotsFor(item) * QUARTER;
      if(!scheduled&&!meeting){
        node.classList.add('backlog-card');
        const categoryTag=node.querySelector('.badge');categoryTag.textContent=item.project==='General'?'Non-project task':'Project task';categoryTag.className='task-category '+category(item);
        if(overdue)cardTags.append(element('span','Overdue · '+new Date(dayStart(item.due)).toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',day:'numeric',month:'short'}),'backlog-overdue badge'));
        node.append(element('small',item.project||'General','backlog-project'));
        const meta=element('div',undefined,'backlog-meta');meta.append(element('span',item.estimateMinutes+'m'+(reservation!==item.estimateMinutes?' · '+reservation+'m reserved':'')),element('span',item.priority||'Normal',item.priority==='High'?'detail-overdue-text':''));node.append(meta);
      }else {
      node.append(element('small', (item.project || 'General') + ' · ' + item.estimateMinutes + 'm estimate' + (reservation !== item.estimateMinutes ? ' · ' + reservation + 'm reserved' : '') + (!meeting ? ' · ' + item.priority + ' priority' + (item.due ? ' · Due ' + item.due : '') : '') + (scheduled ? ' · ' + (meeting && item.scheduledStart ? new Date(Date.parse(item.scheduledStart)+OFFSET).toISOString().slice(11,16)+'–'+new Date(Date.parse(item.scheduledStart)+OFFSET+item.estimateMinutes*60000).toISOString().slice(11,16) : slotLabel(item.slot) + '–' + slotLabel(itemEnd(item))) : '')));
      }
      node.ondragstart = e => { drag = item.id; e.dataTransfer?.setData('text/plain', String(item.id)); }; node.ondragend = () => { drag = null; };
      const controls = element('div', undefined, 'row');
      const active = openSession(model, item.id);
      const timerButton = button(active ? meeting ? 'End meeting' : 'Pause' : item.status === 'Paused' || elapsedFor(model, item.id, now()) ? 'Resume' : 'Start', () => { if (active) { pauseItem(model, item.id, now()); commit({ itemId: item.id, action: 'timer' }); toast(meeting ? 'Meeting time recorded.' : 'Task paused.'); } else requestStart(item); }); timerButton.className = 'primary'; timerButton.dataset.plannerAction = 'timer'; controls.append(timerButton);
      if (meeting) { const actualButton = button('Correct actual time', () => editMeetingActual(item)); actualButton.dataset.plannerAction = 'actual'; controls.append(actualButton); }
      const moveButton = button('Reschedule', () => moveDialog(item)); moveButton.dataset.plannerAction = 'move'; controls.append(moveButton);
      if (!scheduled && !meeting && item.project === 'General') { const durationButton = button('Edit duration', () => openDetails(item, durationButton)); durationButton.dataset.plannerAction='duration';controls.append(durationButton); }
      if (!meeting && scheduled) { const unpin = button(item.pinned ? 'Unpin' : 'Pin', () => { item.pinned = !item.pinned; commit({ itemId: item.id, action: 'timer' }); toast(item.pinned ? 'Time pinned.' : 'Task unpinned. Replan may move it.'); }); unpin.dataset.plannerAction = 'unpin'; controls.append(unpin); }
      if (!meeting && scheduled) {
        const remove = button('Remove from schedule', () => { const result = moveItem(model, item.id, null); setBacklogOpen(true); closeDetails(); commit(); tell(result); }); remove.className = 'planner-remove'; remove.dataset.plannerAction = 'remove'; controls.append(remove);
      }
      if (!meeting) {
        const finish = button('Mark complete', () => { finishTask(model, item.id, now()); closeDetails(); commit(); toast('Task completed. Time records retained.'); }); finish.dataset.plannerAction='complete';finish.setAttribute('aria-label','Mark complete');finish.title='Mark '+item.name+' complete';controls.append(finish);
      }
      node.append(controls); return node;
    }
    function renderTimer() {
      const task = findItem(model, model.currentTaskId);
      $('timer-name').textContent = task ? task.name + ' · ' + (task.status === 'Completed' ? 'Completed' : openSession(model, task.id) ? 'Running' : 'Paused') : 'No task started';
      $('timer-value').textContent = task ? clockText(elapsedFor(model, task.id, now())) : '00:00:00';
      const enabled = task && task.status !== 'Completed';
      $('pause').disabled = !enabled; $('finish').disabled = !enabled; $('pause').hidden = $('finish').hidden = !enabled;
      if ($('planner-timer-bar')) $('planner-timer-bar').hidden = !enabled && !model.sessions.some(s => s.kind === 'meeting' && s.end === null);
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
    function category(item) { return isMeeting(item) ? item.kind : item.project === 'General' ? 'nonproject' : 'project-task'; }
    function closeDetails() { if ($('dp-detail')?.open) $('dp-detail').close(); detailId = null; }
    function renderDetails() {
      const item = findItem(model, detailId), host = $('dp-detail-body'); if (!item || !host) return;
      const detailTitle=$('dp-detail-title');detailTitle.textContent=item.name;
      host.replaceChildren();
      const details = card(item, item.slot !== null);
      const action = name => details.querySelector('[data-planner-action="'+name+'"]');
      const tags=element('div',undefined,'planner-detail-tags');
      tags.append(element('span',isMeeting(item)?(item.kind==='client'?'Client meeting':'Internal meeting'):item.project==='General'?'Non-project task':'Project task','task-category '+category(item)));
      const late=!isMeeting(item)&&item.due&&item.due<dateKey(now())&&item.status!=='Completed';
      if(late)tags.append(element('span','Overdue','badge detail-overdue'));
      const pin=action('unpin');if(pin){pin.classList.add('detail-pin');tags.append(pin)}
      host.append(tags,detailTitle);
      const timeCard=element('section',undefined,'planner-detail-time'),timeCopy=element('div');
      const start=isMeeting(item)&&item.scheduledStart?new Date(Date.parse(item.scheduledStart)+OFFSET).toISOString().slice(11,16):slotLabel(item.slot);
      const end=isMeeting(item)&&item.scheduledStart?new Date(Date.parse(item.scheduledStart)+OFFSET+item.estimateMinutes*60000).toISOString().slice(11,16):slotLabel(itemEnd(item));
      timeCopy.append(element('strong',item.slot===null?'Unscheduled':start+' – '+end),element('p',longDate(item.date||model.day)+' · '+item.estimateMinutes+' min · GMT+8','muted'));
      timeCard.append(timeCopy);if(action('move'))timeCard.append(action('move'));host.append(timeCard);
      const metadata=element('dl',undefined,'planner-detail-fields');
      [['Project',item.project||'General'],['Due',item.due?longDate(item.due):'No deadline'],['Priority',item.priority||'Normal'],['Status',item.status||'Scheduled'],['Estimate',item.estimateMinutes+' minutes']].forEach(([label,value])=>{const dd=element('dd',value);if(label==='Due'&&late)dd.className='detail-overdue-text';if(label==='Status'){dd.replaceChildren(element('span',value,'badge detail-status'))}metadata.append(element('dt',label),dd)});
      host.append(metadata);
      if (!isMeeting(item) && item.project === 'General' && item.status !== 'Completed') {
        const form = element('form', undefined, 'planner-duration-form');
        const label = element('label', 'Duration (minutes)'); label.setAttribute('for','dp-duration');
        const input = element('input'); input.id='dp-duration'; input.type='number'; input.min='1'; input.max='1440'; input.step='1'; input.value=durationDraft?.id===item.id?durationDraft.value:String(item.estimateMinutes); input.required=true; input.setAttribute('aria-describedby','dp-duration-help dp-duration-error');
        const help = element('p', '', 'muted'); help.id='dp-duration-help';
        const updateHelp = () => { const minutes=Number(input.value); help.textContent=item.slot===null?'Changes the estimate; this task remains unscheduled.':Number.isInteger(minutes)&&minutes>0&&item.slot*QUARTER+minutes<=DAY_END?'Scheduled end: '+timeLabel(item.slot*QUARTER+minutes)+'. Overlaps appear side by side.':'The task must finish by midnight.'; };
        input.oninput=()=>{durationDraft={id:item.id,value:input.value};updateHelp()}; updateHelp();
        const error = element('p', '', 'field-error'); error.id='dp-duration-error'; error.setAttribute('role','alert');
        const actions = element('div', undefined, 'row'), save = button('Save duration', () => {}), cancel = button('Cancel', () => {durationDraft=null;input.value=String(item.estimateMinutes);error.textContent='';input.removeAttribute('aria-invalid');updateHelp();input.focus();}); save.type='submit';save.dataset.plannerAction='duration';actions.append(save,cancel);
        form.append(label,input,help,error,actions);form.onsubmit=e=>{e.preventDefault();const result=setTaskDuration(model,item.id,input.value);if(!result.ok){error.textContent=result.message;input.setAttribute('aria-invalid','true');input.focus();return;}durationDraft=null;commit({itemId:item.id,action:'duration'});tell(result);};host.append(form);
      }
      if (item.notes) host.append(element('h3', 'Notes'), element('p', item.notes, 'planner-detail-notes'));
      const footer=element('div',undefined,'planner-detail-footer'),primary=element('div',undefined,'detail-primary-actions');
      if(action('timer'))primary.append(action('timer'));if(action('complete'))primary.append(action('complete'));footer.append(primary);
      if(action('actual'))footer.append(action('actual'));
      if(action('remove')){const removal=element('div',undefined,'detail-unschedule');removal.append(element('p','Move back to Unscheduled. Timer and logged time are kept.','muted'),action('remove'));footer.append(removal)}
      host.append(footer);
    }
    function openDetails(item, trigger) {
      if(detailId!==item.id)durationDraft=null; detailId = item.id; detailTrigger = trigger || document.activeElement;
      if (!$('dp-detail')) {
        const drawer = element('dialog'); drawer.id = 'dp-detail'; drawer.className = 'planner-detail'; drawer.setAttribute('aria-labelledby', 'dp-detail-title');
        const head = element('div', undefined, 'planner-detail-head'), title = element('h2'); title.id = 'dp-detail-title';
        const close = button('×', closeDetails); close.id = 'dp-detail-close';close.setAttribute('aria-label','Close task details'); head.append(title, close);
        const body = element('div'); body.id = 'dp-detail-body'; drawer.append(head, body); document.body.append(drawer);
        drawer.addEventListener('close', () => {
          detailId = null; durationDraft=null;
          const inTodo = $('day-todo') && !$('day-todo').hidden;
          const host = $('day-todo') && !$('day-todo').hidden ? $('todo-list') : calendarView === 'day' ? $('schedule') : $('calendar-overview');
          const visibleMatch = nodes => Array.from(nodes || []).find(node => node.dataset.plannerItem === drawer.dataset.itemId && (!node.getClientRects || node.getClientRects().length));
          const replacement = visibleMatch(host?.querySelectorAll('[data-planner-item]'));
          const backlogItem = visibleMatch($('backlog')?.querySelectorAll('[data-planner-item]'));
          const target = replacement || backlogItem?.querySelector('button') || (detailTrigger?.isConnected ? detailTrigger : inTodo ? $('day-todo-tab') : $('calendar-date-toggle') || $('calendar-heading'));
          target?.focus();
        });
        drawer.addEventListener('click', event => { if (event.target === drawer) { const bounds = drawer.getBoundingClientRect(); if (event.clientX < bounds.left) closeDetails(); } });
      }
      $('dp-detail').dataset.itemId = String(item.id); renderDetails(); if (!$('dp-detail').open) $('dp-detail').showModal(); $('dp-detail-close').focus();
    }
    function compactEvent(entry, timed = true) {
      const {item,start,end,lane,lanes} = entry;
      const range = item.slot === null ? 'Unscheduled' : timeLabel(start) + '–' + timeLabel(end);
      const b = button('', () => openDetails(item, b)); b.className = 'calendar-event ' + category(item) + (timed ? ' calendar-timed' : ''); b.dataset.plannerItem = String(item.id);
      b.title = item.name + ' · ' + range + (lanes > 1 ? ' · Overlaps other work' : '');
      b.setAttribute('aria-label', item.name + ', ' + range + ', ' + (isMeeting(item) ? item.kind + ' meeting' : 'task') + (item.pinned ? ', pinned' : '') + (lanes > 1 ? ', overlaps other work' : '') + '. View details');
      const short = timed && end - start < 45;
      b.append(element('strong', (short ? timeLabel(start) + ' · ' : '') + item.name), element('span', range, 'calendar-event-time'));
      if (item.pinned) { const pin = element('span', '⚑', 'calendar-pin'); pin.setAttribute('aria-hidden','true'); b.append(pin); }
      if (calendarView === 'week') b.title += ' · Drag to another day or time';
      if (timed) { b.style.top = (start / 1440 * 100) + '%'; b.style.height = ((end - start) / 1440 * 100) + '%'; b.style.left = (lane / lanes * 100) + '%'; b.style.width = 'calc(' + (100 / lanes) + '% - var(--ui-space-1))'; if (end - start < 45) b.classList.add('calendar-short'); }
      b.draggable = calendarView === 'day' || calendarView === 'week'; b.ondragstart = e => { drag = item.id; e.dataTransfer?.setData('text/plain', String(item.id)); }; b.ondragend = () => { drag = null; };
      if (calendarView === 'day') {
        b.ondragover = e => e.preventDefault();
        b.ondrop = e => { e.preventDefault(); const bounds = b.getBoundingClientRect(), minute = start + Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height)) * (end - start); const result = moveItem(model, e.dataTransfer?.getData('text/plain') || drag, Math.min(SLOT_COUNT-1,Math.floor(minute/QUARTER)), {allowOverlap:true,date:model.day}); if(result.ok)commit(); tell(result); };
      }
      return b;
    }
    function renderTodo() {
      const host=$('todo-list');if(!host)return;
      const rows=model.tasks.filter(item=>item.status!=='Completed'&&!isMeeting(item));
      const value=(item,key)=>key==='slot'?(item.slot===null?1441:item.slot):key==='estimate'?Number(item.estimateMinutes):key==='due'?(item.due||'9999-12-31'):key==='priority'?priorities.indexOf(item.priority):String(item[key]||'');
      rows.sort((a,b)=>{const left=value(a,todoSort.key),right=value(b,todoSort.key);return(typeof left==='number'?left-right:left.localeCompare(right,undefined,{numeric:true,sensitivity:'base'}))*todoSort.direction});
      $('todo-count').textContent=rows.length+' task'+(rows.length===1?'':'s');
      const headers=[['name','Task'],['project','Project'],['date','Planned date'],['slot','Time'],['estimate','Duration'],['due','Deadline'],['priority','Priority'],['status','Status']];
      host.innerHTML=rows.length?'<table class="register-table todo-table"><thead><tr>'+headers.map(([key,label])=>'<th scope="col" aria-sort="'+(todoSort.key===key?(todoSort.direction===1?'ascending':'descending'):'none')+'"><button type="button" class="column-sort" data-todo-sort="'+key+'">'+label+' <span aria-hidden="true">'+(todoSort.key===key?(todoSort.direction===1?'↑':'↓'):'↕')+'</span></button></th>').join('')+'</tr></thead><tbody>'+rows.map(item=>'<tr class="record-row" data-planner-item="'+esc(item.id)+'" data-todo-item="'+esc(item.id)+'" tabindex="0" aria-label="View '+esc(item.name)+' task details"><td data-label="Task" title="'+esc(item.name)+'"><strong>'+esc(item.name)+'</strong></td><td data-label="Project">'+esc(item.project==='General'?'No project':item.project)+'</td><td data-label="Planned date">'+esc(longDate(item.date||model.day))+'</td><td data-label="Time">'+(item.slot===null?'Unscheduled':slotLabel(item.slot))+'</td><td data-label="Duration" class="pp-number">'+item.estimateMinutes+' min</td><td data-label="Deadline">'+esc(item.due?longDate(item.due):'—')+'</td><td data-label="Priority">'+esc(item.priority)+'</td><td data-label="Status"><span class="badge">'+esc(item.status)+'</span></td></tr>').join('')+'</tbody></table>':'<p class="muted">No unfinished tasks. Add a task whenever something comes up.</p>';
      host.onclick=e=>{const sort=e.target.closest('[data-todo-sort]');if(sort){const key=sort.dataset.todoSort;todoSort={key,direction:todoSort.key===key?-todoSort.direction:1};renderTodo();host.querySelector('[data-todo-sort="'+key+'"]').focus();return;}const row=e.target.closest('[data-todo-item]');if(row){const item=findItem(model,row.dataset.todoItem);if(item)openDetails(item,row)}};
      host.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-todo-item]')){e.preventDefault();const item=findItem(model,e.target.dataset.todoItem);if(item)openDetails(item,e.target)}};
    }
    function updateNow() {
      const line = $('planner-now'); if (!line) return;
      const minutes = (now() - dayStart(model.day)) / 60000;
      line.hidden = minutes < 0 || minutes >= 1440;
      line.style.top = (minutes / 1440 * 100) + '%'; line.setAttribute('aria-label', 'Current Singapore time ' + timeLabel(Math.floor(minutes)));
    }
    function render() {
      const backlog = model.tasks.filter(t => t.status !== 'Completed' && t.slot === null);
      $('backlog-count').textContent = backlog.length + (backlog.length === 1 ? ' task' : ' tasks'); if ($('calendar-backlog-toggle')) { $('calendar-backlog-toggle').textContent = 'Unscheduled · ' + backlog.length; $('calendar-backlog-toggle').dataset.count=String(backlog.length); $('calendar-backlog-toggle').setAttribute('aria-label','Unscheduled tasks: '+backlog.length); } $('backlog').replaceChildren();
      if (!backlog.length) $('backlog').append(element('p', 'No unscheduled tasks. Add a task whenever something comes up.', 'muted'));
      backlog.forEach(t => { const node=card(t,false); if(String(t.id)===String(newestTaskId))node.classList.add('task-new'); $('backlog').append(node); });
      const completed = model.tasks.filter(t => t.date===model.day && t.status === 'Completed');
      if (completed.length) { const details = element('details'), summary = element('summary', 'Completed tasks (' + completed.length + ')'); details.append(summary); completed.forEach(t => details.append(element('p', t.name + ' · ' + durationText(elapsedFor(model, t.id, now()))))); $('backlog').append(details); }
      const scroll = $('schedule').scrollTop; $('schedule').replaceChildren();
      const grid = element('div', undefined, 'planner-time-grid'), events = element('div', undefined, 'planner-events');
      for (let i = 0; i < SLOT_COUNT; i++) {
        const row = element('div', undefined, 'hour'); row.dataset.plannerSlot = String(i);
        const label = element('span', slotLabel(i)), slot = element('div', undefined, 'slot');
        slot.ondragover = e => e.preventDefault(); slot.ondrop = e => { e.preventDefault(); const id = e.dataTransfer?.getData('text/plain') || drag; const result = moveItem(model, id, i, {allowOverlap:true,date:model.day}); if (result.ok) commit(); tell(result); };
        if (i % 4 === 0) row.classList.add('hour-major'); row.append(label, slot); grid.append(row);
      }
      calendarLayout(model, model.day).forEach(entry => events.append(compactEvent(entry)));
      const line = element('div', undefined, 'now'); line.id = 'planner-now'; line.setAttribute('role', 'img'); events.append(line); grid.append(events); $('schedule').append(grid);
      $('schedule').scrollTop = scroll;
      if (scrolledDate !== model.day) { const first = calendarLayout(model, model.day)[0]; const minute = first ? first.start : model.day === dateKey(now()) ? Math.max(0,(now()-dayStart(model.day))/60000-60) : 8*60; $('schedule').scrollTop = minute/15 * (grid.offsetHeight / SLOT_COUNT); scrolledDate=model.day; }
      renderTimer(); renderReports(); updateNow(); renderCalendar(); renderTodo(); if (detailId) renderDetails();
    }
    const longDate=date=>new Date(dayStart(date)).toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',day:'numeric',month:'long',year:'numeric'});
    function calendarDates(){const dow=new Date(dayStart(model.day)+OFFSET).getUTCDay();if(calendarView==='week'){const first=shiftDate(model.day,-((dow+6)%7));return Array.from({length:7},(_,i)=>shiftDate(first,i));}const first=model.day.slice(0,7)+'-01',weekday=new Date(dayStart(first)+OFFSET).getUTCDay(),start=shiftDate(first,-((weekday+6)%7));return Array.from({length:42},(_,i)=>shiftDate(start,i));}
    function chooseDay(date){if(!validDate(date))return;if(root.DraftGuard&&!root.DraftGuard.canLeave())return;closeDetails();model.day=date;render();onTasksChanged(model.tasks);}
    function renderCalendar(){
      const overview=$('calendar-overview'); if(!overview)return; model.calendarView=calendarView;
      $('calendar-date').value=model.day; $('calendar-day').hidden=calendarView!=='day'; overview.hidden=calendarView==='day';
      document.querySelectorAll('[data-calendar-view]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.calendarView===calendarView));b.classList.toggle('primary',b.dataset.calendarView===calendarView)});
      const dates=calendarDates(); $('calendar-heading').textContent=calendarView==='month'?new Date(dayStart(model.day)).toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',month:'long',year:'numeric'}):calendarView==='week'?(dates[0].slice(0,7)===dates[6].slice(0,7)?String(Number(dates[0].slice(-2))):new Date(dayStart(dates[0])).toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',day:'numeric',month:'short'}))+'–'+new Date(dayStart(dates[6])).toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',day:'numeric',month:'short',year:'numeric'}):longDate(model.day);
      if(calendarView==='week') { const format=(date,options)=>new Date(dayStart(date)).toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',...options}); $('calendar-heading').textContent=dates[0].slice(0,7)===dates[6].slice(0,7)?format(dates[0],{month:'long',year:'numeric'}):format(dates[0],{month:'short',...(dates[0].slice(0,4)!==dates[6].slice(0,4)?{year:'numeric'}:{})})+' – '+format(dates[6],{month:'short',year:'numeric'}); }
      const summary=document.querySelector('.timeline-summary'); if(summary)summary.textContent=(model.day===dateKey(now())?'Today’s timeline':'Timeline · '+longDate(model.day)); if(calendarView==='day')return;
      const previousScroll=overview.scrollTop; overview.className='panel calendar-overview calendar-'+calendarView; overview.replaceChildren();
      if(calendarView==='week'){
        const axis=element('div',undefined,'calendar-hour-axis'); axis.append(element('div','SGT','calendar-date-button'));
        const hours=element('div',undefined,'calendar-hours');for(let i=0;i<24;i++)hours.append(element('span',timeLabel(i*60)));axis.append(hours);overview.append(axis);
      }
      dates.forEach(date=>{
        const cell=element('section',undefined,'calendar-cell '+(date===dateKey(now())?'calendar-current ':'')+(calendarView==='month'&&date.slice(0,7)!==model.day.slice(0,7)?'calendar-adjacent':''));
        if([0,6].includes(new Date(date+'T12:00:00Z').getUTCDay()))cell.classList.add('calendar-weekend');
        const heading=button(new Date(dayStart(date)).toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',weekday:'short',day:'numeric',month:'short'}),()=>{calendarView='day';chooseDay(date)});heading.className='calendar-date-button';if(calendarView==='week'){const dateLabel=element('span',undefined,'calendar-date-label');dateLabel.append(element('span',String(Number(date.slice(-2))),'calendar-day-number'),element('span',new Date(dayStart(date)).toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',month:'short'}),'calendar-month-label'));heading.replaceChildren(element('span',new Date(dayStart(date)).toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',weekday:'short'}),'calendar-weekday'),dateLabel);if(date===dateKey(now()))heading.setAttribute('aria-current','date');}heading.dataset.calendarDate=date;heading.setAttribute('aria-label','Open '+longDate(date));cell.append(heading);
        const items=element('div',undefined,'calendar-items');items.dataset.calendarDay=date;
        if(calendarView==='week'){
          items.ondragover=e=>{e.preventDefault();items.classList.add('calendar-drop-target')};
          items.ondragleave=e=>{if(!items.contains(e.relatedTarget))items.classList.remove('calendar-drop-target')};
          items.ondrop=e=>{e.preventDefault();e.stopPropagation();items.classList.remove('calendar-drop-target');const bounds=items.getBoundingClientRect(),minute=Math.max(0,Math.min(1439,(e.clientY-bounds.top)/bounds.height*1440)),id=e.dataTransfer?.getData('text/plain')||drag;const result=moveItem(model,id,Math.floor(minute/QUARTER),{allowOverlap:true,date});if(result.ok)commit({itemId:id,action:'timer'});tell(result)};
          cell.ondragover=e=>e.preventDefault();cell.ondrop=e=>{e.preventDefault();e.stopPropagation();const item=findItem(model,e.dataTransfer?.getData('text/plain')||drag);if(item){moveDialog(item,date);if(item.slot===null)$('dp-move-slot').value='36';}};
        }
        const entries=calendarLayout(model,date);
        entries.forEach(entry=>items.append(compactEvent(entry,calendarView==='week')));
        if(!entries.length&&calendarView==='month')items.append(element('p','No items','muted'));
        cell.append(items);
        if(calendarView==='week'){
          const agenda=element('div',undefined,'calendar-week-agenda');let group=null,until=-1;
          entries.forEach(entry=>{if(entry.start>=until){group=element('div',undefined,'calendar-agenda-group');group.style.gridTemplateColumns='repeat('+entry.lanes+', minmax(0,1fr))';agenda.append(group);until=entry.end;}else until=Math.max(until,entry.end);const event=compactEvent(entry,false);event.style.gridColumn=String(entry.lane+1);group.append(event);});
          if(!entries.length)agenda.append(element('p','No scheduled items','muted'));cell.append(agenda);
        }

        overview.append(cell);
      });overview.scrollTop=previousScroll;
      if(calendarView==='week' && weekScrollKey!==dates[0]) { const relevant=dates.includes(dateKey(now()))?(now()-dayStart(dateKey(now())))/60000:calendarLayout(model,model.day)[0]?.start??480; const hours=overview.querySelector('.calendar-hours'); if(hours)overview.scrollTop=Math.max(0,relevant-60)/1440*hours.offsetHeight; weekScrollKey=dates[0]; }

    }
    if($('calendar-prev')){
      const navigate=direction=>{if(calendarView==='month'){const d=new Date(dayStart(model.day)+OFFSET);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+direction);chooseDay(d.toISOString().slice(0,10));}else chooseDay(shiftDate(model.day,direction*(calendarView==='week'?7:1)));};
      $('calendar-prev').onclick=()=>navigate(-1);$('calendar-next').onclick=()=>navigate(1);$('calendar-today').onclick=()=>chooseDay(dateKey(now()));$('calendar-date').onchange=e=>chooseDay(e.target.value);
      document.querySelectorAll('[data-calendar-view]').forEach(b=>b.onclick=()=>{calendarView=b.dataset.calendarView;render();onTasksChanged(model.tasks)});
    }
    function setBacklogOpen(open) {
      if (!$('planner-backlog-panel')) return;
      $('planner-backlog-panel').hidden = !open;
      $('planner-canvas').classList.toggle('backlog-open', open);
      $('calendar-backlog-toggle').setAttribute('aria-expanded',String(open));
    }
    if ($('calendar-backlog-toggle')) {
      $('calendar-backlog-toggle').onclick = () => setBacklogOpen($('planner-backlog-panel').hidden);
      $('calendar-backlog-close').onclick = () => { setBacklogOpen(false); $('calendar-backlog-toggle').focus(); };
      $('calendar-now').onclick = () => { calendarView='day';chooseDay(dateKey(now()));const grid=$('schedule').querySelector('.planner-time-grid');if(grid)$('schedule').scrollTop=Math.max(0,(now()-dayStart(model.day))/60000-60)/1440*grid.offsetHeight; };
    }
    if ($('calendar-add-meeting')) $('calendar-add-meeting').onclick = () => {
      modal('<h2>Add a meeting</h2><form id="dp-meeting-form"><label>Meeting title *<input id="dp-meeting-title" required maxlength="200"></label><label>Type<select id="dp-meeting-kind"><option value="client">Client meeting</option><option value="internal">Internal project meeting</option></select></label><label>Date *<input id="dp-meeting-date" type="date" value="'+model.day+'" required></label><label>Start time (Singapore) *<input id="dp-meeting-time" type="time" step="900" value="09:00" required></label><label>Duration in minutes *<input id="dp-meeting-duration" type="number" min="15" max="1440" step="15" value="30" required></label><p id="dp-meeting-error" role="alert" class="field-error"></p><button type="submit" class="primary">Add meeting</button></form>');
      $('dp-meeting-form').onsubmit = event => { event.preventDefault();const date=$('dp-meeting-date').value,time=$('dp-meeting-time').value,parts=time.split(':').map(Number),slot=(parts[0]*60+parts[1])/15,duration=Number($('dp-meeting-duration').value),name=$('dp-meeting-title').value.trim();if(!name||!validDate(date)||!Number.isInteger(slot)||slot<0||slot>=96||duration<15||duration%15||slot+duration/15>96){$('dp-meeting-error').textContent='Enter a title, date and 15-minute time range that finishes by midnight.';return;}model.meetings.push({id:'meeting-'+(++model.serial),name,kind:$('dp-meeting-kind').value,date,slot,length:duration/15,estimateMinutes:duration,project:'General',scheduledStart:new Date(date+'T'+time+':00+08:00').toISOString()});closeModal();chooseDay(date);commit();toast('Meeting added.');};
    };
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
      modal('<div class="task-dialog-head"><h2>Add task</h2><button id="dp-task-close" type="button" aria-label="Close add task">×</button></div><form id="dp-task-form" data-compact-footer><div class="task-form-fields"><div class="task-field"><label for="dp-name">Task name *</label><input id="dp-name" required maxlength="200" placeholder="What needs to be done?" autocomplete="off" aria-describedby="dp-name-error"><p id="dp-name-error" class="field-error"></p></div><div class="task-field"><label for="dp-project">Project (optional)</label><select id="dp-project"><option value="General">No project</option>' + options.map(p => '<option value="' + esc(p) + '">' + esc(p) + '</option>').join('') + '</select></div><div class="task-field-pair"><div class="task-field"><label for="dp-estimate">Duration *</label><div class="task-duration"><input id="dp-estimate" type="number" min="1" max="1440" step="1" value="30" required aria-describedby="dp-estimate-error dp-duration-help"><span>minutes</span></div><p id="dp-estimate-error" class="field-error"></p></div><div class="task-field"><label for="dp-priority">Priority</label><select id="dp-priority">' + priorities.map(p => '<option' + (p === 'Normal' ? ' selected' : '') + '>' + p + '</option>').join('') + '</select><p id="dp-priority-error" class="field-error"></p></div></div><p id="dp-duration-help" class="task-field-help">Scheduled in 15-minute blocks.</p><div class="task-field"><label for="dp-due">Deadline (optional)</label><input id="dp-due" type="date" aria-describedby="dp-due-error"><p id="dp-due-error" class="field-error"></p></div><p id="dp-task-error" class="field-error" role="alert"></p><p class="task-session-note">' + (root.PlannerAPI?.enabled ? 'Saved to your private workspace.' : 'Preview only · Changes reset on reload.') + '</p></div><footer class="task-dialog-footer"><div id="dp-task-actions"><button id="dp-task-cancel" type="button">Cancel</button><button id="dp-save" type="submit" class="primary">Add task</button></div></footer></form>');
      $('dp-task-close').onclick = $('dp-task-cancel').onclick = () => $('close').click();
      $('dp-task-form').onsubmit = e => {
        e.preventDefault();
        if ($('dp-task-form').querySelector('[data-modal-discard]')) return;
        const result = addTask(model, { name: $('dp-name').value, estimateMinutes: $('dp-estimate').value, due: $('dp-due').value, priority: $('dp-priority').value, project: $('dp-project').value }, now());
        ['name', 'estimate', 'due', 'priority'].forEach(key => { $('dp-' + key + '-error').textContent = result.errors?.[key] || ''; $('dp-' + key).setAttribute('aria-invalid', String(Boolean(result.errors?.[key]))); });
        if (!result.ok) { $('dp-task-error').textContent = 'Check the highlighted task details.'; $('dp-' + Object.keys(result.errors)[0]).focus(); return; }
        $('dp-save').disabled = true; newestTaskId=result.task.id; closeModal();
        document.querySelector('[data-view="today"]')?.click(); $('day-schedule-tab')?.click();
        calendarView='day'; setBacklogOpen(true); commit({itemId:result.task.id,action:'timer'});
        root.setTimeout?.(() => { const task=$('backlog').querySelector('[data-planner-item="'+result.task.id+'"]');task?.classList.remove('task-new');if(newestTaskId===result.task.id)newestTaskId=null; },6000);
        toast('Task added to Unscheduled tasks. Drag it into the calendar or choose Reschedule.');
      };
      $('dp-name').focus();
    }
    $('new').onclick = newTask;
    $('timer-value').setAttribute('role', 'timer'); $('timer-value').setAttribute('aria-label', 'Accumulated time for the current task');
    $('pause').onclick = () => { const task = findItem(model, model.currentTaskId); if (!task || task.status === 'Completed') return; if (openSession(model, task.id)) { pauseItem(model, task.id, now()); commit(); toast('Task paused. Its accumulated time is retained.'); } else requestStart(task); };
    $('finish').onclick = () => { if (finishTask(model, model.currentTaskId, now())) { commit(); toast('Task completed. Time recorded and its planned slot released.'); } };
    $('simulate').onclick = () => overlapPrompt(model.meetings.find(m => m.kind === 'client'));
    $('replan').onclick = () => { modal('<h2>Replan '+esc(longDate(model.day))+'</h2><p>Arrange tasks from the next available 15-minute boundary, by priority then deadline. Meetings, pinned times and running tasks remain in place. Every task needs enough space for its full estimate.</p><div class="row"><button id="dp-normal-plan">Normal hours only</button><button id="dp-overtime-plan">Include overtime</button></div><p>Normal hours: Monday–Friday, 08:45–18:00. Overtime can use the full 00:00–24:00 day; weekends are entirely overtime. Tasks that do not fit remain unscheduled.</p>'); const plan = allowOvertime => { const result = replan(model, { allowOvertime, now: now() }); closeModal(); commit(); toast(result.message); }; $('dp-normal-plan').onclick = () => plan(false); $('dp-overtime-plan').onclick = () => plan(true); $('dp-normal-plan').focus(); };
    const toolbar=$('timeline-actions');
    if(toolbar){
      const templateButton=element('button','Download JSON template'),importButton=element('button','Import JSON');templateButton.type=importButton.type='button';toolbar.append(templateButton,importButton);
      templateButton.onclick=()=>{
        modal('<h2>Download a planning template</h2><p>Choose a day, week or month around '+esc(longDate(model.day))+'. Every item includes its date. All 24 hours are available.</p><form id="dp-template-form"><label for="dp-template-period">Template period</label><select id="dp-template-period"><option value="day">Day</option><option value="week">Week · Monday to Sunday</option><option value="month">Month</option></select><p>Use the same file to plan tasks and meetings across the whole period. Overlapping times are kept and shown side by side.</p><button type="submit" class="primary">Download JSON</button></form>');
        $('dp-template-period').value=calendarView;
        $('dp-template-form').onsubmit=e=>{e.preventDefault();const period=$('dp-template-period').value,template=makeTemplate(model,period);const url=URL.createObjectURL(new Blob([JSON.stringify(template,null,2)],{type:'application/json'})),link=element('a');link.href=url;link.download=period+'-plan-'+model.day+'.json';link.click();root.setTimeout(()=>URL.revokeObjectURL(url),1000);closeModal();toast('Downloaded '+period+' template for '+model.day+'.');};
      };
      importButton.onclick=()=>{
        if(root.DraftGuard&&!root.DraftGuard.canLeave())return;
        modal('<h2>Import a day, week or month</h2><p>Upload a JSON template anchored on '+esc(model.day)+'. Review the assigned times before adding anything. Existing tasks and meetings stay in place.</p><label>JSON file<input id="dp-json-file" type="file" accept=".json,application/json"></label><p class="muted">Maximum 1 MB and 1,000 items. Each item has a date. Empty task start times are assigned around existing work; explicit times are kept, including overlaps, across all 24 hours.</p><p id="dp-json-error" class="field-error" role="alert"></p><div id="dp-json-preview"></div><div class="row"><button id="dp-json-apply" disabled>Import plan</button><button id="dp-json-cancel" type="button">Cancel</button></div>');
        let candidate=null,baseline='',previewSlots='',reading=0;
        $('dp-json-cancel').onclick=closeModal;
        $('dp-json-file').onchange=async event=>{const token=++reading;candidate=null;$('dp-json-apply').disabled=true;$('dp-json-preview').innerHTML='';$('dp-json-error').textContent='';const file=event.target.files[0];if(!file)return;try{if(file.size>1024*1024)throw new Error('Use a JSON file smaller than 1 MB.');const text=await file.text();if(token!==reading||!$('modal').open)return;let source;try{source=JSON.parse(text)}catch{throw new Error('This file is not valid JSON. Check commas, brackets and double quotes.');}const result=planFromJSON(model,source,{now:now(),projects:projectOptions()});baseline=JSON.stringify(model);previewSlots=JSON.stringify(result.added.map(item=>[item.id,item.date,item.slot]));candidate=source;$('dp-json-preview').innerHTML='<p>'+result.added.length+' items · '+result.unscheduled+' remain unscheduled because there is insufficient space. '+(source.allowOvertime?'Automatic planning uses all 24 hours.':'Automatic planning uses normal working hours.')+' '+result.overlaps+' overlapping pairs will appear side by side.'+'</p><table><thead><tr><th>Item</th><th>Type</th><th>Date</th><th>Start</th><th>Minutes</th></tr></thead><tbody>'+result.added.map(item=>'<tr><td data-label="Item">'+esc(item.name)+'</td><td data-label="Type">'+(isMeeting(item)?'Meeting':'Task')+'</td><td data-label="Date">'+esc(item.date)+'</td><td data-label="Start">'+(item.slot===null?'Unscheduled':slotLabel(item.slot))+'</td><td data-label="Minutes">'+item.estimateMinutes+'</td></tr>').join('')+'</tbody></table>';$('dp-json-apply').disabled=false;}catch(error){$('dp-json-error').textContent=error.message;}};
        $('dp-json-apply').onclick=()=>{if(!candidate)return;try{if(JSON.stringify(model)!==baseline)throw new Error('Your calendar changed while reviewing. Select the file again for an updated preview.');const result=planFromJSON(model,candidate,{now:now(),projects:projectOptions()});if(JSON.stringify(result.added.map(item=>[item.id,item.date,item.slot]))!==previewSlots)throw new Error('Time has moved on since the preview. Select the file again to review updated times.');model.tasks.splice(0,model.tasks.length,...result.model.tasks);model.meetings.splice(0,model.meetings.length,...result.model.meetings);model.serial=result.model.serial;closeModal();commit();toast(result.added.length+' items imported; '+result.unscheduled+' remain unscheduled.');}catch(error){$('dp-json-error').textContent=error.message;$('dp-json-apply').disabled=true;}};
      };
    }
    if ($('period')) $('period').onchange = renderReports;
    function tick() {
      const today = dateKey(now());
      const carried = carryUnfinishedTasks(model, today);
      if(today!==lastToday){const wasToday=model.day===lastToday;lastToday=today;warnedMeetings.clear();if(wasToday)model.day=today;render();onTasksChanged(model.tasks);}
      else if(carried.length)render();
      if(carried.length)onTasksChanged(model.tasks);
      renderTimer(); updateNow();
      if ($('reports') && !$('reports').classList.contains('hidden')) renderReports();
      const active = model.sessions.some(s => s.kind === 'task' && s.end === null);
      if (active && !$('modal').open && !$('dp-detail')?.open) { const minutes = (now() - dayStart(today)) / 60000; const meeting = calendarLayout(model,today).find(entry => isMeeting(entry.item) && minutes >= entry.start && minutes < entry.end && !warnedMeetings.has(entry.item.id) && !model.sessions.some(s => String(s.itemId) === String(entry.item.id)))?.item; if (meeting) { warnedMeetings.add(meeting.id); overlapPrompt(meeting); } }
    }
    setBacklogOpen(!root.matchMedia?.('(max-width: 900px)').matches);
    render(); if (interval) timer = interval(tick, 1000);
    return { tasks: model.tasks, meetings: model.meetings, sessions: model.sessions, model, render, renderReports, newTask, move: (id, slot) => { const result = moveItem(model, id, slot, {allowOverlap:true}); if (result.ok) commit(); return tell(result); }, replan: options => { const result = replan(model, { ...options, now: now() }); commit(); return tell(result); }, start: (id, options) => { const result = startItem(model, id, now(), options); commit(); return result; }, pause: id => { const result = pauseItem(model, id ?? model.currentTaskId, now()); commit(); return result; }, finish: id => { const result = finishTask(model, id ?? model.currentTaskId, now()); commit(); return result; }, report: period => computeReport(reportEntries(model), period, now()), editMeetingActual, syncMeeting: (record, project) => { const item = upsertMeeting(model, record, project); render(); onTasksChanged(model.tasks); return item; }, tick, destroy: () => { if (timer !== null) root.clearInterval?.(timer); },
      addAction(context, action, owner) { const existing = model.tasks.find(t => t.actionItemId === action.id); if (existing) { toast('This action is already in My day.'); return existing; } const result = addTask(model, { name: action.title, estimateMinutes: 30, due: action.due || '', priority: 'Normal', project: owner.projectName || owner.name || 'General' }, now()); if (!result.ok) { toast('This action needs a valid name and due date before scheduling.'); return null; } result.task.actionItemId = action.id; if (context.startsWith('opportunity:')) result.task.opportunityId = owner.id; commit(); toast('Action added to My day → Unscheduled tasks.'); return result.task; }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
