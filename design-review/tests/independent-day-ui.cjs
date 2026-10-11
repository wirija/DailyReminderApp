const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..');
const harness=fs.readFileSync(path.join(__dirname,'day-planner.cjs'),'utf8');
// Reuse only a non-rendering Element parser. All scenarios and assertions are independent.
const start=harness.indexOf('const decode = text =>'),end=harness.indexOf("test('inert DOM smoke:");
const Element=new Function(harness.slice(start,end)+';return Element;')();
const core=require(path.join(repo,'docs/day-planner.js'));
const root=new Element(),ids=['schedule','backlog','backlog-count','timer-name','timer-value','pause','finish','simulate','replan','new','period','total','normal','overtime','modal'];
ids.forEach(id=>root.append(new Element(id==='period'?'select':'div',{id})));
const reports=new Element('div',{id:'reports',class:'view hidden'});reports.append(new Element('section',{class:'panel'}));root.append(reports);
const get=id=>root.querySelector('[id="'+id+'"]');
const document={getElementById:get,createElement:tag=>new Element(tag),activeElement:null};
Element.prototype.focus=function(){document.activeElement=this};
Element.prototype.closest=function(selector){for(let n=this;n;n=n.parentNode)if(n.matches(selector))return n;return null};
Object.defineProperty(Element.prototype,'isConnected',{get(){for(let n=this;n;n=n.parentNode)if(n===root)return true;return false}});
let time=Date.parse('2026-10-12T09:00:00+08:00');
const model=core.createModel({now:time,sample:false});
const result=core.addTask(model,{name:'Review keyboard behavior',estimateMinutes:30,project:'Test project',priority:'Normal'},time);
const item=result.task;
get('period').value='This week';
const api=globalThis.createDayPlanner({document,now:()=>time,model,setInterval:null,toast(){},modal:html=>{get('modal').innerHTML=html;get('modal').open=true}});
const results=[];
function test(name,fn){try{fn();results.push({name,pass:true});console.log('PASS',name)}catch(e){results.push({name,pass:false,error:e.message});console.log('FAIL',name,e.message)}}
function card(){return root.querySelector('[data-planner-item="'+item.id+'"]')}
function control(text){return card().querySelectorAll('button').find(b=>b.textContent===text)}
test('Task Start retains keyboard focus in a connected control',()=>{const b=control('Start');b.focus();b.onclick();assert(document.activeElement?.isConnected,'Start removed the focused control without selecting its replacement')});
test('Task Pause retains keyboard focus in a connected control',()=>{const b=control('Pause');b.focus();time+=60000;b.onclick();assert(document.activeElement?.isConnected,'Pause removed the focused control without selecting its replacement')});
test('Move has explicit keyboard input and retains item focus after applying',()=>{const b=control('Move');b.focus();b.onclick();assert.equal(document.activeElement,get('dp-move-slot'));get('dp-move-slot').value='16';get('dp-move-form').onsubmit({preventDefault(){}});assert.equal(item.slot,16);assert(document.activeElement?.isConnected&&!document.activeElement.closest('[id="modal"]'),'After moving, focus must return to live content outside the closed modal')});
test('Report table participates in mobile cards and labels every data cell',()=>{api.renderReports();const table=get('day-time-breakdown').querySelector('table');assert(table,'Recorded session should appear');assert(table.className.split(' ').includes('register-table'),'Report table bypasses shared responsive table/card component');const cells=table.querySelectorAll('td');assert.equal(cells.length,4);assert(cells.every(c=>c.dataset.label),'Each mobile cell needs its column label')});
test('Report interpolated activity and project labels are HTML escaped',()=>{const s=model.sessions[0];s.name='<img src=x onerror=bad>';s.project='<script>bad</script>';api.renderReports();const markup=get('day-time-breakdown').innerHTML;assert(!markup.includes('<img'));assert(!markup.includes('<script>'));assert(markup.includes('&lt;img'))});
api.destroy();console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results},null,2));process.exitCode=results.some(r=>!r.pass)?1:0;
