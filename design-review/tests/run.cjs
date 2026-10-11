/* Dependency-free verification; no browser, network or rendered-layout claims. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const repo=path.resolve(__dirname,'../..');process.chdir(repo);let failures=0;
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const js=walk('docs').filter(f=>f.endsWith('.js'));for(const f of js){const check=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(check.status!==0){failures++;process.stderr.write(check.stderr)}}
const html=fs.readFileSync('docs/mockup.html','utf8');let inline=0;for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(m[1].trim()){new vm.Script(m[1],{filename:'mockup-inline-'+(++inline)+'.js'})}}
const staticHtml=html.split('<script')[0];const ids=[...staticHtml.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'Duplicate static HTML ids');
const assets=[...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)].map(m=>m[1]);for(const asset of assets){assert(!/^https?:/.test(asset),'Prototype must remain self-contained');assert(fs.existsSync(path.join('docs',asset)),'Missing '+asset)}
assert(html.includes('src="day-planner.js"'),'Planner module must load');assert(!html.includes('seconds++'),'Old shared timer must be removed');assert(!html.includes("['38h 20m'"),'Fake report totals must be removed');
console.log(`PASS source checks: ${js.length} JavaScript files, ${inline} inline script, ${assets.length} local assets, ${ids.length} unique static IDs.`);
for(const test of fs.readdirSync(__dirname).filter(f=>f.endsWith('.cjs')&&f!=='run.cjs').sort()){console.log('\nRUN '+test);const child=spawnSync(process.execPath,[path.join(__dirname,test)],{stdio:'inherit'});if(child.status!==0)failures++}
if(failures){console.error(`\nFAIL: ${failures} checks/suites failed.`);process.exitCode=1}else console.log('\nPASS: all dependency-free checks. Browser/axe/visual verification remains unavailable.');
