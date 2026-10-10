// Browser policy port of Guardian V4.19.12. No OS, game, network or trading inputs.
export const ENGINE_VERSION = '0.1.0';
export const LIMITS = Object.freeze({ search: 60, portal: 12, entry: 25, cooldown: 300, maintenance: 14400 });
export const SCENARIOS = Object.freeze({
  normal: 'Healthy route',
  'missing-portal': 'Primary entrance missing',
  'no-feedback': 'Click without feedback',
  'entry-timeout': 'Entry without arrival',
  popup: 'Reward overlay',
  'auto-stalled': 'Automatic mode turns off',
  'unknown-coordinate': 'Coordinate unreadable'
});
const clone = value => JSON.parse(JSON.stringify(value));
export function defaultConfig() {
  return { level: 79, goal: { x: 17, y: 37, radius: 1 }, allowTokens: true, maintenance: true,
    routes: [
      { id: 'panjun-base', name: 'Base route', minLevel: 79, priority: 1, enabled: true, consuming: true },
      { id: 'shiyuan-forest', name: 'Forest route', minLevel: 78, priority: 2, enabled: true, consuming: true },
      { id: 'panjun-camp', name: 'Camp route', minLevel: 0, priority: 3, enabled: true, consuming: false },
      { id: 'battle-outpost', name: 'Outpost route', minLevel: 0, priority: 4, enabled: true, consuming: false },
      { id: 'dragon-claw', name: 'Fortress route', minLevel: 0, priority: 5, enabled: true, consuming: false }
    ] };
}
export function validateConfig(config) {
  if (!config || !Number.isInteger(config.level) || config.level < 0 || config.level > 999) throw new Error('Level must be an integer from 0 to 999.');
  if (!config.goal || !['x', 'y'].every(k => Number.isInteger(config.goal[k]) && config.goal[k] >= 0 && config.goal[k] <= 99)) throw new Error('Coordinates must be integers from 0 to 99.');
  if (!Number.isInteger(config.goal.radius) || config.goal.radius < 0 || config.goal.radius > 2) throw new Error('Search radius must be 0, 1 or 2.');
  if (typeof config.allowTokens !== 'boolean' || typeof config.maintenance !== 'boolean') throw new Error('Task switches must be booleans.');
  const defs = defaultConfig().routes;
  if (!Array.isArray(config.routes) || config.routes.length !== defs.length) throw new Error('Configure all five routes.');
  const ids = new Set(), priorities = new Set();
  for (const r of config.routes) {
    const original = defs.find(d => d.id === r?.id);
    if (!original || ids.has(r.id) || r.name !== original.name || r.consuming !== original.consuming) throw new Error('Route identity is invalid.');
    if (!Number.isInteger(r.priority) || r.priority < 1 || priorities.has(r.priority)) throw new Error('Route priorities must be unique positive integers.');
    if (!Number.isInteger(r.minLevel) || r.minLevel < original.minLevel || r.minLevel > 999 || typeof r.enabled !== 'boolean') throw new Error('A route cannot lower its required level.');
    ids.add(r.id); priorities.add(r.priority);
  }
  if (!config.routes.some(r => r.enabled)) throw new Error('Enable at least one route.');
  return clone(config);
}

export class GuardianEngine {
  constructor(serial, config = defaultConfig(), scenario = 'normal', epoch = new Date().toISOString()) {
    if (typeof serial !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(serial)) throw new Error('Use a short instance ID containing letters, digits, dots or hyphens.');
    if (!Object.hasOwn(SCENARIOS, scenario)) throw new Error('Unknown scenario.');
    if (!Number.isFinite(Date.parse(epoch))) throw new Error('Invalid epoch.');
    this.serial = serial; this.config = validateConfig(config); this.scenario = scenario; this.epoch = epoch;
    this.now = 0; this.running = false; this.phase = 'town'; this.phaseSince = 0;
    this.position = { x: 22, y: 36 }; this.goalSeen = false; this.active = null;
    this.routes = this.config.routes.map(r => ({ ...r, failed: false, cooldownUntil: 0, entryIssued: false })).sort((a,b) => a.priority - b.priority);
    this.searchIndex = -1; this.searchSince = null; this.hallSince = null; this.activeSince = null;
    this.auto = false; this.autoPending = false; this.autoAttempts = 0; this.restoreAttempts = 0; this.popup = false;
    this.commands = 0; this.routeEntries = 0; this.bossClears = 0; this.tokenUses = 0;
    this.resources = { tokens: 5, gold: 200000, gems: 500 }; this.lastMaintenance = -LIMITS.maintenance;
    this.maintenanceDone = 0; this.faultInjected = false; this.events = []; this.sequence = 0;
    this.bosses = [
      { id: 'scout', name: 'Outpost Sentinel', readyAt: 50, tokenReady: false, lastAttempt: -1, cooldownUntil: 0 },
      { id: 'captain', name: 'Forest Captain', readyAt: 90, tokenReady: true, lastAttempt: -1, cooldownUntil: 0 },
      { id: 'warden', name: 'Base Warden', readyAt: 120, tokenReady: true, lastAttempt: -1, cooldownUntil: 0 }
    ];
    this.inputs = [];
    this.emit('created', 'Instance ready. Start to inspect the route.', { scenario });
  }
  emit(type, message, details = {}) {
    this.events.push({ sequence: ++this.sequence, serial: this.serial, second: this.now,
      timestamp: new Date(Date.parse(this.epoch) + this.now * 1000).toISOString(), type, phase: this.phase, message, ...clone(details) });
    // bounded browser evidence; dropped count remains visible in exports
    if (this.events.length > 2000) this.events.shift();
  }
  transition(phase, message, details) { this.phase = phase; this.phaseSince = this.now; this.emit('state', message, details); }
  command(action, message, details) { this.commands++; this.emit('command', message, { action, ...details }); }
  start() { if (this.phase === 'blocked') return; if (!this.running) { this.inputs.push({ action:'start' }); this.running = true; this.emit('start', 'Guardian started.'); } }
  stop() { if (this.running) { this.inputs.push({ action:'stop' }); this.running = false; this.emit('stop', 'Guardian paused. No steps execute while paused.'); } }
  ready() {
    if (this.position.x === this.config.goal.x && this.position.y === this.config.goal.y) this.goalSeen = true;
    return this.goalSeen && Math.abs(this.position.x - this.config.goal.x) + Math.abs(this.position.y - this.config.goal.y) <= this.config.goal.radius;
  }
  eligible(r) { return r.enabled && this.config.level >= r.minLevel && !r.failed && this.now >= r.cooldownUntil && !(r.consuming && r.entryIssued); }
  failRoute(reason) {
    const r = this.active || this.routes[this.searchIndex];
    if (r) { r.failed = true; r.cooldownUntil = this.now + LIMITS.cooldown; this.emit('fallback', `${r.name}: ${reason}. Try the next eligible route.`, { route: r.id, cooldownUntil: r.cooldownUntil, entryIssued: r.entryIssued }); }
    this.active = null; this.activeSince = null; this.searchIndex = -1; this.searchSince = null;
    this.transition('search', 'Released route ownership.');
  }
  pickBoss() {
    const canPay = this.config.allowTokens && this.resources.tokens >= 1 && this.resources.gold >= 20000 && this.resources.gems >= 50;
    return this.bosses.filter(b => this.now >= b.cooldownUntil && (b.readyAt <= this.now || b.tokenReady && canPay))
      .sort((a,b) => Number(b.tokenReady && canPay) - Number(a.tokenReady && canPay) || a.lastAttempt - b.lastAttempt || a.readyAt - b.readyAt)[0] || null;
  }
  advance(seconds = 1) {
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 600) throw new Error('Advance between 1 and 600 seconds.');
    if (!this.running) return;
    const previous = this.inputs.at(-1);
    if (previous?.action === 'advance') previous.seconds += seconds;
    else this.inputs.push({ action:'advance', seconds });
    for (let n=0; n<seconds && this.running; n++) { this.now++; this.step(); }
  }
  step() {
    const elapsed = this.now - this.phaseSince;
    if (this.phase === 'town') { this.command('travel', 'Town recognized: route first; defer maintenance.'); this.hallSince = this.now; this.transition('approach', 'Move to the configured coordinate.'); return; }
    if (this.phase === 'approach') {
      if (elapsed >= 60) { this.transition('blocked', 'Coordinate could not be confirmed within 60s. Paused for observation.'); this.running = false; return; }
      if (this.scenario === 'unknown-coordinate') { if (elapsed % 10 === 0) this.emit('observe', 'Coordinate unreadable; no guessed entrance click.'); return; }
      if (this.position.x !== this.config.goal.x) this.position.x += Math.sign(this.config.goal.x - this.position.x);
      else if (this.position.y !== this.config.goal.y) this.position.y += Math.sign(this.config.goal.y - this.position.y);
      if (this.ready()) this.transition('search', 'Exact coordinate verified; entrance search is now allowed.', { position: this.position });
      return;
    }
    if (this.phase === 'search') {
      for (const r of this.routes) if (r.failed && this.now >= r.cooldownUntil && !(r.consuming && r.entryIssued)) r.failed = false;
      const candidate = this.routes.findIndex(r => this.eligible(r));
      if (candidate < 0) { if (this.now - this.hallSince >= 300 && this.pickBoss()) this.beginBoss(); else if (elapsed % 10 === 0) this.emit('observe', 'No eligible entrance. Wait for cooldown; no repeated spending.'); return; }
      if (candidate !== this.searchIndex) { this.searchIndex = candidate; this.searchSince = this.now; this.emit('search', `Searching ${this.routes[candidate].name}; budget 60s.`, { route: this.routes[candidate].id, deadline: this.now + LIMITS.search }); }
      if (this.now - this.searchSince >= LIMITS.search) { this.failRoute('Entrance not confirmed in 60s'); return; }
      const r = this.routes[candidate];
      if (r.id === 'panjun-base' && this.scenario === 'missing-portal') return;
      if (this.now - this.searchSince >= 2 && this.ready()) {
        this.active = r; this.activeSince = this.now; this.command('portal', `Click the confirmed ${r.name} entrance.`, { route:r.id }); this.transition('dialog', 'Wait for matching detail and green requirements.');
      }
      return;
    }
    if (this.phase === 'dialog') {
      if (this.now - this.activeSince >= LIMITS.portal) { this.failRoute('No detail feedback in 12s'); return; }
      if (this.active.id === 'panjun-base' && this.scenario === 'no-feedback') return;
      if (elapsed >= 2) { this.active.entryIssued = true; this.activeSince = this.now; this.command('enter', `Verified ${this.active.name} detail. Submit entry once.`, { route: this.active.id }); this.transition('entering', 'Wait for actual map arrival.'); }
      return;
    }
    if (this.phase === 'entering') {
      if (this.now - this.activeSince >= LIMITS.entry) { this.failRoute('No verified arrival in 25s'); return; }
      if (this.active.id === 'panjun-base' && this.scenario === 'entry-timeout') return;
      if (elapsed >= 2) { this.routeEntries++; this.auto = false; this.autoAttempts = 0; this.transition('automatic', `${this.active.name} arrival verified. Inspect the right-side mode button.`); }
      return;
    }
    if (this.phase === 'automatic') {
      if (this.auto) { this.autoPending = false; this.transition(this.boss ? 'boss-fight' : 'working', 'Right-side mode verified: Automatic.'); return; }
      if (this.autoPending && elapsed >= 2) { this.auto = true; this.emit('verified', 'Automatic mode confirmed from the simulator observation.'); return; }
      if (this.autoAttempts < 3 && !this.autoPending) { this.autoAttempts++; this.autoPending = true; this.command('automatic', 'Mode is Hanging: click once, then verify.'); return; }
      if (elapsed >= 12) { this.running = false; this.transition('blocked', 'Automatic mode not confirmed. Stop instead of toggling forever.'); }
      return;
    }
    if (this.phase === 'working') {
      if (this.scenario === 'auto-stalled' && elapsed >= 5 && !this.faultInjected) { this.faultInjected = true; this.auto = false; this.autoAttempts = 0; this.restoreAttempts++; this.transition('automatic', 'Observed Hanging during work. Restore and verify.'); return; }
      if (this.scenario === 'popup' && elapsed >= 5 && !this.faultInjected) { this.faultInjected = true; this.popup = true; this.command('dismiss-blank', 'Reward overlay: click its confirmed blank dismissal area.'); this.transition('overlay', 'Wait for overlay disappearance before continuing.'); return; }
      if (elapsed >= 8 && this.pickBoss()) { this.beginBoss(); return; }
      if (this.config.maintenance && this.now - this.lastMaintenance >= LIMITS.maintenance) { this.command('maintenance', 'Safe working phase: claim simulated available rewards.'); this.transition('maintenance', 'Maintenance owns its window for a bounded task.'); return; }
      return;
    }
    if (this.phase === 'overlay') { if (elapsed >= 2) { this.popup = false; this.transition('working', 'Overlay disappearance verified.'); } return; }
    if (this.phase === 'maintenance') { if (elapsed >= 3) { this.lastMaintenance = this.now; this.maintenanceDone++; this.transition('working', 'Rewards verified and window closed; next check in 4h.'); } return; }
    if (this.phase === 'boss-confirm') {
      if (elapsed >= 2) {
        if (this.bossViaToken) { this.resources.tokens--; this.resources.gold -= 20000; this.resources.gems -= 50; this.tokenUses++; }
        this.command('challenge', `Confirm challenge: ${this.boss.name}.`, { boss:this.boss.id, viaToken:this.bossViaToken });
        this.auto = false; this.autoAttempts = 0; this.autoPending = false; this.transition('automatic', 'BOSS map arrival verified; enable Automatic.');
      }
      return;
    }
    if (this.phase === 'boss-fight') { if (elapsed >= 15) this.transition('loot', 'BOSS defeat observed. Wait for simulated loot pickup.'); return; }
    if (this.phase === 'loot') {
      if (elapsed >= 5) { this.bossClears++; this.boss.readyAt = this.now + 60; this.boss.cooldownUntil = this.now + 60; this.boss.tokenReady = false; this.emit('completed', `${this.boss.name} cleared; loot verified.`, { boss:this.boss.id, nextReady:this.boss.readyAt }); this.boss=null; this.active=null; this.activeSince=null; for(const r of this.routes) r.entryIssued=false; this.goalSeen=false; this.auto=false; this.position={x:22,y:36}; this.transition('town', 'Simulator reports automatic return to town.'); }
      return;
    }
  }
  beginBoss() {
    const boss = this.pickBoss(); if (!boss) return;
    this.boss = boss; boss.lastAttempt = this.now;
    this.bossViaToken = boss.tokenReady && this.config.allowTokens && this.resources.tokens >= 1 && this.resources.gold >= 20000 && this.resources.gems >= 50;
    this.command('boss-list', `Read BOSS list: ${boss.name} selected.`, { boss:boss.id, viaToken:this.bossViaToken });
    this.transition('boss-confirm', 'Confirm matching challenge detail before entry.');
  }
  snapshot() { return clone({ serial:this.serial, now:this.now, running:this.running, phase:this.phase, scenario:this.scenario, position:this.position, goalSeen:this.goalSeen, active:this.active?.name || null, boss:this.boss?.name || null, automatic:this.auto, commands:this.commands, entries:this.routeEntries, bossClears:this.bossClears, tokenUses:this.tokenUses, resources:this.resources, searchSince:this.searchSince, activeSince:this.activeSince, routes:this.routes, bosses:this.bosses, maintenanceDone:this.maintenanceDone, nextMaintenance:this.lastMaintenance + LIMITS.maintenance, events:this.events }); }
  bundle() { return { schema:1, engine:ENGINE_VERSION, adapter:'deterministic-simulator', serial:this.serial, epoch:this.epoch, scenario:this.scenario, config:clone(this.config), commands:clone(this.inputs), state:this.snapshot(), evidence:{ retained:this.events.length, total:this.sequence, dropped:this.sequence-this.events.length } }; }
}

export function replayBundle(bundle) {
  if (bundle?.schema !== 1 || bundle.engine !== ENGINE_VERSION || bundle.adapter !== 'deterministic-simulator' || !Array.isArray(bundle.commands) || bundle.commands.length > 10000) throw new Error('Unsupported replay bundle.');
  let total = 0;
  for (const c of bundle.commands) {
    if (!c || !['start','stop','advance'].includes(c.action)) throw new Error('Unknown replay command.');
    if (c.action === 'advance' && (!Number.isInteger(c.seconds) || c.seconds < 1 || (total += c.seconds) > 86400)) throw new Error('Replay exceeds the 24h budget.');
  }
  const engine = new GuardianEngine(bundle.serial,bundle.config,bundle.scenario,bundle.epoch);
  for (const c of bundle.commands) {
    if (c.action === 'start') engine.start();
    if (c.action === 'stop') engine.stop();
    if (c.action === 'advance') for (let left=c.seconds; left>0; left-=600) engine.advance(Math.min(600,left));
  }
  return engine;
}
