'use strict';
// Run the production meeting form handler in the existing inert DOM. No browser,
// local server, external service or live network is used by this check.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const harness=fs.readFileSync(path.join(__dirname,'backend-client.cjs'),'utf8');
const {build,fixture}=new Function('require','__dirname',harness.slice(0,harness.indexOf('(async()=>{'))+'return {build,fixture};')(require,__dirname);
const next=()=>new Promise(resolve=>setImmediate(resolve));

(async()=>{
 const scenario=fixture();
 scenario.state={...JSON.parse(fs.readFileSync(path.join(__dirname,'../../backend/workspace/fixtures/frontend_state.json'),'utf8')),workspaceId:'1'};
 const {context,document}=build(require,__dirname,scenario);
 await next();await next();
 const app=context.integration,$=id=>document.getElementById(id);
 assert(app,'Authenticated app must initialize');
 let instant=Date.parse('2026-10-12T09:00:00+08:00');
 context.Date.now=()=>++instant;
 const addButton=document.querySelectorAll('button').find(button=>button.textContent==='+ Meeting');
 assert(addButton,'Server meeting action must exist');
 function form(values){
  addButton.click();
  const form=$('server-meeting-form');
  for(const [name,value] of Object.entries(values))form.querySelector('[name="'+name+'"]').value=value;
  return form;
 }
 function submit(values){form(values).dispatch('submit');return app.dayPlanner.model.meetings.at(-1)}
 const shared={title:'Midnight handover',kind:'internal',project:'PRJ-001',date:'2026-10-12',time:'00:00',duration:'60'};
 const midnight=submit(shared);
 assert.equal(midnight.slot,0);assert.equal(midnight.date,shared.date);
 assert.equal(midnight.name,shared.title);assert.equal(midnight.project,'New engagement');
 assert.equal(midnight.scheduledStart,'2026-10-11T16:00:00.000Z');
 assert.equal(app.projectRecords[0].meetingRecords.at(-1).time,'00:00');
 const overlap=submit({...shared,title:'Concurrent handover',duration:'30'});
 assert.equal(overlap.slot,0);assert.equal(app.dayPlanner.model.meetings.length,2);
 const late=submit({...shared,title:'Late handover',date:'2026-10-13',time:'23:45',duration:'15'});
 assert.equal(late.slot,95);assert.equal(late.length,1);assert.equal(late.date,'2026-10-13');
 const fullDay=submit({...shared,title:'Full-day workshop',date:'2026-10-14',duration:'1440'});
 assert.equal(fullDay.slot,0);assert.equal(fullDay.length,96);assert.equal(fullDay.estimateMinutes,1440);
 assert.equal(await context.PlannerAPI.flush(),true);
 assert.equal(scenario.state.planner.slotOrigin,0);
 assert.deepEqual(scenario.state.planner.meetings.map(m=>m.slot),[0,0,95,0]);
 assert.equal(scenario.state.projects[0].meetingRecords.at(-1).durationMinutes,1440);
 console.log('PASS actual Add meeting form saves midnight, late, full-day and overlapping meetings with project/title/date');

 for(const invalid of [{time:'23:45',duration:'30'},{time:'00:00',duration:'1455'},{time:'00:05',duration:'15'},{time:'24:00',duration:'15'}]){
  const count=app.dayPlanner.model.meetings.length;
  const invalidForm=form({...shared,...invalid});
  assert.equal(invalidForm.querySelector('[name="time"]').getAttribute('min'),'00:00');
  assert.equal(invalidForm.querySelector('[name="time"]').getAttribute('max'),'23:45');
  assert.equal(invalidForm.querySelector('[name="duration"]').getAttribute('max'),'1440');
  invalidForm.dispatch('submit');
  assert.equal(app.dayPlanner.model.meetings.length,count);
  assert($('server-meeting-error').textContent.includes('finishes by midnight'));
 }
 console.log('PASS actual Add meeting form rejects invalid quarter-hour times and day-boundary overflow');
 app.dayPlanner.destroy();
})().catch(error=>{console.error(error);process.exitCode=1});
