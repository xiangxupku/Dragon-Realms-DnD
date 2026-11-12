// ===== Game engine: all rules run here (on the host / single player device) =====
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const roll = (n, s) => { const r = []; for (let i = 0; i < n; i++) r.push(rnd(1, s)); return r; };
const sumA = a => a.reduce((x, y) => x + y, 0);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const xpNeed = l => 80 * l;
const blockedTile = tt => tt === 1 || tt === 3 || tt === 4;

// ---- derived stats (also used by the UI) ----
function isDesert(s) { return MAPS[s.map] && MAPS[s.map].key === 'desert' && s.phase === 'battle'; }
function gearOf(p, slot) { const e = p.equip && p.equip[slot]; return e ? ITEMS[iid(e)] : null; }
function armorAc(p) { const a = p.equip && p.equip.armor; return a && idur(a) > 0 ? ITEMS[iid(a)].ac : 0; }
function petLvl(p) { return p.pet ? p.pet.lvl + (p.cls === 'beastmaster' ? 1 : 0) : 0; }
function moveRange(p, s) {
  if (p.status.root || p.status.freeze || p.status.stun) return 0;
  let m = 2 + Math.floor(p.stats.spd / 3);
  if (isDesert(s)) m -= 1;
  if (p.status.slow) m = Math.ceil(m / 2);
  return Math.max(1, m);
}
function acOf(p) { const o = gearOf(p, 'offhand'); return 10 + CLASSES[p.cls].ac + Math.floor(p.stats.spd / 4) + armorAc(p) + ((o && o.ac) || 0); }
function hitBonus(p, s) {
  const w = gearOf(p, 'weapon'), o = gearOf(p, 'offhand');
  return 2 + Math.floor(p.stats.lck / 3) + Math.floor(p.lvl / 2) + (p.status.inspired ? 3 : 0) - (p.status.blur ? 5 : 0) - (isDesert(s) ? 2 : 0) + ((w && w.hit) || 0) + ((o && o.hit) || 0);
}
function dmgBonus(p, stat) {
  const w = gearOf(p, 'weapon'), o = gearOf(p, 'offhand');
  return (stat ? Math.floor(p.stats[stat] * 0.6) : 0) + (p.status.rage ? 4 : 0) + (p.status.inspired ? 3 : 0) + ((w && w.dmg) || 0) +
    (o && o.spell && stat === 'eng' ? o.spell : 0) + (p.pet && p.pet.type === 'fury' ? 1 + petLvl(p) : 0);
}
function critAt(p) { return Math.max(16, 20 - Math.floor(p.stats.lck / 5)); }
function damageReduce(p) { return Math.floor(p.stats.res / 4); }
function edef(e) { return e.kind === 'dragon' ? TRIBES[e.tribe] : PEOPLE[e.ptype]; }
function atkDice(e, which) { const A = edef(e)[which]; return A.dice || (which === 'a1' ? [3, 6, 2] : [2, 6, -2]); }

// ---- map layouts (COLS x ROWS = 14 x 9). tile: 0 floor, 1 obstacle, 2 mud, 3 void/sea, 4 water, 5 door ----
function buildTiles(key, stage, extra) {
  const t = [], d = [];
  for (let y = 0; y < ROWS; y++) { t.push(Array(COLS).fill(0)); d.push(Array(COLS).fill(null)); }
  const ob = (x, y, n) => { if (t[y] && t[y][x] !== undefined) { t[y][x] = 1; d[y][x] = n; } };
  const set = (x, y, v, n) => { t[y][x] = v; d[y][x] = n || null; };
  if (key === 'ship') {
    // a FULL ship: stern on the left, pointed bow on the right, sea all around
    const span = [[3, 5], [2, 6], [1, 7], [1, 7], [1, 7], [1, 7], [1, 7], [1, 7], [1, 7], [1, 7], [1, 7], [2, 6], [3, 5], [4, 4]];
    for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) if (y < span[x][0] || y > span[x][1]) set(x, y, 3);
    if (stage === 0) { ob(4, 2, 'crate'); ob(4, 6, 'crate'); ob(7, 3, 'barrel'); ob(8, 6, 'crate'); ob(9, 2, 'barrel'); ob(6, 5, 'crate'); }
    if (stage === 1) { [3, 6, 9].forEach(x => { ob(x, 1, 'cannon'); ob(x, 7, 'cannon'); }); ob(7, 4, 'barrel'); ob(5, 3, 'crate'); }
    if (stage === 2) { ob(4, 4, 'mast'); ob(9, 4, 'mast'); ob(6, 2, 'rope'); ob(7, 6, 'rope'); ob(2, 1, 'helm'); }
  } else if (key === 'pond') {
    [[6, 3], [7, 3], [6, 4], [7, 4], [8, 4], [6, 5], [7, 5], [7, 2]].forEach(([x, y]) => set(x, y, 4));
    const mud = [[2, 2], [3, 2], [3, 3], [2, 6], [3, 6], [4, 7], [10, 1], [10, 2], [11, 6], [10, 7], [5, 1], [9, 6]];
    if (stage >= 1) mud.push([1, 1], [2, 1], [4, 2], [3, 4], [3, 5], [4, 6], [9, 1], [11, 2], [9, 5], [10, 5], [11, 5], [11, 3]);
    if (stage >= 2) mud.push([5, 6], [5, 7], [9, 7], [12, 4], [11, 4], [5, 2], [9, 2]);
    mud.forEach(([x, y]) => set(x, y, 2));
    ob(1, 8, 'reed'); ob(5, 0, 'reed'); ob(12, 0, 'reed'); ob(12, 8, 'reed'); ob(10, 4, 'reed');
  } else if (key === 'desert') {
    if (stage === 0) { ob(4, 2, 'rock'); ob(5, 6, 'cactus'); ob(8, 1, 'cactus'); ob(9, 7, 'rock'); ob(11, 4, 'cactus'); ob(2, 7, 'rock'); }
    else if (stage === 1) { [[4, 0], [4, 1], [4, 2], [4, 3], [8, 5], [8, 6], [8, 7], [8, 8], [11, 2], [11, 3], [10, 0]].forEach(([x, y]) => ob(x, y, 'rock')); ob(2, 7, 'cactus'); ob(12, 7, 'cactus'); }
    else { ob(4, 1, 'pillar'); ob(4, 7, 'pillar'); ob(7, 3, 'pillar'); ob(7, 5, 'pillar'); ob(10, 1, 'pillar'); ob(10, 7, 'pillar'); }
  } else if (key === 'stronghold') {
    if (stage === 0) { [0, 1, 2, 6, 7, 8].forEach(y => ob(6, y, 'wall')); ob(3, 2, 'pillar'); ob(3, 6, 'pillar'); ob(10, 2, 'pillar'); ob(10, 6, 'pillar'); }
    else { ob(4, 2, 'pillar'); ob(4, 6, 'pillar'); ob(9, 2, 'pillar'); ob(9, 6, 'pillar'); ob(7, 4, 'hourglass'); }
  } else if (key === 'school') {
    const floor = stage + 1, doors = extra || [];
    for (let x = 0; x < COLS; x++) { ob(x, 0, 'locker'); ob(x, 8, 'locker'); }
    doors.forEach(dr => set(dr.x, dr.y, 5, 'door'));
    const props = [[[5, 4, 'plant'], [10, 6, 'trash']], [[6, 3, 'fountain'], [3, 6, 'bench']], [[8, 5, 'plant'], [5, 2, 'trash'], [11, 2, 'bench']],
      [[4, 4, 'fountain'], [9, 3, 'plant'], [9, 6, 'trash']], [[6, 5, 'bench'], [9, 2, 'plant'], [3, 3, 'trash']]][floor - 1] || [];
    props.forEach(([x, y, n]) => ob(x, y, n));
  } else if (key === 'village') {
    VILLAGE_NPCS.forEach((n, i) => { const [hx, hy] = n.house; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) ob(hx + dx, hy + dy, dx || dy ? 'part' : 'house:' + i); });
    ob(7, 4, 'fountain'); ob(12, 1, 'tree'); ob(12, 7, 'tree'); ob(0, 0, 'tree'); ob(0, 8, 'tree'); ob(4, 4, 'tree');
  }
  return { t, d };
}

function makeQuestion(subject, level) {
  if (subject === 'Math') {
    const op = pick(level < 2 ? ['+', '-'] : level < 4 ? ['+', '-', '×'] : ['×', '÷', '+', '-']);
    let a = rnd(2, 10 + level * 8), b = rnd(2, 6 + level * 4), ans;
    if (op === '+') ans = a + b; if (op === '-') { if (b > a) [a, b] = [b, a]; ans = a - b; }
    if (op === '×') { a = rnd(2, 4 + level * 2); b = rnd(2, 12); ans = a * b; }
    if (op === '÷') { b = rnd(2, 12); ans = rnd(2, 12); a = b * ans; }
    const opts = new Set([ans]); while (opts.size < 4) opts.add(Math.max(0, ans + rnd(-10, 10)));
    const arr = shuffle([...opts]);
    return { q: `What is ${a} ${op} ${b}?`, a: arr.map(String), c: arr.indexOf(ans) };
  }
  const [q, a, c] = pick(QUESTIONS[subject] || QUESTIONS.Science);
  const order = shuffle([0, 1, 2, 3]);
  return { q, a: order.map(i => a[i]), c: order.indexOf(c) };
}

class Engine {
  constructor(onChange) { this.onChange = onChange; this.s = null; this.timer = null; this.hostOwner = 'local'; }
  changed() { if (this.onChange) this.onChange(this.s); }
  init(mode, arena) {
    this.s = { phase: 'lobby', mode, arena: arena || null, map: 0, stage: 0, day: null, players: [], enemies: [], npcs: [], traps: [], doors: [], test: null,
      tiles: null, deco: null, order: [], cur: 0, side: 'players', eIdx: 0, round: 1, queens: [], log: [], fx: [], seq: 0, nid: 1, snapshot: null, stageName: '' };
    this.changed();
  }
  load(state) { this.s = state; }
  log(m) { this.s.log.push(m); if (this.s.log.length > 80) this.s.log.shift(); }
  fx(e) { e.seq = ++this.s.seq; this.s.fx.push(e); if (this.s.fx.length > 40) this.s.fx.shift(); }
  schedule(ms, fn) { clearTimeout(this.timer); this.timer = setTimeout(() => { this.timer = null; fn(); }, ms); }
  find(id) { return this.s.players.find(p => p.id === id) || this.s.enemies.find(e => e.id === id); }
  alivePlayers() { return this.s.players.filter(p => p.alive && !p.away); }
  aliveEnemies() { return this.s.enemies.filter(e => e.alive); }
  hostiles() { return this.s.enemies.filter(e => e.alive && e.hostile); }
  current() { return this.s.side === 'players' ? this.find(this.s.order[this.s.cur]) : null; }
  mine(sender, pid) { return this.s.players.find(q => q.id === pid && q.owner === sender); }

  // ---------- players ----------
  addPlayer(owner, ch) {
    const s = this.s; if (!ch || !CLASSES[ch.cls]) return;
    if (s.phase !== 'lobby') { this.log(`${ch.name} tried to join, but the adventure already started.`); this.changed(); return; }
    const C = CLASSES[ch.cls], stats = {};
    let spent = 0;
    for (const k in STAT_NAMES) { stats[k] = Math.max(C.base[k], Math.min(40, Math.floor(+ch.stats?.[k] || 0))); spent += stats[k] - C.base[k]; }
    if (spent > START_POINTS) for (const k in STAT_NAMES) stats[k] = C.base[k] + 4;
    const p = { id: 'p' + (s.nid++), owner, name: String(ch.name || 'Hero').slice(0, 16), cls: ch.cls, lvl: 1, xp: 0, stats, points: 0, x: 0, y: 0,
      status: {}, shield: 0, god: 0, gold: START_GOLD, alive: true, away: false, moved: false, acted: false, itemUsed: false, hint: 0, pet: null,
      equip: { weapon: null, armor: 'a_cloth:' + ITEMS.a_cloth.dur, offhand: null },
      inv: ['potion', 'potion', 'potion', 'mana', 'herb', 'ticket'].concat(Array(START_SLOTS - 6).fill(null)) };
    this.recalc(p); p.hp = p.maxHp; p.mp = p.maxMp;
    s.players.push(p); this.log(`⚔️ ${p.name} the ${C.name} joined the party!`); this.changed();
  }
  recalc(p) {
    const C = CLASSES[p.cls], w = gearOf(p, 'weapon');
    p.maxHp = C.hp + p.stats.res * 3 + (p.lvl - 1) * 8 + (p.pet && p.pet.type === 'guard' ? 8 * petLvl(p) : 0);
    p.maxMp = 10 + p.stats.eng * 3 + ((w && w.mp) || 0);
    p.hp = Math.min(p.hp ?? p.maxHp, p.maxHp); p.mp = Math.min(p.mp ?? p.maxMp, p.maxMp);
  }
  give(p, id) { const i = p.inv.indexOf(null); if (i < 0) return false; p.inv[i] = id; return true; }
  markAway(owner) {
    const s = this.s;
    if (s.phase === 'lobby') { s.players = s.players.filter(p => p.owner !== owner); this.changed(); return; }
    let wasCur = false;
    s.players.forEach(p => { if (p.owner === owner) { p.away = true; this.log(`📴 ${p.name} disconnected.`); if (this.current() === p) wasCur = true; } });
    if (s.test && !this.alivePlayers().some(p => p.id === s.test.pid)) s.test = null;
    if (s.phase === 'battle' && !this.checkEnd() && wasCur) this.nextPlayer(); else this.changed();
  }

  // ---------- stages ----------
  start() {
    const s = this.s; if (!s.players.length) return;
    s.map = s.arena ? s.arena.map : 0; s.stage = 0;
    this.buildStage();
  }
  stageDef() {
    const s = this.s;
    if (s.arena) return { name: 'Dragon Arena', dragons: s.arena.dragons };
    return MAPS[s.map].stages[s.stage];
  }
  freeNear(x, y) {
    const s = this.s;
    for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (blockedTile(s.tiles[ny][nx]) || s.tiles[ny][nx] === 5) continue;
      if (this.occupant(nx, ny)) continue;
      if (s.exit && s.exit.x === nx && s.exit.y === ny) continue;
      return { x: nx, y: ny };
    }
    return { x, y };
  }
  randomSpot(minD = 3) {
    const s = this.s, ps = this.alivePlayers(), spots = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (blockedTile(s.tiles[y][x]) || s.tiles[y][x] === 5 || this.occupant(x, y)) continue;
      if (s.exit && s.exit.x === x && s.exit.y === y) continue;
      const d = ps.length ? Math.min(...ps.map(p => cheb(p, { x, y }))) : 9;
      if (d >= minD) spots.push({ x, y });
    }
    return spots.length ? pick(spots) : this.freeNear(11, 4);
  }
  occupant(x, y, ignore) {
    const s = this.s;
    return s.players.find(p => p.alive && !p.away && p.x === x && p.y === y && p.id !== ignore) ||
      s.enemies.find(e => e.alive && e.x === x && e.y === y && e.id !== ignore) ||
      (s.npcs || []).find(n => n.x === x && n.y === y && n.id !== ignore);
  }
  spawnDragon(tribe, at, chief, quiet) {
    const s = this.s, st = this.stageDef(), queen = chief && !!st.queen, boss = chief && !!st.boss;
    const hp = chief ? QUEEN.hp : rnd(50, 100);
    const e = { id: 'e' + (s.nid++), kind: 'dragon', tribe, name: boss ? st.boss : TRIBES[tribe].name + (queen ? ' Queen' : ''), boss: chief, queen, chief,
      hostile: true, hp, maxHp: hp, x: at.x, y: at.y, status: {}, shield: 0, alive: true,
      pow: (s.arena ? 1 : s.map + s.stage) + (chief ? QUEEN.pow : 0), ac: TRIBES[tribe].ac + (chief ? QUEEN.ac : 0) };
    s.enemies.push(e);
    this.fx({ kind: 'spawn', id: e.id, tribe });
    if (!quiet) this.log(`🐉 A wild ${e.name} swoops in from ${['the clouds', 'nowhere', 'behind you', 'the shadows'][rnd(0, 3)]}!`);
    return e;
  }
  spawnPerson(ptype, at, quiet) {
    const s = this.s, P = PEOPLE[ptype], bully = P.kind === 'bully';
    const lvl = Math.max(1, rnd(1, 2) + (s.day || 1) - 1 + Math.floor(s.stage / 2));
    const hp = rnd(P.hp[0], P.hp[1]) + lvl * 5;
    const first = bully ? pick(BULLY_NAMES) : pick(FIRST_NAMES);
    const e = { id: 'e' + (s.nid++), kind: P.kind, ptype, name: first, title: P.title, lvl, hostile: bully, grudge: null,
      hp, maxHp: hp, x: at.x, y: at.y, status: {}, shield: 0, alive: true, pow: 1 + lvl, ac: P.ac + Math.floor(lvl / 2) };
    s.enemies.push(e);
    this.fx({ kind: 'spawn', id: e.id, person: true });
    if (!quiet && bully) this.log(`😈 ${e.name} the ${P.title} (Lv ${lvl}) storms into the hallway!`);
    return e;
  }
  spawnWave() {
    const s = this.s, st = this.stageDef(), M = MAPS[s.map];
    if (s.arena) return;
    if (M.type === 'school') {
      const every = (s.day || 1) >= 3 ? 2 : 3, bullies = s.enemies.filter(e => e.alive && e.kind === 'bully').length;
      if (s.round % every === 0 && bullies < 2 + this.alivePlayers().length + Math.floor(st.floor / 2)) this.spawnPerson(pick(BULLY_TYPES), this.randomSpot(4), false);
      return;
    }
    if (!st.every) return;
    const alive = this.aliveEnemies().length, cap = 2 + this.alivePlayers().length;
    const due = s.round % st.every === 0 || (alive === 0 && !st.queen && !st.boss);
    if (due && alive < cap) this.spawnDragon(M.tribe, this.randomSpot(), false, false);
  }
  placePlayers(spawns) {
    const s = this.s;
    s.players.forEach(p => { p.x = -9; p.y = -9; });
    s.players.forEach((p, i) => { if (p.away) return; const sp = spawns[i % spawns.length]; const f = this.freeNear(sp[0], sp[1]); p.x = f.x; p.y = f.y; p.status = {}; p.shield = 0; });
  }
  buildStage() {
    const s = this.s, M = MAPS[s.map];
    clearTimeout(this.timer);
    s.traps = []; s.enemies = []; s.npcs = []; s.doors = []; s.test = null; s.exit = null; s.exitOpen = false; s.kills = 0; s.need = 0;
    if (!s.arena && M.type === 'village') return this.buildVillage();
    if (!s.arena && M.type === 'school') return this.buildFloor();
    const st = this.stageDef();
    const tl = buildTiles(M.key, s.arena ? (s.arena.stage || 0) : s.stage);
    s.tiles = tl.t; s.deco = tl.d; s.stageName = st.name;
    this.placePlayers([[1, 4], [1, 3], [1, 5], [2, 4], [2, 3], [2, 5], [0, 4], [2, 2]]);
    const n = s.players.filter(p => !p.away).length;
    s.need = st.kills || 0;
    if (st.exit) { const [ex, ey] = st.exit; s.tiles[ey][ex] = 0; s.deco[ey][ex] = null; s.exit = { x: ex, y: ey, icon: st.exitIcon || '➡️' }; }
    if (s.arena) {
      const eSp = [[10, 4], [10, 3], [11, 5], [9, 2], [9, 6], [11, 4]];
      st.dragons.forEach((tr, i) => { const f = this.freeNear(eSp[i % eSp.length][0], eSp[i % eSp.length][1]); this.spawnDragon(tr, f, false, true); });
    } else {
      if (st.queen || st.boss) this.spawnDragon(M.tribe, this.freeNear(10, 4), true, true);
      const count = (st.start || 1) + Math.floor((n - 1) / 2);
      for (let i = 0; i < count; i++) this.spawnDragon(M.tribe, this.randomSpot(), false, true);
    }
    s.snapshot = JSON.stringify(s.players);
    s.phase = 'battle'; s.round = 1;
    this.log(`🗺️ ${M.name}: ${st.name}`);
    if (!s.arena) {
      if (st.queen) this.log(`👑 The ${s.enemies[0].name} rules here. Defeat her to make peace with her tribe! More ${TRIBES[M.tribe].name}s will keep coming.`);
      else if (st.boss) this.log(`⏳ The ${st.boss} guards the Time Vault. Defeat it to open the time portal!`);
      else this.log(`🎯 Defeat ${s.need} ${TRIBES[M.tribe].name}s to open the exit ${s.exit.icon}, then walk there.`);
    }
    const chief = s.enemies.find(e => e.chief);
    this.fx({ kind: 'banner', text: chief ? (chief.queen ? '👑 ' : '⏳ ') + chief.name : st.name, sub: chief ? (chief.queen ? 'Defeat the Queen to make peace!' : 'Defeat it to open the time portal!') : M.name });
    this.startRound();
  }
  buildVillage() {
    const s = this.s, st = this.stageDef(), tl = buildTiles('village', 0);
    s.tiles = tl.t; s.deco = tl.d; s.stageName = st.name;
    s.npcs = VILLAGE_NPCS.map((n, i) => ({ id: 'n' + i, idx: i, role: n.role, name: n.name, icon: n.icon, shirt: n.shirt, x: n.x, y: n.y }));
    const [ex, ey] = st.exit; s.exit = { x: ex, y: ey, icon: st.exitIcon }; s.exitOpen = true;
    this.placePlayers([[1, 4], [2, 4], [1, 5], [2, 5], [1, 3], [2, 3], [3, 5], [3, 3]]);
    s.players.forEach(p => { if (!p.alive) p.alive = true; p.hp = p.maxHp; p.mp = p.maxMp; p.status = {}; });
    s.phase = 'explore'; s.side = 'players';
    this.log('🏘️ A peaceful village! Walk around and click people to talk, shop, train dragons and spin the wheel. Walk to 🏜️ to leave.');
    this.fx({ kind: 'banner', text: '🏘️ Peaceful Village', sub: 'Walk around and talk to people' });
    this.changed();
  }
  buildFloor() {
    const s = this.s, st = this.stageDef(), floor = st.floor;
    if (!s.day) s.day = 1;
    const spots = st.doors === 1 ? [[7, floor % 2 ? 0 : 8]] : [[4, 0], [10, 8]];
    s.doors = spots.map(([x, y], i) => ({ x, y, subject: SUBJECTS[(floor * 2 + i + s.day) % SUBJECTS.length], passed: false }));
    const tl = buildTiles('school', s.stage, s.doors);
    s.tiles = tl.t; s.deco = tl.d; s.stageName = `Day ${s.day} — ${st.name}`;
    s.exit = { x: 13, y: 4, icon: st.bed ? '🛏️' : '🪜' }; s.tiles[4][13] = 0; s.deco[4][13] = null;
    this.placePlayers([[1, 4], [1, 3], [1, 5], [2, 4], [2, 3], [2, 5], [0, 4], [2, 2]]);
    const n = this.alivePlayers().length;
    for (let i = 0; i < 3 + Math.floor(floor / 2); i++) this.spawnPerson(pick(STUDENT_TYPES), this.randomSpot(2), true);
    const bullies = 1 + Math.floor(floor / 2) + Math.floor((s.day - 1) / 2) + Math.floor((n - 1) / 2);
    for (let i = 0; i < bullies; i++) this.spawnPerson(pick(BULLY_TYPES), this.randomSpot(4), true);
    s.snapshot = JSON.stringify(s.players);
    s.phase = 'battle'; s.round = 1;
    this.log(`🏫 Yorkson Creek Middle — Day ${s.day}, ${st.name}. Enter the classroom door${s.doors.length > 1 ? 's' : ''} 🚪 and pass the test${s.doors.length > 1 ? 's' : ''} to unlock the ${st.bed ? 'bed 🛏️' : 'stairs 🪜'}.`);
    this.log('🧑‍🎓 Students are friendly (talk to them for test hints) — but they fight back if attacked. 😈 Bullies chase you!');
    this.fx({ kind: 'banner', text: `🏫 Day ${s.day} — ${st.name}`, sub: 'Pass the tests • watch out for bullies' });
    this.startRound();
  }
  startRound() {
    const s = this.s; s.side = 'players';
    s.order = this.alivePlayers().sort((a, b) => b.stats.spd - a.stats.spd).map(p => p.id);
    s.cur = -1; this.nextPlayer();
  }
  nextPlayer() {
    const s = this.s; if (s.phase !== 'battle') return;
    while (true) {
      s.cur++;
      if (s.cur >= s.order.length) { this.enemyPhase(); return; }
      const p = this.find(s.order[s.cur]);
      if (p && p.alive && !p.away) break;
    }
    const p = this.current();
    p.moved = p.acted = p.itemUsed = false;
    p.mp = Math.min(p.maxMp, p.mp + 2 + Math.floor(p.stats.eng / 5));
    p.god = Math.min(6, p.god + 1);
    const skip = this.tickStatus(p);
    if (this.checkEnd()) return;
    if (!p.alive) { this.changed(); this.schedule(900, () => this.nextPlayer()); return; }
    if (skip) { this.log(`${STATUS[skip].icon} ${p.name} is ${STATUS[skip].name.toLowerCase()} and loses the turn!`); this.changed(); this.schedule(1300, () => this.nextPlayer()); return; }
    this.changed();
  }
  tickStatus(e) {
    let skip = null;
    for (const k of Object.keys(e.status)) {
      const def = STATUS[k];
      if (def.dot && e.alive) { this.log(`${def.icon} ${e.name} takes ${def.dot} ${k} damage.`); this.hurt(e, def.dot, null, true); }
      if (def.skip && !skip) skip = k;
      e.status[k]--; if (e.status[k] <= 0) delete e.status[k];
    }
    return e.alive ? skip : null;
  }
  enemyPhase() {
    const s = this.s; s.side = 'enemies'; s.eIdx = 0; this.changed();
    this.schedule(600, () => this.enemyStep());
  }
  enemyStep() {
    const s = this.s; if (s.phase !== 'battle' || s.side !== 'enemies') return;
    while (s.eIdx < s.enemies.length && !s.enemies[s.eIdx].alive) s.eIdx++;
    if (s.eIdx >= s.enemies.length) { this.endRound(); return; }
    const e = s.enemies[s.eIdx++];
    s.active = e.id;
    const skip = this.tickStatus(e);
    if (this.checkEnd()) return;
    const calm = !e.hostile;
    if (e.alive && skip) this.log(`${STATUS[skip].icon} ${e.name} is ${STATUS[skip].name.toLowerCase()} and can't act!`);
    else if (e.alive) this.ai(e);
    this.changed();
    if (this.checkEnd()) return;
    this.schedule(calm ? 200 : 1100, () => this.enemyStep());
  }
  endRound() {
    const s = this.s; s.round++; s.active = null;
    s.traps.forEach(t => t.ttl--); s.traps = s.traps.filter(t => t.ttl > 0);
    this.spawnWave();
    this.startRound();
  }
  resume() { // after host migration
    const s = this.s; if (!s || s.phase !== 'battle') return;
    if (s.side === 'enemies') this.schedule(800, () => this.enemyStep());
    else { const p = this.current(); if (!p || p.away || !p.alive) this.nextPlayer(); }
  }
  checkEnd() {
    const s = this.s; if (s.phase !== 'battle') return true;
    const st = this.stageDef();
    if (s.arena && !this.aliveEnemies().length) { this.stageClear(); return true; }
    if (!s.arena && (st.queen || st.boss) && !s.enemies.some(e => e.chief && e.alive)) { this.stageClear(); return true; }
    if (!this.alivePlayers().length) { clearTimeout(this.timer); s.test = null; s.phase = 'over'; this.log('💀 The party has fallen...'); this.changed(); return true; }
    return false;
  }
  stageClear() {
    const s = this.s, st = this.stageDef(); clearTimeout(this.timer); s.phase = 'clear'; s.active = null; s.test = null;
    const q = s.enemies.find(e => e.chief);
    if (q && q.queen && !s.arena) {
      if (!s.queens.includes(q.tribe)) s.queens.push(q.tribe);
      this.log(`🕊️ The ${q.name} bows down. The ${TRIBES[q.tribe].name}s agree to peace! (${s.queens.length}/${TOTAL_QUEENS} queens)`);
      this.fx({ kind: 'banner', text: '🕊️ Peace with the ' + TRIBES[q.tribe].name + 's!', sub: `Queens defeated: ${s.queens.length} / ${TOTAL_QUEENS}` });
    } else if (q && !s.arena) {
      this.log(`⏳ The ${q.name} falls! The Time Vault glows… a portal opens and pulls you into the FUTURE!`);
      this.fx({ kind: 'banner', text: '⏳ The time portal opens!', sub: 'You are pulled into the future…' });
      this.fx({ kind: 'warp' });
    } else if (st.bed) {
      this.log(`😴 Everyone sleeps. Day ${s.day} survived!`);
      this.fx({ kind: 'banner', text: `😴 Day ${s.day} survived!`, sub: s.day >= SCHOOL_DAYS ? 'That was the last day!' : 'Sleep well…' });
    } else this.fx({ kind: 'banner', text: s.arena ? 'Victory!' : 'Onward!', sub: s.stageName + ' cleared' });
    if (s.enemies.some(e => e.alive && e.hostile) && !s.arena) this.log('🏃 The enemies left behind give up the chase.');
    this.log(`🏆 ${s.stageName} complete!`);
    this.changed();
  }
  win(msg) { const s = this.s; s.phase = 'victory'; this.log(msg); this.changed(); }
  advance() {
    const s = this.s, M = MAPS[s.map], st = this.stageDef();
    s.players.forEach(p => {
      if (!p.alive) { p.alive = true; p.hp = Math.ceil(p.maxHp / 2); }
      else p.hp += Math.ceil((p.maxHp - p.hp) / 2);
      p.mp += Math.ceil((p.maxMp - p.mp) / 2); p.status = {}; p.shield = 0;
    });
    if (s.arena) { s.phase = 'victory'; this.changed(); return; }
    if (M.type === 'school') {
      if (st.bed) {
        s.day++;
        if (s.day > SCHOOL_DAYS) return this.win(`🏆 You survived ${SCHOOL_DAYS} days at Yorkson Creek Middle School! The future is safe!`);
        s.stage = 0;
        s.players.forEach(p => { p.hp = p.maxHp; p.mp = p.maxMp; if (this.give(p, 'ticket')) this.log(`🎟️ ${p.name} gets a free Wheel Ticket for the new day!`); });
        this.log(`☀️ Good morning! Day ${s.day} begins on Floor 1.`);
      } else s.stage++;
      return this.buildStage();
    }
    s.stage++;
    if (s.stage >= M.stages.length) { s.map++; s.stage = 0; }
    if (s.map >= MAPS.length) return this.win('🏆 You beat the whole game!');
    if (MAPS[s.map].type === 'school') { s.day = 1; this.log('🌀 WHOOSH! You land in the future… at Yorkson Creek Middle School!'); }
    this.buildStage();
  }
  grantXp(amount) {
    for (const p of this.s.players) {
      p.xp += amount;
      while (p.xp >= xpNeed(p.lvl)) {
        p.xp -= xpNeed(p.lvl); p.lvl++;
        for (const k in p.stats) p.stats[k]++;
        p.points += LEVEL_POINTS; this.recalc(p); p.hp = p.maxHp; p.mp = p.maxMp;
        this.log(`⭐ ${p.name} reached level ${p.lvl}! (+1 all stats, +${LEVEL_POINTS} points)`);
        this.fx({ kind: 'level', id: p.id });
      }
    }
  }

  // ---------- shops / village / gear / pets / wheel ----------
  priceOf(id) { return (BAGS[id] || ITEMS[id] || {}).price || 0; }
  sold(id) { return BAGS[id] || VILLAGE_NPCS.some(n => (n.goods || []).includes(id)); }
  doBuy(p, id) {
    if (!this.sold(id)) return 'Not for sale';
    const price = this.priceOf(id);
    if (p.gold < price) return 'Not enough gold';
    if (BAGS[id]) {
      if (p.inv.length >= MAX_SLOTS) return `Backpack is already the biggest (${MAX_SLOTS} slots)`;
      const add = Math.min(BAGS[id].slots, MAX_SLOTS - p.inv.length);
      for (let i = 0; i < add; i++) p.inv.push(null);
      p.gold -= price; this.log(`${BAGS[id].icon} ${p.name} buys a ${BAGS[id].name}! Inventory is now ${p.inv.length} slots.`);
      this.fx({ kind: 'buff', id: p.id, color: '#c8964a' });
      return null;
    }
    if (!this.give(p, ITEMS[id].dur ? `${id}:${ITEMS[id].dur}` : id)) return 'Inventory full — buy a backpack!';
    p.gold -= price;
    this.log(`🛒 ${p.name} buys ${ITEMS[id].icon} ${ITEMS[id].name} for ${price} gold.`);
    return null;
  }
  doSell(p, slot) {
    const e = p.inv[slot]; if (!e) return 'Empty slot';
    const I = ITEMS[iid(e)], price = Math.floor((I.price || 20) / 2);
    p.inv[slot] = null; p.gold += price;
    this.log(`💰 ${p.name} sells ${I.icon} ${I.name} for ${price} gold.`);
    return null;
  }
  doEquip(p, slot) {
    const e = p.inv[slot], I = e && ITEMS[iid(e)];
    if (!I || !I.slot) return 'That is not gear';
    const old = p.equip[I.slot];
    p.equip[I.slot] = I.slot === 'armor' ? `${iid(e)}:${idur(e)}` : iid(e);
    p.inv[slot] = old || null;
    this.recalc(p);
    this.log(`🧰 ${p.name} equips ${I.icon} ${I.name}.`);
    return null;
  }
  doUnequip(p, which) {
    const e = p.equip[which]; if (!e) return 'Nothing there';
    if (!this.give(p, e)) return 'Inventory full';
    p.equip[which] = null; this.recalc(p);
    return null;
  }
  repairCost(p) { const a = p.equip.armor; if (!a) return 0; return (ITEMS[iid(a)].dur - idur(a)) * 2; }
  doRepair(p) {
    const a = p.equip.armor; if (!a) return 'No armor equipped';
    const cost = this.repairCost(p); if (!cost) return 'Your armor is already perfect';
    if (p.gold < cost) return `Repair costs ${cost} gold`;
    p.gold -= cost; p.equip.armor = `${iid(a)}:${ITEMS[iid(a)].dur}`;
    this.log(`⚒️ Blacksmith Hilda repairs ${p.name}'s ${ITEMS[iid(a)].name} for ${cost} gold.`);
    return null;
  }
  trainCost(p) { return p.pet ? 60 * p.pet.lvl : 0; }
  doTrain(p) {
    if (!p.pet) return 'You need a pet dragon first — hatch an egg!';
    if (p.pet.lvl >= PET_MAX) return `${p.pet.name} is already max level`;
    const cost = this.trainCost(p); if (p.gold < cost) return `Training costs ${cost} gold`;
    p.gold -= cost; p.pet.lvl++; this.recalc(p);
    this.log(`🐲 Dragon Keeper Ash trains ${p.pet.name}! It is now level ${p.pet.lvl}.`);
    this.fx({ kind: 'buff', id: p.id, color: '#ffb347' });
    return null;
  }
  hatch(p, type) {
    if (p.pet) return `You already have ${p.pet.name}!`;
    p.pet = { type, name: pick(PET_NAMES), tribe: PETS[type].tribe, lvl: 1 };
    this.recalc(p); if (type === 'guard') p.hp = Math.min(p.maxHp, p.hp + 8);
    this.log(`🥚✨ The egg cracks… ${p.name} hatched ${p.pet.name}, a baby ${PETS[type].name} dragon! (${PETS[type].desc})`);
    this.fx({ kind: 'hatch', id: p.id, tribe: p.pet.tribe });
    return null;
  }
  spin(p, free) {
    if (!free) { if (p.gold < WHEEL_COST) return `A spin costs ${WHEEL_COST} gold`; p.gold -= WHEEL_COST; }
    const total = sumA(WHEEL.map(w => w.w)); let r = Math.random() * total, idx = 0;
    for (; idx < WHEEL.length; idx++) { r -= WHEEL[idx].w; if (r < 0) break; }
    idx = Math.min(idx, WHEEL.length - 1);
    const W = WHEEL[idx]; let got = W.label;
    if (W.gold) p.gold += W.gold;
    const items = W.items ? W.items.slice() : W.egg ? [pick(['egg_guard', 'egg_fury', 'egg_battle'])] : [];
    for (const id of items) if (!this.give(p, ITEMS[id].dur ? `${id}:${ITEMS[id].dur}` : id)) { p.gold += 20; got += ' (bag full: +20 gold instead)'; }
    if (W.egg) got = ITEMS[items[0]].name;
    this.log(`🎡 ${p.name} spins the Wheel of Fortune… ${W.gold || items.length ? '🎉 ' : '😅 '}${got}!`);
    this.fx({ kind: 'wheel', pid: p.id, idx, label: got });
    return null;
  }

  // ---------- damage / heal ----------
  hurt(t, amt, src, raw) {
    if (!t.alive) return 0;
    const isP = t.owner !== undefined;
    if (isP && !raw && amt > 0) {
      amt = Math.max(1, amt - damageReduce(t));
      const o = gearOf(t, 'offhand');
      if (o && o.block && Math.random() < o.block) { amt = Math.ceil(amt / 2); this.fx({ kind: 'text', id: t.id, text: '🛡️ BLOCK!', color: '#9df' }); }
      const a = t.equip && t.equip.armor;
      if (a && idur(a) > 0) {
        const d = Math.max(0, idur(a) - (amt >= 15 ? 2 : 1));
        t.equip.armor = `${iid(a)}:${d}`;
        if (d === 0) { this.log(`💔 ${t.name}'s ${ITEMS[iid(a)].name} BROKE! Repair it with a Repair Kit or the Blacksmith.`); this.fx({ kind: 'text', id: t.id, text: '💔 Armor broke!', color: '#f88' }); }
      }
    }
    if (t.shield > 0) { const a = Math.min(t.shield, amt); t.shield -= a; amt -= a; if (a) this.fx({ kind: 'text', id: t.id, text: `🛡️-${a}`, color: '#9ad' }); }
    t.hp -= amt;
    this.fx({ kind: 'dmg', id: t.id, amount: amt });
    if (!isP && t.kind === 'student' && src && src.owner !== undefined && !t.hostile) {
      t.hostile = true; t.grudge = src.id;
      this.log(`😠 ${t.name} the ${t.title} is ANGRY at ${src.name} and fights back!`);
      this.fx({ kind: 'text', id: t.id, text: '😠 ANGRY!', color: '#f66' });
    }
    if (t.hp <= 0) {
      t.hp = 0; t.alive = false;
      if (isP) { this.log(`💀 ${t.name} has fallen!`); if (this.s.test && this.s.test.pid === t.id) this.s.test = null; }
      else this.onKill(t, src);
    }
    return amt;
  }
  onKill(t, src) {
    const s = this.s;
    this.fx({ kind: 'die', id: t.id });
    if (t.kind === 'student') { this.log(`😵 ${t.name} is knocked out and sent to the nurse. (Not very nice…)`); this.grantXp(15); return; }
    this.log(`☠️ ${t.kind === 'bully' ? t.name + ' the ' + t.title : t.name} is defeated!`);
    s.kills = (s.kills || 0) + 1;
    if (s.exit && !s.exitOpen && s.need && s.kills >= s.need) {
      s.exitOpen = true;
      this.log(`🚪 The way is open! Walk to the exit ${s.exit.icon} to travel on.`);
      this.fx({ kind: 'banner', text: `${s.exit.icon} The exit is open!`, sub: 'Walk to the glowing tile to travel on' });
    }
    const xp = t.kind === 'bully' ? 30 + t.lvl * 6 : 40 + Math.floor(t.maxHp / 3);
    this.grantXp(xp);
    const gold = t.chief ? GOLD_PER_QUEEN : t.kind === 'bully' ? rnd(5, 12) : rnd(GOLD_PER_KILL[0], GOLD_PER_KILL[1]);
    s.players.forEach(p => p.gold = (p.gold || 0) + gold);
    this.log(`✨ Everyone gains ${xp} XP and 💰 ${gold} gold.`);
    const drops = Math.random() < (t.kind === 'bully' ? 0.4 : 1) ? [pick(LOOT_TABLE)] : [];
    if (Math.random() < 0.4) drops.push(pick(LOOT_TABLE));
    if (t.chief) drops.push(pick(['egg_guard', 'egg_fury', 'egg_battle']));
    for (const it of drops) {
      const order = [src, ...s.players].filter(p => p && p.owner !== undefined);
      const who = order.find(p => p.inv.includes(null));
      if (who) { this.give(who, ITEMS[it].dur ? `${it}:${ITEMS[it].dur}` : it); this.log(`🎁 ${who.name} found ${ITEMS[it].icon} ${ITEMS[it].name}!`); }
    }
  }
  heal(t, amt) {
    const before = t.hp; t.hp = Math.min(t.maxHp, t.hp + amt);
    this.fx({ kind: 'heal', id: t.id, amount: t.hp - before });
    return t.hp - before;
  }
  cleanse(t) { for (const k of Object.keys(t.status)) if (STATUS[k].bad) delete t.status[k]; }
  addStatus(t, k, turns) {
    if (k === 'random') k = pick(['burn', 'freeze', 'stun', 'blur', 'poison', 'slow']);
    t.status[k] = Math.max(t.status[k] || 0, turns);
    this.fx({ kind: 'text', id: t.id, text: STATUS[k].icon + ' ' + STATUS[k].name.split(' ')[0], color: '#ffd' });
    return k;
  }

  // ---------- path finding ----------
  reach(ent, maxCost, fly) {
    const s = this.s, best = new Map(), key = (x, y) => x + ',' + y;
    best.set(key(ent.x, ent.y), { c: 0, x: ent.x, y: ent.y, prev: null });
    const q = [{ x: ent.x, y: ent.y, c: 0 }];
    while (q.length) {
      q.sort((a, b) => a.c - b.c); const cur = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const tt = s.tiles[ny][nx];
        if (!fly && blockedTile(tt)) continue;
        if (tt === 5 && ent.owner === undefined) continue; // only heroes enter classrooms
        if (this.occupant(nx, ny, ent.id)) continue;
        const c = cur.c + (!fly && tt === 2 ? 2 : 1);
        if (c > maxCost) continue;
        const k = key(nx, ny), old = best.get(k);
        if (!old || old.c > c) { best.set(k, { c, x: nx, y: ny, prev: key(cur.x, cur.y) }); q.push({ x: nx, y: ny, c }); }
      }
    }
    if (fly) for (const [k, v] of best) if (blockedTile(s.tiles[v.y][v.x])) best.delete(k);
    return best;
  }
  stepToward(e, target, steps, want, fly) {
    const s = this.s, r = this.reach(e, steps, fly);
    let best = null, bs = 1e9;
    for (const v of r.values()) {
      if (s.exit && v.x === s.exit.x && v.y === s.exit.y) continue;
      const d = cheb(v, target), sc = Math.max(0, d - want) * 10 + v.c * 0.1;
      if (sc < bs) { bs = sc; best = v; }
    }
    if (best) { e.x = best.x; e.y = best.y; }
  }

  // ---------- AI ----------
  ai(e) {
    const s = this.s, D = edef(e), ps = this.alivePlayers(); if (!ps.length) return;
    // students: friendly unless you attacked them
    if (e.kind === 'student' && !e.hostile) {
      if (Math.random() < 0.6 && !e.status.root) { const r = [...this.reach(e, 1).values()].filter(v => v.c === 1); if (r.length) { const v = pick(r); e.x = v.x; e.y = v.y; } }
      return;
    }
    if (e.kind === 'student' && e.hp < e.maxHp * 0.3 && !e.retreated) { // smart: retreat and patch up
      e.retreated = true;
      const r = [...this.reach(e, D.move).values()];
      const far = r.reduce((a, b) => Math.min(...ps.map(p => cheb(p, a))) >= Math.min(...ps.map(p => cheb(p, b))) ? a : b, r[0]);
      if (far) { e.x = far.x; e.y = far.y; }
      this.heal(e, 10);
      if (Math.random() < 0.5) { e.hostile = false; this.log(`🩹 ${e.name} runs off, uses a band-aid and decides you're not worth it.`); }
      else this.log(`🩹 ${e.name} smartly backs off and patches up (+10 HP).`);
      return;
    }
    if (D.shieldPower && !e.shield && Math.random() < 0.35) { e.shield = D.shieldPower; this.log(`🤖 ${e.name}'s Robo Buddy builds a shield (+${D.shieldPower})!`); this.fx({ kind: 'text', id: e.id, text: '🤖 Shield!', color: '#9df' }); return; }
    if (e.kind === 'dragon') {
      const T = D;
      if (e.chief && !e.summoned && e.hp < e.maxHp / 2) {
        e.summoned = true;
        const f = this.freeNear(e.x + 1, e.y);
        const g = this.spawnDragon(e.tribe, f, false, true); g.name = 'Royal Guard'; g.hp = g.maxHp = QUEEN.guardHp; g.pow = e.pow - 1;
        this.log(`👑 The ${e.name} roars: "GUARDS!" A Royal Guard ${T.name} flies in!`);
        this.fx({ kind: 'text', id: e.id, text: '👑 GUARDS!', color: '#ffd700' });
        return;
      }
      if (e.tribe === 'sky' && isDesert(s) && s.traps.length < 8 && Math.random() < 0.35) {
        let placed = 0;
        for (let tries = 0; tries < 30 && placed < 2; tries++) {
          const p = pick(ps), x = p.x + rnd(-2, 2), y = p.y + rnd(-2, 2);
          if (x < 0 || y < 0 || x >= COLS || y >= ROWS || s.tiles[y][x] !== 0 || this.occupant(x, y) || s.traps.some(t => t.x === x && t.y === y)) continue;
          if (s.exit && s.exit.x === x && s.exit.y === y) continue;
          s.traps.push({ x, y, ttl: 8 }); placed++;
        }
        this.log(`🪤 ${e.name} hides fire traps in the sand!`);
        this.fx({ kind: 'trap', id: e.id });
        return;
      }
      if (e.tribe === 'rain' && !e.status.camo && Math.random() < 0.22) { e.status.camo = 2; this.log(`🦎 ${e.name} changes color and vanishes (camouflage)!`); this.fx({ kind: 'text', id: e.id, text: '👻 Camouflage', color: '#afa' }); return; }
      if (e.tribe === 'mud' && !e.bathed && e.hp < e.maxHp * 0.4) { e.bathed = true; this.heal(e, 15); this.log(`🟤 ${e.name} rolls in the mud and heals!`); return; }
      if (e.tribe === 'night' && !e.status.camo && Math.random() < 0.25) { e.status.camo = 1; this.log(`🌙 ${e.name} reads your minds and will dodge attacks!`); this.fx({ kind: 'text', id: e.id, text: '🧠 Mind Read', color: '#c9f' }); }
    }
    let target;
    if (e.grudge) target = ps.find(p => p.id === e.grudge);
    if (!target) {
      if (e.tribe === 'night') target = ps.reduce((a, b) => a.hp <= b.hp ? a : b);
      else if (e.tribe === 'sky') target = pick(ps);
      else target = ps.reduce((a, b) => cheb(e, a) <= cheb(e, b) ? a : b);
    }
    // Rumor Ghost teleports next to you
    if (D.blink && cheb(e, target) > 2 && Math.random() < 0.5) {
      const f = this.freeNear(target.x + (e.x > target.x ? 1 : -1), target.y);
      if (cheb(f, target) <= 2) { e.x = f.x; e.y = f.y; this.log(`👻 ${e.name} teleports right next to ${target.name}!`); this.fx({ kind: 'text', id: e.id, text: '👻 Poof!', color: '#ccc' }); }
    }
    const wantA2 = Math.random() < 0.45, want = wantA2 ? D.a2.range : 1;
    if (!e.status.root) { let mv = D.move; if (e.status.slow) mv = Math.ceil(mv / 2); this.stepToward(e, target, mv, want, !!D.fly); }
    let d = cheb(e, target), which = null;
    if (wantA2 && d <= D.a2.range) which = 'a2';
    else if (d <= 1) which = 'a1';
    else if (d <= D.a2.range) which = 'a2';
    else { const o = ps.find(p => cheb(e, p) <= D.a2.range); if (o) { target = o; which = 'a2'; } }
    if (!which) { this.log(e.kind === 'dragon' ? `🐉 ${e.name} roars and circles closer...` : `😈 ${e.name} chases you down the hall...`); return; }
    this.enemyAttack(e, target, which);
  }
  enemyAttack(e, t, which) {
    const D = edef(e), A = D[which], dz = atkDice(e, which);
    const d20 = rnd(1, 20), bonus = 5 + e.pow - (e.status.blur ? 5 : 0), ac = acOf(t);
    let hit = d20 === 20 || (d20 !== 1 && d20 + bonus >= ac), dodged = false;
    if (hit && t.status.camo && Math.random() < 0.5) { hit = false; dodged = true; }
    const dice = roll(dz[0], dz[1]);
    let dmg = Math.max(0, sumA(dice) + dz[2]);
    if (d20 === 20) dmg += 5;
    if (e.kind === 'dragon') this.fx({ kind: which === 'a2' ? 'breath' : 'slash', from: e.id, to: t.id, style: D.fx, aoe: A.aoe || 0 });
    else this.fx({ kind: A.range > 1 ? 'bolt' : 'slash', from: e.id, to: t.id, color: D.shirt, aoe: A.aoe || 0 });
    const rolls = [{ s: 20, v: d20 }, ...dice.map(v => ({ s: dz[1], v }))];
    const aoe = e.chief && which === 'a2' ? Math.max(1, A.aoe || 0) : (A.aoe || 0);
    const victims = aoe ? this.alivePlayers().filter(p => cheb(p, t) <= aoe) : [t];
    let res;
    if (!hit) res = dodged ? `${t.name} dodged!` : `Miss! (${d20}+${bonus} vs AC ${ac})`;
    else {
      const parts = [];
      for (const v of victims) {
        const dealt = this.hurt(v, dmg, e);
        let txt = `${v.name} -${dealt}`;
        if (A.status && v.alive && Math.random() < (A.chance || 1)) {
          const turns = A.turns ? rnd(A.turns[0], A.turns[1]) : Math.max(1, rnd(2, 5) - Math.floor(v.stats.res / 8));
          const k = this.addStatus(v, A.status, turns); txt += ` ${STATUS[k].icon}${turns}`;
        }
        parts.push(txt);
      }
      if (D.steal && which === 'a2' && t.alive) {
        const items = t.inv.map((x, i) => x ? i : -1).filter(i => i >= 0);
        if (t.gold >= 10 && (Math.random() < 0.6 || !items.length)) { const g = Math.min(t.gold, rnd(10, 25)); t.gold -= g; parts.push(`stole 💰${g}!`); }
        else if (items.length) { const i = pick(items); parts.push(`stole ${ITEMS[iid(t.inv[i])].icon}!`); t.inv[i] = null; }
      }
      res = parts.join(', ');
    }
    const who = e.kind === 'dragon' ? `🐉 ${e.name}` : e.kind === 'bully' ? `😈 ${e.name}` : `🧑‍🎓 ${e.name}`;
    this.log(`${who} uses ${A.name}${d20 === 20 ? ' (CRITICAL!)' : ''}: ${res}`);
    this.fx({ kind: 'dice', who: e.name, label: A.name, rolls, result: res, enemy: true });
  }
  petAttack(p) {
    if (!p.pet || p.pet.type !== 'battle' || !p.alive) return;
    const foes = this.hostiles().filter(e => cheb(e, p) <= 3);
    if (!foes.length) return;
    const t = foes.reduce((a, b) => a.hp <= b.hp ? a : b), dmg = rnd(1, 6) + 2 * petLvl(p);
    this.fx({ kind: 'bolt', from: p.id, to: t.id, color: TRIBES[p.pet.tribe].wing });
    this.log(`🐲 ${p.pet.name} attacks ${t.name} for ${this.hurt(t, dmg, p)}!`);
  }

  // ---------- player actions ----------
  apply(sender, a) {
    const s = this.s; if (!s || !a) return 'No game';
    const isHost = sender === this.hostOwner;
    switch (a.type) {
      case 'start': if (isHost && s.phase === 'lobby') this.start(); return;
      case 'next': if (isHost && s.phase === 'clear') { if (s.players.some(p => p.points > 0)) { s.phase = 'levelup'; this.changed(); } else this.advance(); } return;
      case 'force': if (isHost && s.phase === 'levelup') this.advance(); return;
      case 'retry': if (isHost && s.phase === 'over') { const away = new Set(s.players.filter(p => p.away).map(p => p.id)); s.players = JSON.parse(s.snapshot); s.players.forEach(p => { if (away.has(p.id)) p.away = true; }); this.log('🔁 Trying again!'); this.buildStage(); } return;
      case 'again': if (isHost && (s.phase === 'victory' || s.phase === 'over')) { if (!s.arena) { s.map = 0; s.stage = 0; s.queens = []; s.day = null; } s.players.forEach(p => { p.alive = true; p.hp = p.maxHp; p.mp = p.maxMp; }); this.buildStage(); } return;
      case 'alloc': {
        if (s.phase !== 'levelup') return;
        const p = this.mine(sender, a.pid); if (!p || p.points <= 0) return;
        let spent = 0; const ns = {};
        for (const k in STAT_NAMES) { ns[k] = Math.floor(+a.stats[k]); if (!(ns[k] >= p.stats[k])) return 'Bad stats'; spent += ns[k] - p.stats[k]; }
        if (spent > p.points) return 'Too many points';
        p.stats = ns; p.points -= spent; this.recalc(p); p.hp = p.maxHp; p.mp = p.maxMp;
        this.log(`📈 ${p.name} trained their stats.`);
        if (s.players.every(q => q.points <= 0 || q.away)) this.advance(); else this.changed();
        return;
      }
      case 'drop': {
        const p = this.mine(sender, a.pid); if (!p || !p.inv[a.slot]) return;
        this.log(`🗑️ ${p.name} dropped ${ITEMS[iid(p.inv[a.slot])].name}.`); p.inv[a.slot] = null; this.changed(); return;
      }
      case 'equip': case 'unequip': {
        const p = this.mine(sender, a.pid); if (!p) return;
        if (s.phase === 'battle' && this.current() !== p) return 'Change gear on your own turn';
        const err = a.type === 'equip' ? this.doEquip(p, a.slot) : this.doUnequip(p, a.which);
        if (!err) this.changed(); return err;
      }
    }
    // ---- village (free walking) ----
    if (s.phase === 'explore') {
      const p = this.mine(sender, a.pid); if (!p) return 'Not your hero';
      let err = null;
      switch (a.type) {
        case 'walk': {
          const r = this.reach(p, 80), v = r.get(a.x + ',' + a.y);
          if (!v) return 'Can\'t walk there';
          p.x = v.x; p.y = v.y;
          if (s.exit && p.x === s.exit.x && p.y === s.exit.y) { this.log(`🚶 ${p.name} leads the party out of the village…`); this.advance(); return; }
          break;
        }
        case 'rest': s.players.forEach(q => { q.hp = q.maxHp; q.mp = q.maxMp; q.status = {}; if (!q.alive) q.alive = true; }); this.log('🛏️ Innkeeper Rosa heals everyone to full!'); this.fx({ kind: 'buff', id: p.id, color: '#7dffa0' }); break;
        case 'buy': err = this.doBuy(p, a.item); break;
        case 'sell': err = this.doSell(p, a.slot); break;
        case 'repair': err = this.doRepair(p); break;
        case 'train': err = this.doTrain(p); break;
        case 'spin': err = this.spin(p, false); break;
        case 'item': err = this.doItem(p, a.slot, a.target || p.id, true); break;
        default: return 'Not here';
      }
      if (!err) this.changed(); return err;
    }
    if (a.type === 'item' && (s.phase === 'clear' || s.phase === 'levelup')) {
      const p = this.mine(sender, a.pid); if (!p) return;
      const err = this.doItem(p, a.slot, a.target || p.id, true); if (!err) this.changed(); return err;
    }
    if (s.phase !== 'battle' || s.side !== 'players') return 'Not your turn';
    const p = this.current();
    if (!p || p.id !== a.pid || p.owner !== sender) return 'Not your turn';
    if (s.test && a.type !== 'answer') return 'Finish your test first!';
    let err;
    switch (a.type) {
      case 'move': err = this.doMove(p, a.x, a.y); break;
      case 'act': err = this.doAct(p, a.kind, a.target); break;
      case 'heal': err = this.doHeal(p, a.target); break;
      case 'item': err = this.doItem(p, a.slot, a.target); break;
      case 'god': err = this.doGod(p); break;
      case 'talk': err = this.doTalk(p, a.target); break;
      case 'answer': err = this.doAnswer(p, a.choice); break;
      case 'end': this.petAttack(p); this.log(`⏭️ ${p.name} ends the turn.`); if (this.checkEnd()) return; this.nextPlayer(); return;
      default: return 'Unknown action';
    }
    if (err) return err;
    this.changed();
    if (this.checkEnd()) return;
    if (!p.alive) this.schedule(900, () => this.nextPlayer());
  }
  doMove(p, x, y) {
    if (p.moved) return 'Already walked';
    const s = this.s, r = this.reach(p, moveRange(p, s)), v = r.get(x + ',' + y);
    if (!v || v.c === 0) return 'Can\'t walk there';
    const path = []; let k = x + ',' + y;
    while (k) { const n = r.get(k); path.unshift(n); k = n.prev; }
    p.moved = true;
    for (const step of path.slice(1)) {
      p.x = step.x; p.y = step.y;
      const ti = s.traps.findIndex(t => t.x === step.x && t.y === step.y);
      if (ti >= 0) {
        s.traps.splice(ti, 1);
        const turns = rnd(5, 10), dmg = sumA(roll(1, 6));
        this.log(`🪤🔥 ${p.name} stepped on a SkyWing fire trap! Burning for ${turns} rounds!`);
        this.fx({ kind: 'boom', id: p.id });
        this.hurt(p, dmg, null); if (p.alive) this.addStatus(p, 'burn', turns);
        break;
      }
    }
    if (!p.alive) return null;
    const door = s.doors.find(dr => dr.x === p.x && dr.y === p.y);
    if (door) {
      if (door.passed) this.log(`🚪 ${p.name} already passed the ${door.subject} test here.`);
      else if (p.acted) this.log(`🚪 ${p.name} is too tired for a test right now — come back next turn!`);
      else this.startTest(p, door);
    }
    if (s.exitOpen && s.exit && p.x === s.exit.x && p.y === s.exit.y) {
      this.log(s.doors.length && this.stageDef().bed ? `🛏️ ${p.name} jumps into bed!` : `🚶 ${p.name} leads the party onward!`);
      this.stageClear();
    }
    return null;
  }
  startTest(p, door) {
    const s = this.s, level = this.stageDef().floor + s.day - 1;
    const qs = [0, 1, 2].map(() => makeQuestion(door.subject, level));
    if (p.hint > 0) { // a smart student's hint hides one wrong answer on each question
      p.hint--; qs.forEach(q => { const wrong = [0, 1, 2, 3].filter(i => i !== q.c); q.hide = pick(wrong); });
    }
    s.test = { pid: p.id, door: s.doors.indexOf(door), subject: door.subject, qs, i: 0, right: 0, last: null };
    this.log(`📝 ${p.name} enters the classroom: ${door.subject} test! Get 2 of 3 right to pass.`);
  }
  doAnswer(p, choice) {
    const s = this.s, T = s.test; if (!T || T.pid !== p.id) return 'No test';
    const q = T.qs[T.i], ok = +choice === q.c;
    T.last = { ok, correct: q.a[q.c] };
    if (ok) { T.right++; this.fx({ kind: 'text', id: p.id, text: '✔️ Correct!', color: '#7f7' }); }
    else { this.fx({ kind: 'text', id: p.id, text: '❌ Wrong!', color: '#f77' }); this.hurt(p, 4, null, true); this.log(`🤯 Wrong! (${q.a[q.c]}) ${p.name} gets a headache (-4 HP).`); }
    T.i++;
    if (!p.alive) { s.test = null; return null; }
    if (T.i >= T.qs.length) {
      const door = s.doors[T.door]; p.acted = true; s.test = null;
      if (T.right >= 2) {
        door.passed = true;
        const st = this.stageDef(), xp = 40 + st.floor * 10, gold = 10 + st.floor * 2;
        this.grantXp(xp); p.gold += gold;
        this.log(`🎓 ${p.name} PASSED the ${door.subject} test (${T.right}/3)! +${xp} XP for everyone, +${gold} gold.`);
        this.fx({ kind: 'level', id: p.id });
        if (s.doors.every(d => d.passed)) {
          s.exitOpen = true;
          this.log(`🔓 All tests passed! The ${st.bed ? 'bed 🛏️' : 'stairs 🪜'} ${st.bed ? 'is ready' : 'are unlocked'}!`);
          this.fx({ kind: 'banner', text: st.bed ? '🛏️ Bedtime is unlocked!' : '🪜 Stairs unlocked!', sub: 'Walk there to continue' });
        }
      } else this.log(`📉 ${p.name} FAILED the ${door.subject} test (${T.right}/3). Try again next turn!`);
    }
    return null;
  }
  doTalk(p, targetId) {
    const e = this.s.enemies.find(x => x.id === targetId && x.alive);
    if (!e || e.kind !== 'student' || e.hostile) return 'They don\'t want to talk';
    if (cheb(p, e) > 1) return 'Walk next to them first';
    if (e.talked) return `${e.name} already helped you`;
    e.talked = true; p.hint = (p.hint || 0) + 1;
    this.log(`💬 ${e.name} the ${e.title}: "${pick(STUDENT_TIPS)}" (+1 test hint for ${p.name}: one wrong answer gets crossed out)`);
    this.fx({ kind: 'text', id: e.id, text: '💡 Hint!', color: '#ffe066' });
    return null;
  }
  doAct(p, kind, targetId) {
    if (p.acted) return 'Already acted this turn';
    const C = CLASSES[p.cls], spec = kind === 'atk' ? C.atk : C[kind];
    if (!spec) return 'Unknown';
    const mp = spec.mp || 0; if (p.mp < mp) return 'Not enough MP';
    const tt = spec.target || 'enemy', s = this.s;
    let t = null;
    if (tt === 'enemy') {
      t = s.enemies.find(e => e.id === targetId && e.alive);
      if (!t) return 'Pick a target';
      if (cheb(p, t) > spec.range) return 'Out of range';
    }
    p.mp -= mp; p.acted = true;
    const rolls = [], parts = [], torch = gearOf(p, 'offhand');
    if (t) {
      const victims = spec.aoe ? this.aliveEnemies().filter(e => cheb(e, t) <= spec.aoe) : [t];
      this.fx({ kind: spec.range <= 2 ? 'pslash' : 'bolt', from: p.id, to: t.id, color: C.color, aoe: spec.aoe || 0, cls: p.cls });
      const hits = spec.hits || 1;
      let bonus = dmgBonus(p, spec.stat); if (hits > 1) bonus = Math.ceil(bonus / 2);
      for (let h = 0; h < hits; h++) for (const v of victims) {
        if (!v.alive) continue;
        const d20 = rnd(1, 20), hb = hitBonus(p, s);
        let hit = spec.auto || d20 === 20 || (d20 !== 1 && d20 + hb >= v.ac);
        const crit = hit && d20 >= critAt(p);
        if (hit && !spec.auto && v.status.camo && Math.random() < 0.5) { hit = false; parts.push(`${v.name} dodged`); continue; }
        const first = v === victims[0];
        if (first) rolls.push({ s: 20, v: d20, crit });
        if (!hit) { parts.push(`miss (${d20}+${hb} vs AC ${v.ac})`); continue; }
        const dice = roll(spec.dice[0] * (crit ? 2 : 1), spec.dice[1]);
        if (first) dice.forEach(x => rolls.push({ s: spec.dice[1], v: x }));
        let dmg = sumA(dice) + (spec.flat || 0) + bonus;
        if (v.status.hexed) dmg += rnd(1, 6);
        const dealt = this.hurt(v, dmg, p);
        let txt = `${crit ? 'CRIT! ' : ''}${v.name} -${dealt}`;
        if (spec.lifesteal) { const hgain = this.heal(p, Math.ceil(dealt * spec.lifesteal)); if (hgain) txt += ` (+${hgain} HP)`; }
        if (spec.effect && v.alive && Math.random() < spec.effect.chance) {
          const k = this.addStatus(v, spec.effect.type, rnd(spec.effect.turns[0], spec.effect.turns[1])); txt += ` ${STATUS[k].icon}`;
        }
        if (torch && torch.burn && v.alive && Math.random() < torch.burn) { this.addStatus(v, 'burn', 2); txt += ' 🔥'; }
        parts.push(txt);
      }
    } else this.fx({ kind: 'buff', id: p.id, color: C.color });
    const targets = tt === 'party' ? this.alivePlayers() : (tt === 'self' ? [p] : []);
    for (const q of targets) {
      if (spec.party) this.addStatus(q, spec.party.type, spec.party.turns);
      if (spec.cleanse) this.cleanse(q);
      if (spec.shield) { q.shield += spec.shield; this.fx({ kind: 'text', id: q.id, text: `🛡️+${spec.shield}`, color: '#9df' }); }
      const hd = spec.partyHeal || spec.selfHeal;
      if (hd) { const dice = roll(hd[0], hd[1]); if (q === targets[0]) dice.forEach(x => rolls.push({ s: hd[1], v: x })); const g = this.heal(q, sumA(dice) + Math.floor(p.stats.eng / 3)); parts.push(`${q.name} +${g}`); }
    }
    if (spec.self) this.addStatus(p, spec.self.type, spec.self.turns);
    if (!parts.length) parts.push(spec.desc || 'Done!');
    const res = parts.join(', ');
    this.log(`${C.icon} ${p.name} uses ${spec.name}: ${res}`);
    this.fx({ kind: 'dice', who: p.name, label: spec.name, rolls, result: res });
    return null;
  }
  doHeal(p, targetId) {
    if (p.acted) return 'Already acted';
    if (p.mp < 3) return 'Not enough MP (needs 3)';
    const t = this.s.players.find(q => q.id === targetId && q.alive);
    if (!t) return 'Pick an ally'; if (cheb(p, t) > 4) return 'Too far (range 4)';
    const C = CLASSES[p.cls]; p.mp -= 3; p.acted = true;
    const dice = roll(C.heal[0], C.heal[1]);
    const g = this.heal(t, sumA(dice) + Math.floor(p.stats.eng / 2));
    let extra = '';
    if (C.healer) { const bad = Object.keys(t.status).find(k => STATUS[k].bad); if (bad) { delete t.status[bad]; extra = ` and cures ${STATUS[bad].icon}`; } }
    const res = `${t.name} +${g} HP${extra}`;
    this.log(`💚 ${p.name} heals ${res}`);
    this.fx({ kind: 'dice', who: p.name, label: 'Heal', rolls: dice.map(v => ({ s: C.heal[1], v })), result: res });
    return null;
  }
  doItem(p, slot, targetId, free) {
    if (!free && p.itemUsed) return 'Only 1 item per turn';
    const e = p.inv[slot]; if (!e) return 'Empty slot';
    const id = iid(e), I = ITEMS[id], s = this.s;
    if (I.slot) return this.doEquip(p, slot);
    let t = p;
    if (I.target === 'ally') { t = s.players.find(q => q.id === (targetId || p.id) && !q.away); if (!t || (!t.alive && !I.dead)) return 'Pick an ally'; if (!free && cheb(p, t) > 1) return 'Must stand next to them'; }
    if (I.target === 'enemy') {
      if (free) return 'Use bombs in battle';
      t = s.enemies.find(x => x.id === targetId && x.alive); if (!t) return 'Pick a target'; if (cheb(p, t) > 5) return 'Out of range (5)';
    }
    let res = '';
    switch (id) {
      case 'potion': res = `${t.name} +${this.heal(t, 25)} HP`; break;
      case 'mana': p.mp = Math.min(p.maxMp, p.mp + 15); res = '+15 MP'; break;
      case 'herb': this.cleanse(t); res = `${t.name} is cleansed`; break;
      case 'bomb': { this.fx({ kind: 'bolt', from: p.id, to: t.id, color: '#ff7b00' }); const dice = roll(3, 6); this.fx({ kind: 'dice', who: p.name, label: 'Fire Bomb', rolls: dice.map(v => ({ s: 6, v })), result: '' }); res = `${t.name} -${this.hurt(t, sumA(dice), p)}`; break; }
      case 'scale': p.shield += 15; res = '+15 shield'; break;
      case 'clover': this.addStatus(p, 'inspired', 3); res = 'Inspired!'; break;
      case 'elixir': if (!t.alive) { t.alive = true; t.hp = 0; this.heal(t, Math.ceil(t.maxHp / 2)); res = `${t.name} is REVIVED!`; } else res = `${t.name} +${this.heal(t, t.maxHp)} HP`; break;
      case 'repair': { const a = p.equip.armor; if (!a) return 'No armor equipped'; const max = ITEMS[iid(a)].dur; if (idur(a) >= max) return 'Armor is already perfect'; p.equip.armor = `${iid(a)}:${Math.min(max, idur(a) + 15)}`; res = `armor fixed (${idur(p.equip.armor)}/${max})`; break; }
      case 'treat': if (!p.pet) return 'You need a pet dragon'; if (p.pet.lvl >= PET_MAX) return 'Your dragon is max level'; p.pet.lvl++; this.recalc(p); res = `${p.pet.name} grows to level ${p.pet.lvl}!`; break;
      case 'ticket': { p.inv[slot] = null; this.spin(p, true); if (!free) p.itemUsed = true; return null; }
      default: if (I.egg) { const err = this.hatch(p, I.egg); if (err) return err; res = 'hatched!'; } break;
    }
    p.inv[slot] = null; if (!free) p.itemUsed = true;
    this.log(`${I.icon} ${p.name} uses ${I.name}: ${res}`);
    return null;
  }
  doGod(p) {
    if (p.acted) return 'Already acted';
    if (p.god < 6) return 'God power not charged';
    p.god = 0; p.acted = true;
    this.fx({ kind: 'god', id: p.id });
    for (const q of this.s.players) {
      if (q.away) continue;
      if (!q.alive) { q.alive = true; q.hp = 0; this.heal(q, Math.ceil(q.maxHp * 0.3)); }
      else this.heal(q, Math.ceil(q.maxHp * 0.4));
      this.cleanse(q);
    }
    const dice = roll(2, 10);
    for (const e of this.hostiles()) { delete e.status.camo; this.hurt(e, sumA(dice) + p.lvl * 2, p); }
    this.log(`🌟 ${p.name} calls on the GODS: Divine Balance! Allies healed & revived, enemies smitten for ${sumA(dice) + p.lvl * 2}!`);
    this.fx({ kind: 'dice', who: p.name, label: 'Divine Balance', rolls: dice.map(v => ({ s: 10, v })), result: 'The world is balanced!' });
    return null;
  }
}
