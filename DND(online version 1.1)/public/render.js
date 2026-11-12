// ===== Canvas renderer: maps, heroes, dragons (each tribe animated differently), particles =====
const TS = 64;
const FX_COLORS = {
  fire: ['#ff3b00', '#ff8c00', '#ffd000'], ice: ['#ffffff', '#bbddff', '#77ccff'], water: ['#1e90ff', '#7fdbff', '#ffffff'],
  venom: ['#9acd32', '#6b8e23', '#dfff4f'], mud: ['#6b4423', '#8b5a2b', '#4a2f17'], acid: ['#7fff00', '#adff2f', '#e0ff70'],
  dark: ['#7a2cff', '#3b0a8f', '#d0a0ff'], silk: ['#ffffff', '#fde2ec', '#e0d8ff'], sting: ['#ffd700', '#ffef80', '#333333'],
  leaf: ['#2ecc40', '#7fd85b', '#1b7a2b'],
};
const STATUS_AMBIENT = { burn: FX_COLORS.fire, poison: ['#7d3', '#5a2'], melt: FX_COLORS.acid, bleed: ['#b00', '#800'], freeze: ['#fff', '#bdf'] };

class Renderer {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    canvas.width = COLS * TS; canvas.height = ROWS * TS;
    this.vis = {}; this.parts = []; this.texts = []; this.proj = []; this.marks = []; this.rings = [];
    this.lunge = {}; this.flash = {}; this.dying = {}; this.breathGlow = {};
    this.shake = 0; this.godFlash = 0; this.banner = null; this.lastSeq = -1; this.s = null; this.ui = {}; this.onDice = null;
    const loop = () => { this.draw(); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  }
  now() { return performance.now(); }
  center(id) {
    const v = this.vis[id]; if (v) return { x: v.x, y: v.y };
    const e = this.ent(id); return e ? { x: e.x * TS + TS / 2, y: e.y * TS + TS / 2 } : { x: 0, y: 0 };
  }
  ent(id) { const s = this.s; return s && (s.players.find(p => p.id === id) || s.enemies.find(e => e.id === id)); }
  setState(s) {
    this.s = s;
    if (this.lastSeq < 0) { this.lastSeq = s.phase === 'lobby' ? 0 : s.seq; return; }
    if (s.seq < this.lastSeq) this.lastSeq = 0; // new game
    const evs = s.fx.filter(e => e.seq > this.lastSeq); this.lastSeq = s.seq;
    let delay = 0;
    for (const ev of evs) {
      const d = (ev.kind === 'dmg' || ev.kind === 'heal' || ev.kind === 'text' || ev.kind === 'die') ? 380 : 0;
      setTimeout(() => this.play(ev), d + delay);
      if (ev.kind === 'dmg') delay += 60;
    }
  }
  play(ev) {
    const now = this.now();
    switch (ev.kind) {
      case 'dice': if (this.onDice) this.onDice(ev); break;
      case 'banner': this.banner = { text: ev.text, sub: ev.sub, t0: now }; break;
      case 'spawn': { // dragon swoops down from the sky (SeaWings rise from below, MudWings bubble up)
        const e = this.ent(ev.id); if (!e) break;
        const tx = e.x * TS + TS / 2, ty = e.y * TS + TS / 2;
        if (ev.person) { // kids run in from the side of the hallway
          this.vis[e.id] = { x: e.x < COLS / 2 ? -40 : COLS * TS + 40, y: ty };
          if (e.kind === 'bully') setTimeout(() => this.rings.push({ x: tx, y: ty, t0: this.now(), r: 50, color: '#f44' }), 500);
          break;
        }
        const fromY = ev.tribe === 'sea' ? ty + 260 : ev.tribe === 'mud' ? ty + 40 : ty - 320;
        this.vis[e.id] = { x: tx + (ev.tribe === 'sky' ? -200 : 0), y: fromY };
        setTimeout(() => { this.rings.push({ x: tx, y: ty, t0: this.now(), r: 70, color: TRIBES[ev.tribe].wing }); this.burst(tx, ty, 25, FX_COLORS[TRIBES[ev.tribe].fx] || ['#fff']); }, 450);
        break;
      }
      case 'breath': {
        const a = this.center(ev.from), b = this.center(ev.to), cols = FX_COLORS[ev.style] || FX_COLORS.fire;
        this.lunge[ev.from] = { t0: now, dx: b.x - a.x, dy: b.y - a.y };
        this.breathGlow[ev.from] = { t0: now, color: cols[0] };
        const sx = a.x + Math.sign(b.x - a.x || -1) * 34, sy = a.y - 18;
        for (let i = 0; i < 70; i++) {
          const life = 26 + Math.random() * 14, spread = (Math.random() - 0.5) * 40;
          this.parts.push({ x: sx, y: sy, vx: (b.x - sx) / life + (Math.random() - .5), vy: (b.y + spread - sy) / life + (Math.random() - .5), life, max: life, delay: i * 0.35,
            color: cols[i % cols.length], size: 3 + Math.random() * 5, type: ev.style === 'leaf' ? 'leaf' : ev.style === 'silk' ? 'silk' : ev.style === 'ice' ? 'spark' : 'dot', grow: ev.style === 'fire' || ev.style === 'dark' ? 0.15 : 0 });
        }
        if (ev.aoe) this.rings.push({ x: b.x, y: b.y, t0: now + 400, r: TS * 1.5, color: cols[0] });
        break;
      }
      case 'slash': case 'pslash': {
        const a = this.center(ev.from), b = this.center(ev.to);
        this.lunge[ev.from] = { t0: now, dx: b.x - a.x, dy: b.y - a.y };
        const col = ev.kind === 'slash' ? '#fff' : (ev.color || '#fff');
        setTimeout(() => { this.marks.push({ x: b.x, y: b.y, t0: this.now(), color: col }); this.burst(b.x, b.y, 10, [col, '#fff']); }, 180);
        if (ev.aoe) this.rings.push({ x: b.x, y: b.y, t0: now + 200, r: TS * 1.5, color: col });
        break;
      }
      case 'bolt': {
        const a = this.center(ev.from), b = this.center(ev.to);
        this.lunge[ev.from] = { t0: now, dx: (b.x - a.x) * 0.2, dy: (b.y - a.y) * 0.2 };
        this.proj.push({ sx: a.x, sy: a.y - 10, tx: b.x, ty: b.y - 10, t0: now, dur: 380, color: ev.color || '#fff', aoe: ev.aoe });
        break;
      }
      case 'dmg': {
        const c = this.center(ev.id);
        this.texts.push({ x: c.x, y: c.y - 30, text: ev.amount > 0 ? '-' + ev.amount : '0', color: '#ff4d4d', t0: now, big: ev.amount >= 12 });
        this.flash[ev.id] = now; if (ev.amount >= 10) this.shake = Math.min(14, ev.amount / 1.5);
        break;
      }
      case 'heal': { if (!ev.amount) break; const c = this.center(ev.id); this.texts.push({ x: c.x, y: c.y - 30, text: '+' + ev.amount, color: '#5dff8a', t0: now });
        for (let i = 0; i < 18; i++) this.parts.push({ x: c.x + (Math.random() - .5) * 40, y: c.y + 10, vx: 0, vy: -1 - Math.random() * 1.5, life: 40, max: 40, color: '#7dffa0', size: 3, type: 'spark' }); break; }
      case 'text': { const c = this.center(ev.id); this.texts.push({ x: c.x, y: c.y - 50, text: ev.text, color: ev.color || '#fff', t0: now, small: true }); break; }
      case 'die': this.dying[ev.id] = now; { const c = this.center(ev.id); this.burst(c.x, c.y, 40, ['#fff', '#ffd700', '#f80']); } break;
      case 'level': { const c = this.center(ev.id); this.rings.push({ x: c.x, y: c.y, t0: now, r: 90, color: '#ffd700' }); this.texts.push({ x: c.x, y: c.y - 60, text: 'LEVEL UP!', color: '#ffd700', t0: now, big: true }); break; }
      case 'trap': { const c = this.center(ev.id); this.burst(c.x, c.y, 25, FX_COLORS.fire); break; }
      case 'boom': { const c = this.center(ev.id); this.burst(c.x, c.y, 50, FX_COLORS.fire); this.shake = 12; this.rings.push({ x: c.x, y: c.y, t0: now, r: 70, color: '#f60' }); break; }
      case 'god': this.godFlash = now; this.shake = 16; break;
      case 'warp': this.warp = now; this.shake = 10; break;
      case 'wheel': if (this.onWheel) this.onWheel(ev); break;
      case 'hatch': { const c = this.center(ev.id); this.burst(c.x, c.y - 20, 40, ['#fff', '#ffe066', TRIBES[ev.tribe].wing]); this.rings.push({ x: c.x, y: c.y, t0: now, r: 80, color: '#ffe066' });
        this.texts.push({ x: c.x, y: c.y - 60, text: '🥚 HATCHED!', color: '#ffe066', t0: now, big: true }); break; }
      case 'buff': { const c = this.center(ev.id); this.rings.push({ x: c.x, y: c.y, t0: now, r: 60, color: ev.color });
        for (let i = 0; i < 24; i++) this.parts.push({ x: c.x + (Math.random() - .5) * 40, y: c.y + 20, vx: 0, vy: -1.5 - Math.random(), life: 45, max: 45, color: ev.color, size: 3, type: 'spark' }); break; }
    }
  }
  burst(x, y, n, cols) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = 1 + Math.random() * 4;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 25 + Math.random() * 20, max: 45, color: cols[i % cols.length], size: 2 + Math.random() * 4, type: 'dot' }); }
  }

  // ---------------- main draw ----------------
  draw() {
    const g = this.g, s = this.s, t = this.now() / 1000;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!s || !s.tiles) { g.fillStyle = '#111'; g.fillRect(0, 0, this.c.width, this.c.height); return; }
    let sx = 0, sy = 0; if (this.shake > 0.3) { sx = (Math.random() - .5) * this.shake; sy = (Math.random() - .5) * this.shake; this.shake *= 0.88; }
    g.setTransform(1, 0, 0, 1, sx, sy);
    const key = MAPS[s.map].key;
    this.drawMap(g, s, key, t); this.drawHighlights(g, s, t);
    // traps
    for (const tr of s.traps) { const a = 0.18 + 0.12 * Math.sin(t * 5 + tr.x); g.fillStyle = `rgba(255,90,0,${a})`; g.beginPath(); g.arc(tr.x * TS + 32, tr.y * TS + 32, 16, 0, 7); g.fill();
      g.strokeStyle = `rgba(255,200,0,${a + 0.1})`; g.lineWidth = 2; g.stroke(); }
    // entities
    const ents = [];
    for (const p of s.players) if (!p.away && p.x >= 0) ents.push({ e: p, pl: true });
    for (const e of s.enemies) if (e.alive || (this.dying[e.id] && this.now() - this.dying[e.id] < 1400)) ents.push({ e, pl: false });
    for (const n of (s.npcs || [])) ents.push({ e: n, npc: true });
    for (const o of ents) { const e = o.e, tx = e.x * TS + TS / 2, ty = e.y * TS + TS / 2; let v = this.vis[e.id]; if (!v) v = this.vis[e.id] = { x: tx, y: ty }; v.x += (tx - v.x) * 0.15; v.y += (ty - v.y) * 0.15; }
    ents.sort((a, b) => this.vis[a.e.id].y - this.vis[b.e.id].y);
    const cur = s.side === 'players' ? s.order[s.cur] : s.active;
    for (const o of ents) {
      const e = o.e, v = this.vis[e.id];
      let x = v.x, y = v.y;
      const L = this.lunge[e.id];
      if (L) { const k = (this.now() - L.t0) / 350; if (k > 1) delete this.lunge[e.id]; else { const d = Math.hypot(L.dx, L.dy) || 1, m = Math.sin(k * Math.PI) * 16; x += L.dx / d * m; y += L.dy / d * m; } }
      if (s.phase === 'battle' && cur === e.id) { g.strokeStyle = `rgba(255,215,0,${0.6 + 0.4 * Math.sin(t * 6)})`; g.lineWidth = 3; g.beginPath(); g.ellipse(v.x, v.y + 20, 28, 10, 0, 0, 7); g.stroke(); }
      if (o.pl) { this.drawPet(g, e, x, y, t); this.drawPlayer(g, e, x, y, t); }
      else if (o.npc || e.kind !== 'dragon') this.drawPerson(g, e, x, y, t, !!o.npc);
      else this.drawDragon(g, e, x, y, t);
      this.ambient(e, v.x, v.y);
    }
    this.drawParticles(g, t);
    this.drawOverlay(g, s, key, t);
  }

  drawMap(g, s, key, t) {
    const W = COLS * TS, H = ROWS * TS;
    if (key === 'ship') {
      if (s.stage === 0) { // inside the hull: dark ribs instead of sea
        g.fillStyle = '#1a0f08'; g.fillRect(0, 0, W, H);
        g.strokeStyle = '#3a2414'; g.lineWidth = 10; for (let x = 20; x < W; x += 56) { g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + 10, H / 2, x, H); g.stroke(); }
      } else {
        g.fillStyle = '#0b3d62'; g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
        for (let i = 0; i < 14; i++) { g.beginPath(); for (let x = 0; x <= W; x += 16) g.lineTo(x, i * 45 + Math.sin(x / 40 + t * 2 + i) * 5); g.stroke(); }
        // hull shadow / outline so the whole ship shows
        g.fillStyle = 'rgba(0,0,0,0.35)';
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (s.tiles[y][x] !== 3) g.fillRect(x * TS + 6, y * TS + 8, TS, TS);
      }
      const base = ['#4a3020', '#6e4a2c', '#8f6440'][s.stage % 3];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if (s.tiles[y][x] === 3) continue;
        g.fillStyle = base; g.fillRect(x * TS, y * TS, TS, TS);
        for (let k = 0; k < 4; k++) { g.fillStyle = (x * 7 + y * 3 + k) % 3 === 0 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.04)'; g.fillRect(x * TS, y * TS + k * 16, TS, 15); }
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x * TS + ((y % 2) ? 20 : 44), y * TS, 2, TS);
      }
      // rails
      g.strokeStyle = '#2b1a0e'; g.lineWidth = 6;
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if (s.tiles[y][x] === 3) continue;
        const v = (xx, yy) => xx < 0 || yy < 0 || xx >= COLS || yy >= ROWS || s.tiles[yy][xx] === 3;
        g.beginPath();
        if (v(x, y - 1)) { g.moveTo(x * TS, y * TS + 3); g.lineTo(x * TS + TS, y * TS + 3); }
        if (v(x, y + 1)) { g.moveTo(x * TS, y * TS + TS - 3); g.lineTo(x * TS + TS, y * TS + TS - 3); }
        if (v(x + 1, y)) { g.moveTo(x * TS + TS - 3, y * TS); g.lineTo(x * TS + TS - 3, y * TS + TS); }
        if (v(x - 1, y)) { g.moveTo(x * TS + 3, y * TS); g.lineTo(x * TS + 3, y * TS + TS); }
        g.stroke();
      }
    } else if (key === 'pond') {
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const tt = s.tiles[y][x], X = x * TS, Y = y * TS;
        g.fillStyle = (x + y) % 2 ? '#56632f' : '#4f5c2b'; g.fillRect(X, Y, TS, TS);
        if (tt === 2) { g.fillStyle = '#5b3a1e'; g.beginPath(); g.ellipse(X + 32, Y + 32, 34, 28, 0, 0, 7); g.fill(); g.fillStyle = '#6e4826'; g.beginPath(); g.ellipse(X + 26, Y + 28, 14, 9, 0, 0, 7); g.fill();
          const b = (t * 0.7 + x * 0.37 + y * 0.53) % 1; g.strokeStyle = `rgba(160,120,70,${1 - b})`; g.lineWidth = 1.5; g.beginPath(); g.arc(X + 40, Y + 38, 2 + b * 7, 0, 7); g.stroke(); }
        if (tt === 4) { g.fillStyle = '#2f5d50'; g.fillRect(X, Y, TS, TS); g.strokeStyle = 'rgba(200,255,230,0.25)'; g.lineWidth = 1.5;
          const r = ((t * 15 + x * 13 + y * 7) % 30); g.beginPath(); g.ellipse(X + 32, Y + 32, r, r * 0.5, 0, 0, 7); g.stroke();
          if ((x + y) % 2) { g.fillStyle = '#3e8e41'; g.beginPath(); g.arc(X + 20, Y + 22, 8, 0.4, 6.0); g.lineTo(X + 20, Y + 22); g.fill(); } }
      }
    } else if (key === 'stronghold') {
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const X = x * TS, Y = y * TS;
        g.fillStyle = (x + y) % 2 ? '#3b3a4a' : '#34333f'; g.fillRect(X, Y, TS, TS);
        g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2; g.strokeRect(X + 1, Y + 1, TS - 2, TS - 2);
        if ((x * 3 + y * 5) % 7 === 0) { g.fillStyle = 'rgba(120,80,200,0.12)'; g.fillRect(X + 8, Y + 8, 20, 10); }
      }
      if (s.stage === 1) { // swirling time energy
        const cx = 7.5 * TS, cy = 4.5 * TS; g.save(); g.translate(cx, cy); g.rotate(t * 0.5);
        for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.strokeStyle = `rgba(170,120,255,${0.15 + 0.1 * Math.sin(t * 2 + i)})`; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 150 + i * 20, 0, 1.4); g.stroke(); }
        g.restore();
      }
    } else if (key === 'school') {
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const X = x * TS, Y = y * TS;
        g.fillStyle = (x + y) % 2 ? '#d9dee3' : '#c9d1d8'; g.fillRect(X, Y, TS, TS);
        g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 1; g.strokeRect(X, Y, TS, TS);
      }
      g.fillStyle = 'rgba(40,90,160,0.18)'; g.fillRect(0, 3.5 * TS, W, 2 * TS); // hallway carpet stripe
      g.fillStyle = '#1b4f72'; g.font = 'bold 14px sans-serif'; g.textAlign = 'left';
      g.fillText(`YORKSON CREEK MIDDLE • FLOOR ${s.stage + 1} • DAY ${s.day || 1}`, 12, 1.4 * TS);
    } else if (key === 'village') {
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { g.fillStyle = (x + y) % 2 ? '#62a043' : '#5a983c'; g.fillRect(x * TS, y * TS, TS, TS); }
      g.fillStyle = '#b8935a'; g.fillRect(0, 4 * TS + 8, W, TS - 16); g.fillRect(3 * TS + 8, 0, TS - 16, H); g.fillRect(8 * TS + 8, 0, TS - 16, H);
      g.fillStyle = 'rgba(0,0,0,0.07)'; for (let x = 0; x < W; x += 30) g.fillRect(x, 4 * TS + 30, 12, 4);
    } else {
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const X = x * TS, Y = y * TS;
        g.fillStyle = s.stage === 1 ? ((x + y) % 2 ? '#c99d55' : '#c39650') : ((x + y) % 2 ? '#e2b866' : '#dcb260'); g.fillRect(X, Y, TS, TS);
        g.strokeStyle = 'rgba(160,110,40,0.35)'; g.lineWidth = 2; g.beginPath();
        for (let k = 0; k <= TS; k += 8) g.lineTo(X + k, Y + 40 + Math.sin((X + k) / 18 + y) * 4); g.stroke();
        if (s.stage === 1) { g.strokeStyle = 'rgba(90,60,20,0.3)'; g.strokeRect(X + 2, Y + 2, TS - 4, TS - 4); }
      }
    }
    // decorations / obstacles
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const d = s.deco[y][x]; if (d && d !== 'part') this.drawDeco(g, d, x * TS + 32, y * TS + 32, t); }
    // classroom doors: subject + passed check
    for (const dr of (s.doors || [])) {
      const X = dr.x * TS + 32, Y = dr.y * TS + (dr.y === 0 ? 58 : 6);
      this.label(g, (dr.passed ? '✅ ' : '📝 ') + dr.subject, X, Y, dr.passed ? '#9f9' : '#fff3a0');
    }
    // exit tile: locked until enough dragons are defeated, then it glows
    if (s.exit) {
      const X = s.exit.x * TS, Y = s.exit.y * TS;
      if (s.exitOpen) {
        const a = 0.55 + 0.45 * Math.sin(t * 4);
        g.fillStyle = `rgba(255,215,0,${a * 0.6})`; g.fillRect(X, Y, TS, TS);
        g.strokeStyle = '#fff3a0'; g.lineWidth = 3; g.strokeRect(X + 2, Y + 2, TS - 4, TS - 4);
        if (Math.random() < 0.3) this.parts.push({ x: X + Math.random() * TS, y: Y + TS, vx: 0, vy: -1.2, life: 40, max: 40, color: '#ffe680', size: 2, type: 'spark' });
      } else { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(X, Y, TS, TS); }
      g.font = '30px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff';
      g.fillText(s.exitOpen ? s.exit.icon : '🔒', X + 32, Y + 43);
    }
  }
  drawDeco(g, d, x, y, t) {
    g.save(); g.translate(x, y);
    if (d.startsWith('house:')) { // 2x2 village building
      const n = VILLAGE_NPCS[+d.split(':')[1]], X = -30, Y = -24, W = 124, H = 112;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(X + 6, Y + 12, W, H - 8);
      g.fillStyle = '#e8d3a8'; g.fillRect(X, Y + 30, W, H - 34);
      g.fillStyle = n.house[2]; g.beginPath(); g.moveTo(X - 8, Y + 34); g.lineTo(X + W / 2, Y - 10); g.lineTo(X + W + 8, Y + 34); g.fill();
      g.fillStyle = '#5a3a1a'; g.fillRect(X + W / 2 - 12, Y + H - 40, 24, 36);
      g.fillStyle = `rgba(255,220,120,${0.7 + 0.3 * Math.sin(t * 2 + x)})`; g.fillRect(X + 14, Y + 50, 20, 18); g.fillRect(X + W - 34, Y + 50, 20, 18);
      if (Math.random() < 0.06) this.parts.push({ x: x + 70, y: y - 30, vx: 0.3, vy: -0.6, life: 70, max: 70, color: 'rgba(220,220,220,0.6)', size: 5, type: 'dot', grow: 0.08 });
      g.restore(); this.label(g, n.icon + ' ' + n.sign, x + 32, y + 96, '#fff3c4'); return;
    }
    if (d === 'locker') {
      g.fillStyle = '#2e6da4'; g.fillRect(-30, -30, 60, 60); g.strokeStyle = '#1b4f72'; g.lineWidth = 2; g.strokeRect(-30, -30, 30, 60); g.strokeRect(0, -30, 30, 60);
      g.fillStyle = '#9cc3e6'; for (const ox of [-15, 15]) for (let k = 0; k < 3; k++) g.fillRect(ox - 8, -22 + k * 5, 16, 2);
      g.fillStyle = '#ddd'; g.fillRect(-6, 0, 3, 8); g.fillRect(24, 0, 3, 8); g.restore(); return;
    }
    if (d === 'door') {
      g.fillStyle = '#8b5a2b'; g.fillRect(-26, -30, 52, 60); g.strokeStyle = '#4a2f17'; g.lineWidth = 3; g.strokeRect(-26, -30, 52, 60);
      g.fillStyle = '#bde0fe'; g.fillRect(-12, -24, 24, 18); g.fillStyle = '#f1c40f'; g.beginPath(); g.arc(16, 4, 3.5, 0, 7); g.fill(); g.restore(); return;
    }
    if (d === 'wall') { g.fillStyle = '#4a4757'; g.fillRect(-32, -32, 64, 64); g.strokeStyle = '#2b2933'; g.lineWidth = 2; for (let k = -32; k < 32; k += 16) { g.beginPath(); g.moveTo(-32, k); g.lineTo(32, k); g.stroke(); }
      if ((x + y) % 3 < 1) { g.font = '20px sans-serif'; g.textAlign = 'center'; g.fillText('🔥', 0, 8 + Math.sin(t * 8) * 1); } g.restore(); return; }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(4, 22, 24, 8, 0, 0, 7); g.fill();
    switch (d) {
      case 'helm': g.strokeStyle = '#6b4423'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 18, 0, 7); g.stroke(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + t * 0.2; g.beginPath(); g.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); g.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); g.stroke(); } break;
      case 'hourglass': g.fillStyle = '#c9a227'; g.fillRect(-20, -28, 40, 6); g.fillRect(-20, 22, 40, 6); g.fillStyle = 'rgba(200,220,255,0.6)'; g.beginPath(); g.moveTo(-16, -22); g.lineTo(16, -22); g.lineTo(2, 0); g.lineTo(16, 22); g.lineTo(-16, 22); g.lineTo(-2, 0); g.fill();
        g.fillStyle = '#f5d76e'; g.beginPath(); g.moveTo(-10, 22); g.lineTo(10, 22); g.lineTo(0, 10 - (t * 3 % 8)); g.fill(); break;
      case 'plant': g.fillStyle = '#a0522d'; g.fillRect(-10, 4, 20, 16); g.fillStyle = '#27ae60'; for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(i * 6, -6, 5, 14, i * 0.3 + Math.sin(t + i) * 0.05, 0, 7); g.fill(); } break;
      case 'trash': g.fillStyle = '#7f8c8d'; g.fillRect(-14, -16, 28, 36); g.fillStyle = '#566573'; g.fillRect(-16, -20, 32, 6); break;
      case 'fountain': g.fillStyle = '#95a5a6'; g.beginPath(); g.arc(0, 0, 24, 0, 7); g.fill(); g.fillStyle = '#5dade2'; g.beginPath(); g.arc(0, 0, 17, 0, 7); g.fill();
        if (Math.random() < 0.3) this.parts.push({ x: x + (Math.random() - .5) * 8, y: y - 6, vx: (Math.random() - .5) * 1.5, vy: -2, life: 20, max: 20, color: '#aee', size: 2, type: 'dot' }); break;
      case 'bench': g.fillStyle = '#8e6b3e'; g.fillRect(-28, -8, 56, 14); g.fillStyle = '#555'; g.fillRect(-24, 6, 4, 12); g.fillRect(20, 6, 4, 12); break;
      case 'tree': g.fillStyle = '#5a3a1a'; g.fillRect(-5, 0, 10, 22); g.fillStyle = '#2f7d32'; g.beginPath(); g.arc(0, -8, 24 + Math.sin(t + x) * 1.5, 0, 7); g.fill(); g.fillStyle = '#3c9a40'; g.beginPath(); g.arc(-6, -14, 12, 0, 7); g.fill(); break;
      case 'crate': g.fillStyle = '#a0723f'; g.fillRect(-22, -22, 44, 44); g.strokeStyle = '#5a3a1a'; g.lineWidth = 4; g.strokeRect(-22, -22, 44, 44); g.beginPath(); g.moveTo(-22, -22); g.lineTo(22, 22); g.moveTo(22, -22); g.lineTo(-22, 22); g.stroke(); break;
      case 'barrel': g.fillStyle = '#8a5a2b'; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill(); g.strokeStyle = '#444'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, 13, 0, 7); g.stroke(); break;
      case 'cannon': g.fillStyle = '#5a3a1a'; g.fillRect(-18, -14, 36, 28); g.fillStyle = '#222'; g.fillRect(-8, -26, 16, 34); g.beginPath(); g.arc(0, -26, 9, 0, 7); g.fill(); break;
      case 'mast': g.fillStyle = '#5a3a1a'; g.beginPath(); g.arc(0, 0, 18, 0, 7); g.fill(); g.strokeStyle = '#2b1a0e'; g.lineWidth = 4; g.stroke(); g.fillStyle = '#eee8d0'; g.globalAlpha = 0.5; g.fillRect(-30, -4 + Math.sin(t) * 2, 60, 8); break;
      case 'rope': g.strokeStyle = '#c9a66b'; g.lineWidth = 4; for (let r = 6; r < 22; r += 5) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); } break;
      case 'reed': for (let i = -2; i <= 2; i++) { g.strokeStyle = i % 2 ? '#6b8e23' : '#556b2f'; g.lineWidth = 3; g.beginPath(); g.moveTo(i * 7, 20); g.quadraticCurveTo(i * 7 + Math.sin(t * 2 + i) * 6, -5, i * 9 + Math.sin(t * 2 + i) * 10, -26); g.stroke();
          g.fillStyle = '#5a3a1a'; g.fillRect(i * 9 + Math.sin(t * 2 + i) * 10 - 2, -32, 5, 12); } break;
      case 'rock': g.fillStyle = '#8d7b68'; g.beginPath(); g.moveTo(-24, 16); g.lineTo(-18, -14); g.lineTo(4, -22); g.lineTo(24, -6); g.lineTo(20, 18); g.closePath(); g.fill(); g.fillStyle = '#a89580'; g.beginPath(); g.moveTo(-14, -10); g.lineTo(4, -18); g.lineTo(10, -4); g.closePath(); g.fill(); break;
      case 'cactus': g.fillStyle = '#2e8b57'; g.fillRect(-7, -28, 14, 48); g.fillRect(-22, -10, 15, 8); g.fillRect(-22, -22, 8, 20); g.fillRect(7, -4, 15, 8); g.fillRect(14, -18, 8, 20); break;
      case 'pillar': g.fillStyle = '#b08850'; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill(); g.fillStyle = '#d4ad6e'; g.beginPath(); g.arc(-3, -3, 15, 0, 7); g.fill(); g.strokeStyle = '#7a5a2a'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.stroke(); break;
    }
    g.restore();
  }
  // students, bullies and village people
  drawPerson(g, e, x, y, t, npc) {
    const P = npc ? { shirt: e.shirt, icon: e.icon } : PEOPLE[e.ptype], bully = e.kind === 'bully';
    const dyingT = this.dying[e.id] ? (this.now() - this.dying[e.id]) / 1400 : 0;
    const fl = this.flash[e.id] && this.now() - this.flash[e.id] < 200;
    g.save(); g.translate(x, y);
    if (dyingT) { g.globalAlpha = 1 - dyingT; g.rotate(dyingT * 1.2); }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(0, 22, 17, 6, 0, 0, 7); g.fill();
    if (bully) { g.fillStyle = `rgba(255,40,40,${0.18 + 0.1 * Math.sin(t * 5)})`; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill(); }
    if (e.kind === 'student' && e.hostile) { g.fillStyle = 'rgba(255,140,0,0.2)'; g.beginPath(); g.arc(0, 0, 28, 0, 7); g.fill(); }
    const bob = Math.sin(t * (bully ? 5 : 3) + (e.id.charCodeAt(1) || 0)) * 2;
    g.translate(0, bob);
    const big = bully ? 1.15 : 1; g.scale(big, big);
    g.fillStyle = '#2c3e50'; g.fillRect(-8, 10, 6, 12); g.fillRect(2, 10, 6, 12);
    if (!npc) { g.fillStyle = '#5d6d7e'; g.fillRect(-15, -8, 6, 16); } // backpack
    g.fillStyle = fl ? '#fff' : P.shirt; this.rr(g, -11, -10, 22, 22, 5); g.fill();
    g.fillStyle = fl ? '#fff' : ['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#ffdbac'][(e.id.charCodeAt(1) || 0) % 5]; g.beginPath(); g.arc(0, -19, 9, 0, 7); g.fill();
    g.fillStyle = ['#2c1b0e', '#6b3e26', '#d4a017', '#111', '#8b2500'][(e.id.length + (e.id.charCodeAt(2) || 0)) % 5];
    g.beginPath(); g.arc(0, -22, 9, Math.PI, 0); g.fill();
    if (bully) { g.fillStyle = '#c0392b'; g.fillRect(-10, -30, 20, 6); g.fillRect(0, -27, 14, 3); g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, -22); g.lineTo(-1, -20); g.moveTo(6, -22); g.lineTo(1, -20); g.stroke(); }
    g.fillStyle = '#222'; g.fillRect(-4, -19, 2, 2); g.fillRect(2, -19, 2, 2);
    g.font = '15px sans-serif'; g.textAlign = 'center'; g.fillText(P.icon, 15, 2);
    if (e.status && e.status.freeze) { g.fillStyle = 'rgba(170,220,255,0.55)'; g.fillRect(-16, -32, 32, 56); }
    g.restore();
    if (dyingT) return;
    if (npc) { this.label(g, e.name, x, y + 36, '#fff3c4'); g.font = '14px sans-serif'; g.textAlign = 'center'; g.fillText('💬', x, y - 34 + Math.sin(t * 3) * 2); return; }
    this.bars(g, e, x, y - 42, 38);
    this.label(g, `Lv${e.lvl} ${e.name}`, x, y + 36, bully ? '#ff8a80' : e.hostile ? '#ffb74d' : '#c8f7c5');
  }
  // pet dragon follows its hero
  drawPet(g, p, x, y, t) {
    if (!p.pet || !p.alive) return;
    const px = x - 24 + Math.sin(t * 1.3) * 4, py = y - 28 + Math.sin(t * 3) * 4;
    g.save(); g.translate(px, py); g.scale(0.38, 0.38);
    this.drawDragon(g, { id: p.id + 'pet', tribe: p.pet.tribe, status: {}, alive: true, hp: 1, maxHp: 1, name: '', petMini: true }, 0, 0, t);
    g.restore();
    g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffd166'; g.fillText(`${p.pet.name} Lv${p.pet.lvl}`, px, py - 20);
  }
  drawHighlights(g, s, t) {
    const ui = this.ui || {};
    if (ui.reach) { g.fillStyle = 'rgba(80,180,255,0.28)'; g.strokeStyle = 'rgba(140,210,255,0.7)'; g.lineWidth = 1;
      for (const k of ui.reach) { const [x, y] = k.split(',').map(Number); g.fillRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4); g.strokeRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4); } }
    if (ui.range) { g.fillStyle = 'rgba(255,80,80,0.10)'; for (const k of ui.range) { const [x, y] = k.split(',').map(Number); g.fillRect(x * TS, y * TS, TS, TS); } }
    if (ui.targets) for (const id of ui.targets) { const c = this.center(id), r = 30 + Math.sin(t * 8) * 3; g.strokeStyle = ui.targetColor || '#ff4040'; g.lineWidth = 3; g.setLineDash([8, 6]); g.beginPath(); g.arc(c.x, c.y, r, 0, 7); g.stroke(); g.setLineDash([]); }
    if (ui.hover) { g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.strokeRect(ui.hover.x * TS + 1, ui.hover.y * TS + 1, TS - 2, TS - 2); }
  }
  bars(g, e, x, y, w) {
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - w / 2 - 1, y - 1, w + 2, 7);
    const f = Math.max(0, e.hp / e.maxHp); g.fillStyle = f > 0.5 ? '#3fd16b' : f > 0.25 ? '#f1c40f' : '#e74c3c'; g.fillRect(x - w / 2, y, w * f, 5);
    if (e.shield > 0) { g.fillStyle = '#7fd3ff'; g.fillRect(x - w / 2, y - 3, Math.min(w, w * e.shield / e.maxHp), 2); }
    const icons = Object.keys(e.status).map(k => STATUS[k].icon).join('');
    if (icons) { g.font = '13px sans-serif'; g.textAlign = 'center'; g.fillText(icons, x, y - 6); }
  }
  label(g, text, x, y, color) { g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(text, x, y); g.fillStyle = color || '#fff'; g.fillText(text, x, y); }

  drawPlayer(g, p, x, y, t) {
    const C = CLASSES[p.cls];
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(0, 22, 18, 6, 0, 0, 7); g.fill();
    if (!p.alive) { g.font = '34px sans-serif'; g.textAlign = 'center'; g.fillText('🪦', 0, 16); g.restore(); this.label(g, p.name, x, y + 36, '#aaa'); return; }
    const fl = this.flash[p.id] && this.now() - this.flash[p.id] < 200;
    if (p.status.camo) g.globalAlpha = 0.45;
    const bob = Math.sin(t * 3 + p.id.length) * 2, walk = Math.sin(t * 10) * (Math.abs(this.vis[p.id].x - (p.x * TS + 32)) > 2 ? 4 : 0);
    g.translate(0, bob);
    if (p.cls === 'vampire') { g.fillStyle = '#300'; g.beginPath(); g.moveTo(-14, -10); g.lineTo(14, -10); g.lineTo(20, 18); g.lineTo(-20, 18); g.fill(); }
    g.fillStyle = '#222'; g.fillRect(-8 + walk, 10, 6, 12); g.fillRect(2 - walk, 10, 6, 12);
    g.fillStyle = fl ? '#fff' : C.color; this.rr(g, -12, -10, 24, 24, 6); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2; g.stroke();
    const skin = p.cls === 'werewolf' ? '#8d6e63' : p.cls === 'vampire' || p.cls === 'necromancer' ? '#e8e0e8' : '#f1c27d';
    g.fillStyle = fl ? '#fff' : skin; g.beginPath(); g.arc(0, -20, 10, 0, 7); g.fill();
    g.fillStyle = p.cls === 'vampire' ? '#c00' : '#222'; g.fillRect(-5, -22, 3, 3); g.fillRect(2, -22, 3, 3);
    if (['wizard', 'sorcerer', 'warlock', 'necromancer'].includes(p.cls)) { g.fillStyle = C.color; g.beginPath(); g.moveTo(-13, -26); g.lineTo(13, -26); g.lineTo(3, -48); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); }
    else if (['fighter', 'paladin', 'dragonslayer'].includes(p.cls)) { g.fillStyle = '#9aa'; g.beginPath(); g.arc(0, -22, 11, Math.PI, 0); g.fill(); }
    else if (p.cls === 'werewolf') { g.fillStyle = '#6d4c41'; g.beginPath(); g.moveTo(-9, -26); g.lineTo(-5, -36); g.lineTo(-2, -27); g.moveTo(9, -26); g.lineTo(5, -36); g.lineTo(2, -27); g.fill(); }
    else if (p.cls === 'rogue' || p.cls === 'ranger') { g.fillStyle = C.color; g.beginPath(); g.arc(0, -22, 11, Math.PI * 0.9, Math.PI * 2.1); g.fill(); }
    g.font = '18px sans-serif'; g.textAlign = 'center'; g.fillText(C.icon, 18, 2 + Math.sin(t * 4) * 2);
    if (p.status.freeze) { g.fillStyle = 'rgba(170,220,255,0.55)'; this.rr(g, -18, -34, 36, 58, 6); g.fill(); g.strokeStyle = '#fff'; g.stroke(); }
    if (p.status.root) { g.strokeStyle = '#3c8d2f'; g.lineWidth = 3; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 10, 24); g.quadraticCurveTo(i * 16, 10, i * 6, 4); g.stroke(); } }
    g.restore();
    this.bars(g, p, x, y - 44, 40);
    this.label(g, p.name, x, y + 36, '#ffe9a8');
  }
  rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  drawDragon(g, e, x, y, t) {
    const T = TRIBES[e.tribe], st = T.style, seed = e.id.charCodeAt(1) || 1;
    let alpha = 1, rot = 0, sxs = 1, sys = 1, flapSpd = 5, flapAmp = 1;
    const dyingT = this.dying[e.id] ? (this.now() - this.dying[e.id]) / 1400 : 0;
    if (st === 'hover') { y += Math.sin(t * 2.5 + seed) * 7 - 6; flapSpd = 7; }
    if (st === 'shimmer') flapSpd = 3;
    if (st === 'sway') rot = Math.sin(t * 1.5 + seed) * 0.09;
    if (st === 'wobble') { sxs = 1 + Math.sin(t * 3) * 0.06; sys = 1 - Math.sin(t * 3) * 0.06; flapAmp = 0.5; flapSpd = 2; }
    if (st === 'fade') alpha = 0.78 + 0.22 * Math.sin(t * 2);
    if (st === 'flutter') flapSpd = 9;
    if (st === 'buzz') { x += (Math.random() - .5) * 2.5; y += (Math.random() - .5) * 2.5; flapSpd = 30; flapAmp = 0.6; }
    if (e.status.camo) alpha = e.tribe === 'rain' ? 0.22 : alpha * 0.7;
    if (dyingT) { alpha *= 1 - dyingT; rot += dyingT * 1.4; y += dyingT * 20; }
    const sc = e.boss ? 1.3 : 1;
    // face nearest player
    let face = -1; const ps = this.s && !e.petMini ? this.s.players.filter(p => p.alive) : [];
    if (ps.length) { const n = ps.reduce((a, b) => Math.abs(a.x - e.x) + Math.abs(a.y - e.y) <= Math.abs(b.x - e.x) + Math.abs(b.y - e.y) ? a : b); face = n.x > e.x ? 1 : -1; }
    const fl = this.flash[e.id] && this.now() - this.flash[e.id] < 220;
    const body = fl ? '#ffffff' : st === 'rainbow' ? `hsl(${(t * 50 + seed * 30) % 360},70%,50%)` : T.body;
    const belly = fl ? '#ffffff' : st === 'rainbow' ? `hsl(${(t * 50 + 180) % 360},80%,60%)` : T.belly;
    const wing = st === 'rainbow' ? `hsl(${(t * 50 + 90) % 360},75%,55%)` : T.wing;
    const flap = 0.55 + 0.45 * Math.sin(t * flapSpd + seed) * flapAmp;
    g.save(); g.translate(x, y + 4);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0, 22, 30 * sc, 8, 0, 0, 7); g.fill();
    g.globalAlpha = Math.max(0, alpha);
    g.rotate(rot); g.scale(-face * sc * sxs, sc * sys); // drawn facing left by default
    if (st === 'fade' || e.tribe === 'night') { if (e.status.camo) { g.fillStyle = 'rgba(150,80,255,0.25)'; g.beginPath(); g.arc(0, -8, 44, 0, 7); g.fill(); } }
    if (e.boss) { g.fillStyle = `rgba(255,120,0,${0.15 + 0.1 * Math.sin(t * 3)})`; g.beginPath(); g.arc(0, -8, 48, 0, 7); g.fill(); }
    // tail
    const tw = Math.sin(t * (st === 'tail' ? 3 : 2) + seed) * (st === 'tail' ? 14 : 8);
    g.strokeStyle = body; g.lineCap = 'round'; g.lineWidth = 9; g.beginPath(); g.moveTo(14, 4); g.quadraticCurveTo(32, 14, 46, 2 + tw); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(40, 6 + tw * 0.7); g.lineTo(54, -2 + tw); g.stroke();
    const tx = 54, ty = -2 + tw;
    g.fillStyle = T.belly;
    if (e.tribe === 'sand' || e.tribe === 'hive') { g.fillStyle = e.tribe === 'sand' ? '#333' : '#222'; g.beginPath(); g.moveTo(tx, ty - 6); g.lineTo(tx + 12, ty); g.lineTo(tx, ty + 6); g.fill(); }
    if (e.tribe === 'sea') { g.fillStyle = T.belly; g.beginPath(); g.moveTo(tx - 4, ty); g.lineTo(tx + 10, ty - 10); g.lineTo(tx + 10, ty + 10); g.fill(); }
    if (e.tribe === 'leaf') { g.fillStyle = '#7fd85b'; g.beginPath(); g.ellipse(tx + 6, ty, 10, 5, 0.3, 0, 7); g.fill(); }
    // back wing(s)
    const wingPoly = (ox, oy, k, col) => {
      g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5; g.beginPath();
      if (e.tribe === 'silk' || e.tribe === 'leaf') { g.ellipse(ox + 6, oy - 26 * k, 14, 22 * k + 2, 0.3, 0, 7); }
      else { g.moveTo(ox, oy); g.lineTo(ox - 12, oy - 44 * k); g.lineTo(ox + 6, oy - 34 * k); g.lineTo(ox + 20, oy - 40 * k); g.lineTo(ox + 26, oy - 4); g.closePath(); }
      g.fill(); g.stroke();
      if (e.tribe === 'night') { g.fillStyle = '#e8e8ff'; for (let i = 0; i < 5; i++) g.fillRect(ox - 4 + i * 5, oy - 20 * k - (i * 7 % 13), 1.5, 1.5); }
    };
    const darker = 'rgba(0,0,0,0.25)';
    wingPoly(-2, -6, flap * 0.85, wing); g.fillStyle = darker;
    if (e.tribe === 'silk') wingPoly(8, -2, flap * 0.6, '#81ecec');
    // legs
    g.fillStyle = fl ? '#fff' : this.shade(T.body); [[-14, 12], [-4, 14], [8, 14], [16, 12]].forEach(([lx, ly]) => { g.beginPath(); g.ellipse(lx, ly, 4, 7, 0, 0, 7); g.fill(); });
    // body
    g.fillStyle = body; g.beginPath(); g.ellipse(0, 0, 24, 15, 0, 0, 7); g.fill();
    g.fillStyle = belly; g.beginPath(); g.ellipse(-2, 6, 18, 7, 0, 0, 7); g.fill();
    if (e.tribe === 'hive') { g.fillStyle = '#222'; for (let i = -12; i <= 12; i += 8) g.fillRect(i, -14, 4, 22); }
    if (e.tribe === 'sea') { g.fillStyle = `rgba(120,255,240,${0.5 + 0.5 * Math.sin(t * 4)})`; for (let i = -14; i <= 14; i += 7) { g.beginPath(); g.arc(i, -6, 2, 0, 7); g.fill(); } }
    if (e.tribe === 'ice' || e.tribe === 'sky') { g.fillStyle = e.tribe === 'ice' ? '#fff' : '#a52a12'; for (let i = -16; i <= 16; i += 8) { g.beginPath(); g.moveTo(i - 3, -13); g.lineTo(i, -21); g.lineTo(i + 3, -13); g.fill(); } }
    if (e.tribe === 'mud') { g.fillStyle = 'rgba(60,35,15,0.6)'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(-14 + i * 7, -2 + (i % 2) * 6, 3, 0, 7); g.fill(); } }
    // neck + head
    g.strokeStyle = body; g.lineWidth = 11; g.beginPath(); g.moveTo(-16, -4); g.lineTo(-26, -18); g.stroke();
    g.fillStyle = body; g.beginPath(); g.ellipse(-31, -22, 12, 9, -0.2, 0, 7); g.fill();
    g.beginPath(); g.ellipse(-42, -19, 8, 5.5, -0.1, 0, 7); g.fill();
    // frills/horns per tribe
    g.fillStyle = T.belly; g.strokeStyle = this.shade(T.body); g.lineWidth = 3;
    if (e.tribe === 'sky' || e.tribe === 'mud' || e.tribe === 'night') { g.beginPath(); g.moveTo(-28, -29); g.quadraticCurveTo(-20, -40, -14, -38); g.stroke(); g.beginPath(); g.moveTo(-33, -30); g.quadraticCurveTo(-28, -42, -22, -42); g.stroke(); }
    if (e.tribe === 'ice') { g.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-34 + i * 6, -29); g.lineTo(-30 + i * 6, -42); g.lineTo(-28 + i * 6, -29); g.fill(); } }
    if (e.tribe === 'rain' || e.tribe === 'sand') { g.fillStyle = e.tribe === 'rain' ? `hsl(${(t * 80) % 360},90%,60%)` : '#c9a050'; g.beginPath(); g.moveTo(-24, -30); g.lineTo(-18, -36); g.lineTo(-20, -24); g.lineTo(-14, -28); g.lineTo(-20, -16); g.fill(); }
    if (e.tribe === 'sea') { g.fillStyle = T.belly; g.beginPath(); g.moveTo(-34, -30); g.lineTo(-22, -38); g.lineTo(-22, -26); g.fill(); }
    if (e.tribe === 'silk' || e.tribe === 'hive') { g.strokeStyle = '#333'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-32, -30); g.quadraticCurveTo(-38, -44, -44, -46); g.moveTo(-28, -30); g.quadraticCurveTo(-30, -46, -34, -50); g.stroke(); g.fillStyle = '#333'; g.beginPath(); g.arc(-44, -46, 2.5, 0, 7); g.arc(-34, -50, 2.5, 0, 7); g.fill(); }
    if (e.tribe === 'leaf') { g.fillStyle = '#9be564'; g.beginPath(); g.ellipse(-26, -34, 8, 3.5, -0.8, 0, 7); g.fill(); }
    if (e.queen) { // golden crown
      g.fillStyle = '#ffd700'; g.strokeStyle = '#a67c00'; g.lineWidth = 1.5; g.beginPath();
      g.moveTo(-40, -29); g.lineTo(-38, -42); g.lineTo(-34, -34); g.lineTo(-31, -45); g.lineTo(-28, -34); g.lineTo(-24, -42); g.lineTo(-22, -29); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#e0115f'; g.beginPath(); g.arc(-31, -33, 2, 0, 7); g.fill();
    }
    // eye + nostril
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-34, -25, 3.5, 0, 7); g.fill();
    g.fillStyle = e.tribe === 'night' ? '#000' : e.tribe === 'ice' ? '#2a7fff' : '#b8860b'; g.beginPath(); g.arc(-35, -25, 2, 0, 7); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(-47, -21, 1.3, 0, 7); g.fill();
    // breath glow at mouth
    const bg = this.breathGlow[e.id];
    if (bg) { const k = (this.now() - bg.t0) / 600; if (k > 1) delete this.breathGlow[e.id]; else { g.fillStyle = bg.color; g.globalAlpha = (1 - k) * alpha; g.beginPath(); g.arc(-50, -18, 8 + k * 6, 0, 7); g.fill(); g.globalAlpha = alpha; } }
    // front wing
    wingPoly(4, -8, flap, this.tint(wing));
    if (e.tribe === 'silk') wingPoly(12, -4, flap * 0.7, '#a29bfe');
    if (e.status.freeze) { g.globalAlpha = 0.5; g.fillStyle = '#bdf'; g.fillRect(-52, -50, 110, 72); }
    g.restore();
    if (st === 'leafy' && !dyingT) { for (let i = 0; i < 3; i++) { const a = t * 1.5 + i * 2.1; g.fillStyle = '#5fbf4a'; g.beginPath(); g.ellipse(x + Math.cos(a) * 40, y - 6 + Math.sin(a) * 18, 6, 3, a, 0, 7); g.fill(); } }
    if (dyingT || e.petMini) return;
    this.bars(g, e, x, y - 58 * sc, 56);
    this.label(g, e.name + (e.status.camo && e.tribe === 'rain' ? ' (hidden)' : ''), x, y + 40, e.boss ? '#ffb347' : '#ffd0d0');
  }
  shade(hex) { if (hex[0] !== '#') return '#333'; const n = parseInt(hex.slice(1), 16); const r = (n >> 16) * 0.6, gg = ((n >> 8) & 255) * 0.6, b = (n & 255) * 0.6; return `rgb(${r | 0},${gg | 0},${b | 0})`; }
  tint(c) { return c; }

  ambient(e, x, y) {
    if (!e.alive) return;
    const r = Math.random();
    for (const k in e.status) { const cols = STATUS_AMBIENT[k]; if (cols && r < 0.25) this.parts.push({ x: x + (Math.random() - .5) * 30, y: y + 10, vx: (Math.random() - .5) * .5, vy: -1 - Math.random(), life: 30, max: 30, color: cols[(Math.random() * cols.length) | 0], size: 2 + Math.random() * 3, type: k === 'freeze' ? 'spark' : 'dot' }); }
    if (e.tribe === 'ice' && r < 0.1) this.parts.push({ x: x + (Math.random() - .5) * 60, y: y - 20 + (Math.random() - .5) * 40, vx: 0, vy: 0.3, life: 30, max: 30, color: '#fff', size: 2, type: 'spark' });
    if (e.tribe === 'sky' && r < 0.15) this.parts.push({ x: x - 10, y: y - 20, vx: (Math.random() - .5), vy: -0.8, life: 20, max: 20, color: '#ff8c00', size: 2, type: 'dot' });
  }
  drawParticles(g, t) {
    const now = this.now();
    for (const p of this.proj) {
      const k = (now - p.t0) / p.dur;
      if (k >= 1) { p.done = true; this.burst(p.tx, p.ty, 18, [p.color, '#fff']); if (p.aoe) this.rings.push({ x: p.tx, y: p.ty, t0: now, r: TS * 1.5, color: p.color }); continue; }
      const x = p.sx + (p.tx - p.sx) * k, y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * 30;
      g.fillStyle = p.color; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
      this.parts.push({ x, y, vx: 0, vy: 0, life: 12, max: 12, color: p.color, size: 4, type: 'dot' });
    }
    this.proj = this.proj.filter(p => !p.done);
    for (const p of this.parts) {
      if (p.delay > 0) { p.delay--; continue; }
      p.x += p.vx; p.y += p.vy; p.life--; if (p.grow) p.size += p.grow;
      const a = Math.max(0, p.life / p.max); g.globalAlpha = a; g.fillStyle = p.color;
      if (p.type === 'leaf') { g.beginPath(); g.ellipse(p.x, p.y, p.size, p.size / 2, p.life / 5, 0, 7); g.fill(); }
      else if (p.type === 'silk') { g.strokeStyle = p.color; g.lineWidth = 1.5; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 4, p.y - p.vy * 4); g.stroke(); }
      else if (p.type === 'spark') { g.fillRect(p.x - p.size / 2, p.y - 0.75, p.size, 1.5); g.fillRect(p.x - 0.75, p.y - p.size / 2, 1.5, p.size); }
      else { g.beginPath(); g.arc(p.x, p.y, p.size, 0, 7); g.fill(); }
    }
    g.globalAlpha = 1;
    this.parts = this.parts.filter(p => p.life > 0);
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
    for (const m of this.marks) { const k = (now - m.t0) / 350; if (k > 1) { m.done = 1; continue; } g.strokeStyle = m.color; g.globalAlpha = 1 - k; g.lineWidth = 4;
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(m.x - 20 + i * 9, m.y - 22); g.lineTo(m.x + 14 + i * 9, m.y + 20); g.stroke(); } }
    this.marks = this.marks.filter(m => !m.done);
    for (const r of this.rings) { const k = (now - r.t0) / 600; if (k < 0) continue; if (k > 1) { r.done = 1; continue; } g.strokeStyle = r.color; g.globalAlpha = 1 - k; g.lineWidth = 4; g.beginPath(); g.arc(r.x, r.y, r.r * k, 0, 7); g.stroke(); }
    this.rings = this.rings.filter(r => !r.done); g.globalAlpha = 1;
    for (const tx of this.texts) { const k = (now - tx.t0) / 1100; if (k > 1) { tx.done = 1; continue; }
      g.globalAlpha = 1 - k * k; g.font = `bold ${tx.big ? 28 : tx.small ? 14 : 20}px sans-serif`; g.textAlign = 'center';
      g.lineWidth = 4; g.strokeStyle = '#000'; g.strokeText(tx.text, tx.x, tx.y - k * 40); g.fillStyle = tx.color; g.fillText(tx.text, tx.x, tx.y - k * 40); }
    this.texts = this.texts.filter(t => !t.done); g.globalAlpha = 1;
  }
  drawOverlay(g, s, key, t) {
    const W = COLS * TS, H = ROWS * TS, now = this.now();
    if (key === 'ship' && s.stage === 0) { // dark hold with lanterns
      const grd = g.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 520); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,10,0.55)'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
      for (const [lx, ly] of [[3, 1], [8, 1], [6, 7], [11, 3]]) { const f = 0.25 + 0.08 * Math.sin(t * 9 + lx); g.fillStyle = `rgba(255,190,90,${f})`; g.beginPath(); g.arc(lx * TS + 32, ly * TS + 32, 60, 0, 7); g.fill(); g.font = '20px sans-serif'; g.textAlign = 'center'; g.fillText('🏮', lx * TS + 32, ly * TS + 40); }
    }
    if (key === 'ship' && s.stage === 2 && Math.random() < 0.3) this.parts.push({ x: Math.random() * W, y: -5, vx: -1, vy: 6, life: 90, max: 90, color: 'rgba(180,200,255,0.6)', size: 1, type: 'silk' });
    if (key === 'desert') {
      g.fillStyle = `rgba(255,170,60,${0.08 + 0.04 * Math.sin(t)})`; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 6;
      for (let i = 0; i < 6; i++) { g.beginPath(); for (let x = 0; x <= W; x += 20) g.lineTo(x, ((i * 90 + t * 30) % H) + Math.sin(x / 30 + t * 3) * 6); g.stroke(); }
      if (Math.random() < 0.6) this.parts.push({ x: -5, y: Math.random() * H, vx: 4 + Math.random() * 3, vy: (Math.random() - .5), life: 200, max: 200, color: 'rgba(230,190,120,0.7)', size: 1.5, type: 'dot' });
    }
    if (key === 'pond') { g.fillStyle = 'rgba(60,40,20,0.08)'; g.fillRect(0, 0, W, H); }
    if (this.warp && now - this.warp < 2500) { // time-travel swirl
      const k = (now - this.warp) / 2500; g.save(); g.translate(W / 2, H / 2); g.rotate(t * 3);
      for (let i = 0; i < 10; i++) { g.rotate(Math.PI / 5); g.strokeStyle = `hsla(${(i * 36 + t * 200) % 360},90%,65%,${(1 - k) * 0.7})`; g.lineWidth = 14; g.beginPath(); g.arc(0, 0, 60 + i * 40 * (1 + k), 0, 2); g.stroke(); }
      g.restore(); g.fillStyle = `rgba(255,255,255,${Math.max(0, (k - 0.6) * 2.5) * (1 - k) * 2})`; g.fillRect(0, 0, W, H);
    }
    if (this.godFlash && now - this.godFlash < 1500) {
      const k = (now - this.godFlash) / 1500; g.fillStyle = `rgba(255,240,180,${(1 - k) * 0.75})`; g.fillRect(0, 0, W, H);
      g.save(); g.translate(W / 2, H / 2); g.rotate(t); g.fillStyle = `rgba(255,215,0,${(1 - k) * 0.5})`;
      for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(0, 0); g.lineTo(-30, -800); g.lineTo(30, -800); g.fill(); } g.restore();
      g.font = 'bold 44px serif'; g.textAlign = 'center'; g.fillStyle = `rgba(255,255,255,${1 - k})`; g.fillText('✨ DIVINE BALANCE ✨', W / 2, H / 2);
    }
    if (this.banner) {
      const k = (now - this.banner.t0) / 2600; if (k > 1) this.banner = null; else {
        const a = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
        g.fillStyle = `rgba(0,0,0,${0.55 * a})`; g.fillRect(0, H / 2 - 60, W, 110);
        g.globalAlpha = a; g.textAlign = 'center'; g.fillStyle = '#ffd700'; g.font = 'bold 40px Georgia, serif'; g.fillText(this.banner.text, W / 2, H / 2);
        g.fillStyle = '#fff'; g.font = '20px Georgia, serif'; g.fillText(this.banner.sub || '', W / 2, H / 2 + 32); g.globalAlpha = 1;
      }
    }
  }
}
