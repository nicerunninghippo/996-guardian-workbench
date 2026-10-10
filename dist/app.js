import { GuardianEngine, defaultConfig, validateConfig, SCENARIOS, replayBundle } from './engine.js';
const $ = id => document.getElementById(id);
const storageKey = '996-guardian-workbench.configs.v1';
let configs = {}, engines = Object.create(null), current = 'agent-01', timer;
try { configs = JSON.parse(localStorage.getItem(storageKey) || '{}'); if (!configs || typeof configs !== 'object' || Array.isArray(configs)) configs={}; } catch { configs={}; }
function engineFor(serial) { if (!engines[serial]) { let c=defaultConfig(); try { if (Object.hasOwn(configs,serial)) c=validateConfig(configs[serial]); } catch { $('config-status').textContent='Invalid stored configuration; using defaults.'; } engines[serial]=new GuardianEngine(serial,c); } return engines[serial]; }
function formatTime(s) { if (s < 0) return '—'; return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; }
function safeNode(tag,text,cls='') { const n=document.createElement(tag); n.textContent=text; if(cls) n.className=cls; return n; }
function loadForm() {
  const c=engineFor(current).config;
  $('level').value=c.level; $('goal-x').value=c.goal.x; $('goal-y').value=c.goal.y; $('radius').value=c.goal.radius;
  $('allow-tokens').checked=c.allowTokens; $('maintenance').checked=c.maintenance; $('scenario').value=engineFor(current).scenario;
  $('route-list').replaceChildren();
  for(const r of c.routes.slice().sort((a,b)=>a.priority-b.priority)) {
    const row=document.createElement('div'); row.className='route-item'; row.dataset.id=r.id;
    const enabled=document.createElement('input'); enabled.type='checkbox'; enabled.checked=r.enabled; enabled.setAttribute('aria-label',`Enable ${r.name}`);
    const label=safeNode('span',r.name,'route-name'); label.append(safeNode('small',` · level ${r.minLevel}+`));
    const priority=document.createElement('input'); priority.type='number'; priority.min=1; priority.max=999; priority.value=r.priority; priority.setAttribute('aria-label',`${r.name} priority`);
    row.append(enabled,label,priority); $('route-list').append(row);
  }
}
function render() {
  const e=engineFor(current), s=e.snapshot();
  $('metric-state').textContent=s.running?'Running':'Paused'; $('metric-phase').textContent=s.phase;
  $('metric-entries').textContent=s.entries; $('metric-boss').textContent=s.bossClears; $('metric-clock').textContent=formatTime(s.now);
  $('token-budget').textContent=`${s.resources.tokens} tokens · ${s.tokenUses} used`;
  $('coordinate').textContent=`${s.position.x}:${s.position.y}`; $('scene-target').textContent=s.boss || s.active || (s.running?'Verify → search → enter':'Awaiting start');
  $('auto-mode').textContent=s.automatic?'Automatic':'Hanging'; $('auto-mode').classList.toggle('on',s.automatic);
  $('agent-node').style.left=`${Math.max(8,Math.min(92,50+(s.position.x-e.config.goal.x)*5))}%`; $('agent-node').style.top=`${Math.max(10,Math.min(68,30+(s.position.y-e.config.goal.y)*6))}%`; $('goal-node').style.left='50%';
  $('overlay').hidden=!e.popup; $('decision-text').textContent=s.events.at(-1)?.message || 'Ready'; $('scenario-tag').textContent=SCENARIOS[e.scenario].toUpperCase();
  $('start').disabled=s.running || s.phase==='blocked'; $('pause').disabled=!s.running;
  for(const id of ['step','advance10','advance60']) $(id).disabled=!s.running;
  $('boss-table').replaceChildren();
  const selected=e.pickBoss();
  for(const boss of s.bosses) {
    const row=document.createElement('tr'); row.append(safeNode('td',boss.name));
    row.append(safeNode('td',boss.readyAt<=s.now?'Refreshed':formatTime(boss.readyAt-s.now),boss.readyAt<=s.now?'ready':''));
    row.append(safeNode('td',boss.tokenReady?'Available':'Unavailable',boss.tokenReady?'ready':'')); row.append(safeNode('td',formatTime(boss.lastAttempt)));
    row.append(safeNode('td',s.boss===boss.name?'In progress':selected?.id===boss.id?'Next eligible':'Wait')); $('boss-table').append(row);
  }
  $('events').replaceChildren();
  for(const ev of s.events.slice(-120).reverse()) { const item=document.createElement('li'); item.className=ev.type; item.append(safeNode('time',formatTime(ev.second)),safeNode('span',ev.type,'event-type'),safeNode('span',ev.message)); $('events').append(item); }
}
function stopPlay() { if(timer) clearInterval(timer); timer=null; $('play').checked=false; }
function update(seconds) { engineFor(current).advance(seconds); render(); if(!engineFor(current).running) stopPlay(); }
$('start').onclick=()=>{engineFor(current).start();render();};
$('pause').onclick=()=>{engineFor(current).stop();stopPlay();render();};
$('step').onclick=()=>update(1); $('advance10').onclick=()=>update(10); $('advance60').onclick=()=>update(60);
$('play').onchange=()=>{if($('play').checked){engineFor(current).start();timer=setInterval(()=>update(1),500);render();}else stopPlay();};
$('instance').onchange=()=>{stopPlay();current=$('instance').value;engineFor(current);loadForm();render();$('config-status').textContent='';};
$('add-instance').onclick=()=>{let number=Object.keys(engines).length+1,serial;do{serial=`agent-${String(number++).padStart(2,'0')}`;}while(engines[serial]);stopPlay();const o=new Option(`Agent ${serial.slice(-2)}`,serial);$('instance').add(o);$('instance').value=serial;current=serial;engineFor(current);loadForm();render();};
$('run-scenario').onclick=()=>{stopPlay();engines[current]=new GuardianEngine(current,engineFor(current).config,$('scenario').value);loadForm();render();$('config-status').textContent='Scenario loaded. Click Start guardian.';};
$('config-form').onsubmit=event=>{
  event.preventDefault();const old=engineFor(current),c=JSON.parse(JSON.stringify(old.config));
  c.level=Number($('level').value);c.goal={x:Number($('goal-x').value),y:Number($('goal-y').value),radius:Number($('radius').value)};c.allowTokens=$('allow-tokens').checked;c.maintenance=$('maintenance').checked;
  for(const row of $('route-list').children){const r=c.routes.find(r=>r.id===row.dataset.id);r.enabled=row.querySelector('[type=checkbox]').checked;r.priority=Number(row.querySelector('[type=number]').value);}
  try { const valid=validateConfig(c); const next={...configs,[current]:valid}; localStorage.setItem(storageKey,JSON.stringify(next)); configs=next; stopPlay(); old.stop(); engines[current]=new GuardianEngine(current,valid,old.scenario);loadForm();render();$('config-status').className='inline-status';$('config-status').textContent=`Saved for ${current}. Guardian paused; start to apply.`; }
  catch(error){$('config-status').className='inline-status error';$('config-status').textContent=error.message;}
};
$('export').onclick=()=>{const e=engineFor(current);const blob=new Blob([JSON.stringify(e.bundle(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`guardian-${current}-${e.now}s.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('replay-status').textContent='Replay bundle exported. Contains simulator data only.';};
$('import').onchange=async()=>{const file=$('import').files[0];if(!file)return;try{if(file.size>2_000_000)throw new Error('Replay file must be smaller than 2 MB.');const parsed=JSON.parse(await file.text());const e=replayBundle(parsed);if(!engines[e.serial])$('instance').add(new Option(e.serial,e.serial));engines[e.serial]=e;current=e.serial;$('instance').value=current;stopPlay();loadForm();render();$('replay-status').className='';$('replay-status').textContent=`Replay restored: ${e.serial}, ${e.now}s. No device inputs were sent.`;}catch(error){$('replay-status').className='error';$('replay-status').textContent=error.message;}finally{$('import').value='';}};
window.addEventListener('pagehide',stopPlay);
engineFor('agent-01');engineFor('agent-02');
for(const serial of Object.keys(configs))if(!engines[serial]&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(serial)){try{validateConfig(configs[serial]);engineFor(serial);$('instance').add(new Option(serial,serial));}catch{}}
loadForm();render();
