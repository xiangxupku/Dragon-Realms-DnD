// ===== UI, input and networking =====
const $ = id => document.getElementById(id);
let mode = null;          // 'single' | 'online' | 'arena'
let arenaCfg = { map: 0, dragons: [] };
let heroes = [];          // local heroes made on this device (single / arena hot-seat)
let draft = null;         // hero being created
let ws = null, myOwner = 'local', isHost = true, engine = null, S = null, roomCode = null;
let ui = { mode: null, slot: null, sel: null, talkTo: null, talkOpen: null };
let allocDraft = {};
const renderer = new Renderer($('cv'));
const helper = new Engine(null);

function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === id)); if (id === 'menu') startMenuBg(); }
function hint(t) { $('hint').textContent = t || ''; }
function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function itemOf(e) { return e ? ITEMS[iid(e)] : null; }
// in-game message box (works everywhere, even where browser pop-ups are blocked). Resolves true for OK.
function popup(msg, ask) {
  return new Promise(res => {
    const box = $('popup');
    box.innerHTML = `<div class="card"><p style="white-space:pre-line;font-size:16px">${esc(msg)}</p>
      <button class="gold" id="popOk">${ask ? 'Yes' : 'OK'}</button> ${ask ? '<button id="popNo">No</button>' : ''}</div>`;
    box.style.display = 'flex';
    const done = v => { box.style.display = 'none'; res(v); };
    $('popOk').onclick = () => done(true);
    if (ask) $('popNo').onclick = () => done(false);
  });
}

// ---------------- MENU ----------------
function showMenu() {
  if (!heroes.length) { startPick(true); return; }
  $('partySummary').innerHTML = `<b>🛡️ Your hero${heroes.length > 1 ? 'es' : ''}</b>` + heroes.map(h => {
    const C = CLASSES[h.cls];
    return `<div class="hs"><span class="big">${C.icon}</span><div><b style="font-size:18px">${esc(h.name)}</b><br><span class="muted">${C.name} — ${C.desc}</span><br>
      <span class="muted">SPD ${h.stats.spd} · STR ${h.stats.str} · ENG ${h.stats.eng} · LCK ${h.stats.lck} · RES ${h.stats.res}</span></div></div>`;
  }).join('') + (heroes.length > 1 ? '<div class="muted">Online play uses only your first hero.</div>' : '');
  $('journey').innerHTML = MAPS.map(m => `<div class="stop"><b>${m.icon}</b>${m.name.replace('The ', '')}${m.type === 'school' ? ` (${SCHOOL_DAYS} days)` : m.stages.some(s => s.queen) ? ' 👑' : m.stages.some(s => s.boss) ? ' ⏳' : ''}</div>`).join('<span>➜</span>');
  $('btnAddHero').disabled = heroes.length >= 4;
  show('menu');
}
$('btnSingle').onclick = () => { mode = 'single'; startLocal(); };
$('btnOnline').onclick = () => { mode = 'online'; showOnline(); };
$('btnArena').onclick = () => { mode = 'arena'; arenaCfg = { map: 0, dragons: [] }; setupArena(); show('arena'); };
$('btnAddHero').onclick = () => startPick(false);
$('btnNewHero').onclick = () => { heroes = []; startPick(true); };

// animated menu background: stars + flying dragons
let menuBgOn = false;
function startMenuBg() {
  if (menuBgOn) return; menuBgOn = true;
  const cv = $('menuBg'), g = cv.getContext('2d'), tribes = Object.keys(TRIBES);
  const flyers = Array.from({ length: 7 }, (_, i) => ({ x: Math.random() * 1600, y: 60 + Math.random() * 600, v: 0.4 + Math.random() * 0.8, s: 0.5 + Math.random() * 0.7, tribe: tribes[i % tribes.length] }));
  const stars = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random() * 0.7, r: Math.random() * 1.6 }));
  const loop = () => {
    if (!$('menu').classList.contains('show')) { menuBgOn = false; return; }
    const W = cv.width = innerWidth, H = cv.height = innerHeight, t = performance.now() / 1000;
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d0820'); gr.addColorStop(0.6, '#3a1d2c'); gr.addColorStop(1, '#7a3b1c'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (const s of stars) { g.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(t * 2 + s.x * 50)})`; g.fillRect(s.x * W, s.y * H, s.r, s.r); }
    g.fillStyle = '#ffdd88'; g.beginPath(); g.arc(W * 0.82, H * 0.18, 40, 0, 7); g.fill();
    g.fillStyle = '#1a0f12'; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 40) g.lineTo(x, H - 90 - Math.sin(x / 130) * 40 - Math.sin(x / 47) * 15); g.lineTo(W, H); g.fill();
    for (const f of flyers) {
      f.x += f.v; if (f.x > W + 100) { f.x = -100; f.y = 60 + Math.random() * (H * 0.6); }
      g.save(); g.translate(f.x, f.y + Math.sin(t + f.y) * 10); g.scale(-f.s, f.s);
      renderer.drawDragon.call(renderer, g, { id: 'm' + f.tribe, tribe: f.tribe, status: {}, alive: true, hp: 1, maxHp: 1, name: '', petMini: true }, 0, 0, t);
      g.restore();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function setupArena() {
  const opts = MAPS.map((m, i) => [m, i]).filter(([m]) => m.type === 'dragon');
  $('arenaMap').innerHTML = opts.map(([m, i]) => `<option value="${i}">${m.icon} ${m.name}</option>`).join('');
  $('arenaTribes').innerHTML = Object.entries(TRIBES).map(([k, T]) => `<button class="tribe" data-t="${k}" title="${esc(T.desc)}"><span style="width:14px;height:14px;border-radius:50%;background:${T.body};display:inline-block;border:1px solid #000"></span>${T.name} <span class="muted">(${T.el})</span></button>`).join('');
  $('arenaTribes').querySelectorAll('button').forEach(b => b.onclick = () => { if (arenaCfg.dragons.length < 3) arenaCfg.dragons.push(b.dataset.t); arenaChosen(); });
  arenaChosen();
}
function arenaChosen() { $('arenaChosen').textContent = arenaCfg.dragons.map(t => TRIBES[t].name).join(', ') || 'none'; }
$('arenaClear').onclick = () => { arenaCfg.dragons = []; arenaChosen(); };
$('arenaBack').onclick = () => showMenu();
$('arenaNext').onclick = () => { if (!arenaCfg.dragons.length) return popup('Pick at least one dragon!'); arenaCfg.map = +$('arenaMap').value; startLocal(); };

// ---------------- STEP 1: CHOOSE CLASS ----------------
function startPick(useLast) {
  const last = useLast ? load('dnd_last_hero') : null;
  draft = { name: last?.name || '', cls: last?.cls && CLASSES[last.cls] ? last.cls : 'fighter', stats: null };
  draft.stats = { ...CLASSES[draft.cls].base };
  if (last?.stats && last.cls === draft.cls) { let spent = 0; for (const k in STAT_NAMES) spent += Math.max(0, (last.stats[k] || 0) - draft.stats[k]); if (spent <= START_POINTS) for (const k in STAT_NAMES) draft.stats[k] = Math.max(draft.stats[k], last.stats[k] || 0); }
  $('heroName').value = draft.name;
  $('pickBack').style.display = heroes.length ? 'inline-block' : 'none';
  renderPick(); show('pickClass');
}
function classInfoHtml(cls) {
  const C = CLASSES[cls], a = C.atk;
  const extra = PHB_CLASSES.includes(cls) ? ' <span class="muted">(Player\'s Handbook)</span>' : ' <span class="muted">(extra class)</span>';
  return `<h3>${C.icon} ${C.name}${extra}</h3><div>${C.desc}</div>
    <div class="muted">Base HP ${C.hp} · Armor +${C.ac} · Heal ${C.heal[0]}d${C.heal[1]}${C.healer ? ' (also cures 1 effect)' : ''}</div>
    <div>⚔️ <b>${a.name}</b>: ${a.dice[0]}d${a.dice[1]}${a.hits ? ' ×' + a.hits : ''}, range ${a.range}${a.lifesteal ? ', lifesteal' : ''}</div>
    <div>💥 <b>${C.ability.name}</b> (${C.ability.mp} MP): ${C.ability.desc}</div>
    <div>🔮 <b>${C.spell.name}</b> (${C.spell.mp} MP): ${C.spell.desc}</div>`;
}
function renderPick() {
  const btn = ([k, C]) => `<button class="cls ${k === draft.cls ? 'on' : ''}" data-c="${k}"><span class="ic">${C.icon}</span>${C.name}</button>`;
  const all = Object.entries(CLASSES), phb = all.filter(([k]) => PHB_CLASSES.includes(k)), extra = all.filter(([k]) => !PHB_CLASSES.includes(k));
  $('classGrid').innerHTML = `<h3 style="grid-column:1/-1">📖 Player's Handbook classes (all ${phb.length})</h3>${phb.map(btn).join('')}
    <h3 style="grid-column:1/-1;margin-top:10px">✨ Extra classes (${extra.length})</h3>${extra.map(btn).join('')}`;
  $('classGrid').querySelectorAll('button').forEach(b => b.onclick = () => { if (draft.cls !== b.dataset.c) { draft.cls = b.dataset.c; draft.stats = { ...CLASSES[draft.cls].base }; } renderPick(); });
  $('classInfo').innerHTML = classInfoHtml(draft.cls);
}
$('pickNext').onclick = () => { renderCreate(); show('create'); };
$('pickBack').onclick = () => showMenu();

// ---------------- STEP 2: NAME & STATS ----------------
function spentPoints() { const b = CLASSES[draft.cls].base; let s = 0; for (const k in STAT_NAMES) s += draft.stats[k] - b[k]; return s; }
function renderCreate() {
  const C = CLASSES[draft.cls];
  $('chosenClass').innerHTML = classInfoHtml(draft.cls);
  const left = START_POINTS - spentPoints();
  $('ptsLeft').textContent = left;
  $('statRows').innerHTML = Object.keys(STAT_NAMES).map(k => `<div class="statrow"><span>${STAT_NAMES[k]}</span><b>${draft.stats[k]}</b>
    <button data-k="${k}" data-d="-1" ${draft.stats[k] <= C.base[k] ? 'disabled' : ''}>−</button><button data-k="${k}" data-d="1" ${left <= 0 ? 'disabled' : ''}>+</button><span class="muted">${STAT_HELP[k]}</span></div>`).join('');
  $('statRows').querySelectorAll('button').forEach(b => b.onclick = () => { draft.stats[b.dataset.k] += +b.dataset.d; renderCreate(); });
}
$('heroName').oninput = e => draft.name = e.target.value;
$('createBack').onclick = () => { renderPick(); show('pickClass'); };
function takeDraft() {
  const name = $('heroName').value.trim();
  if (!name) return null;
  const h = { name, cls: draft.cls, stats: { ...draft.stats } };
  store('dnd_last_hero', h);
  return h;
}
$('createDone').onclick = () => {
  const h = takeDraft();
  if (!h) return popup('Give your hero a name!');
  heroes.push(h);
  showMenu();
};

function startLocal() {
  closeNet(); myOwner = 'local'; isHost = true;
  engine = new Engine(onEngineChange); engine.hostOwner = 'local';
  renderer.lastSeq = -1;
  engine.init(mode, mode === 'arena' ? arenaCfg : null);
  heroes.forEach(h => engine.addPlayer('local', h));
  show('game'); engine.start();
}

// ---------------- ONLINE ----------------
function showOnline() {
  show('online'); $('connectBox').style.display = 'block'; $('lobbyBox').style.display = 'none';
  $('serverAddr').value = location.protocol.startsWith('http') ? location.host : (load('dnd_server') || '');
  $('netStatus').textContent = location.protocol.startsWith('http') ? '' : 'You opened the game as a file. Type the server address shown by start-server.bat.';
}
function closeNet() { if (ws) { ws.onclose = null; try { ws.close(); } catch (e) {} ws = null; } }
function connect(then) {
  const addr = $('serverAddr').value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!addr) return popup('Enter the server address, e.g. 192.168.1.5:8080');
  store('dnd_server', addr);
  closeNet();
  $('netStatus').textContent = 'Connecting…';
  try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + addr); } catch (e) { $('netStatus').textContent = 'Bad address.'; return; }
  ws.onopen = () => { $('netStatus').textContent = 'Connected!'; then(); };
  ws.onerror = () => { $('netStatus').textContent = '❌ Could not connect. Is the server running? No Wi-Fi? Play Story Mode instead!'; };
  ws.onclose = () => {
    ws = null;
    if (S && S.phase !== 'lobby') { popup('Disconnected from the server. Returning to menu.'); goMenu(); return; }
    S = null; engine = null;
    $('connectBox').style.display = 'block'; $('lobbyBox').style.display = 'none';
    if (!/Could not/.test($('netStatus').textContent)) $('netStatus').textContent = '📴 Disconnected.';
  };
  ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onNet(m); };
}
function wsSend(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
$('btnCreateRoom').onclick = () => connect(() => wsSend({ t: 'create' }));
$('btnJoinRoom').onclick = () => { const c = $('roomCode').value.trim().toUpperCase(); if (c.length !== 4) return popup('Room codes have 4 letters'); connect(() => wsSend({ t: 'join', room: c, char: heroes[0] })); };
$('onlineBack').onclick = () => goMenu();
$('btnStartOnline').onclick = () => sendAction({ type: 'start' });

function onNet(m) {
  switch (m.t) {
    case 'welcome':
      myOwner = m.cid; isHost = m.host; roomCode = m.room; renderer.lastSeq = -1;
      if (isHost) { engine = new Engine(onEngineChange); engine.hostOwner = myOwner; engine.init('online'); engine.addPlayer(myOwner, heroes[0]); }
      $('connectBox').style.display = 'none'; $('lobbyBox').style.display = 'block'; $('lobbyCode').textContent = roomCode;
      renderLobby();
      break;
    case 'peerJoin': if (engine) engine.addPlayer(m.cid, m.char); break;
    case 'peerLeave': if (engine) engine.markAway(m.cid); break;
    case 'act': if (engine) engine.apply(m.from, m.action); break;
    case 'state': S = m.state; onState(); break;
    case 'promote':
      isHost = true; engine = new Engine(onEngineChange); engine.hostOwner = myOwner;
      engine.load(m.state || S); engine.log('👑 The host left — you are the new host.'); engine.resume(); engine.changed();
      break;
    case 'error': $('netStatus').textContent = '❌ ' + m.msg; closeNet(); break;
    case 'chat': chatLine(`💬 ${esc(m.name)}: ${esc(m.text)}`); break;
  }
}
function onEngineChange(s) { S = s; if (mode === 'online') wsSend({ t: 'state', state: s }); onState(); }
function sendAction(a) {
  if (engine && isHost) { const err = engine.apply(myOwner, a); if (err) { hint('⚠️ ' + err); $('dice').style.display = 'none'; } return err; }
  wsSend({ t: 'act', action: a });
}
function renderLobby() {
  if (!S) { $('lobbyList').innerHTML = '<span class="muted">…</span>'; }
  else $('lobbyList').innerHTML = S.players.map(p => `<div class="mini">${CLASSES[p.cls].icon} <b>${esc(p.name)}</b> the ${CLASSES[p.cls].name}${p.owner === myOwner ? ' (you)' : ''}</div>`).join('');
  $('btnStartOnline').style.display = isHost ? 'inline-block' : 'none';
  $('lobbyWait').style.display = isHost ? 'none' : 'block';
}
let chatLines = [];
function chatLine(h) { chatLines.push(h); if (chatLines.length > 20) chatLines.shift(); renderLog(); }
$('chatSend').onclick = () => { const t = $('chatIn').value.trim(); if (!t) return; wsSend({ t: 'chat', name: myHero()?.name || '?', text: t }); $('chatIn').value = ''; };
$('chatIn').onkeydown = e => { if (e.key === 'Enter') $('chatSend').onclick(); };

function goMenu() {
  closeNet(); if (engine) clearTimeout(engine.timer); engine = null; S = null; ui = { mode: null, slot: null, sel: null, talkTo: null, talkOpen: null };
  renderer.s = null; $('dice').style.display = 'none'; closeTalk(); showMenu();
}
$('btnQuit').onclick = () => { popup('Leave this game and go back to the main menu?', true).then(ok => { if (ok) goMenu(); }); };

// ---------------- GAME STATE → UI ----------------
function curPlayer() { return S && S.phase === 'battle' && S.side === 'players' ? S.players.find(p => p.id === S.order[S.cur]) : null; }
function myTurn() { const p = curPlayer(); return p && p.owner === myOwner ? p : null; }
function myHero() {
  if (!S) return null;
  const t = myTurn(); if (t) return t;
  const mineList = S.players.filter(p => p.owner === myOwner);
  return mineList.find(p => p.id === ui.sel) || mineList[0];
}
function exploring() { return S && S.phase === 'explore'; }
function canFreeUse() { return S && ['explore', 'clear', 'levelup'].includes(S.phase); }

function onState() {
  if (!S) return;
  helper.s = S;
  if (S.phase === 'lobby') { if (renderer.lastSeq < 0) renderer.lastSeq = 0; if (mode === 'online') renderLobby(); return; }
  if (!$('game').classList.contains('show')) show('game');
  fitBoard();
  renderer.setState(S);
  if (!myTurn()) ui.mode = null;
  refreshHighlights();
  renderSide(); renderModal();
  if (ui.talkOpen) { if (!exploring()) closeTalk(); else renderTalk(); }
  if (ui.talkTo && exploring()) { const me = myHero(), n = S.npcs.find(x => x.id === ui.talkTo); if (me && n && cheb(me, n) <= 1) { ui.talkTo = null; openTalk(n.id); } }
  const me = myHero();
  const blur = S.phase !== 'battle' ? 0 : (me && me.status.blur ? 3 : 0) + (isDesert(S) ? 1.2 : 0);
  $('cv').style.filter = blur ? `blur(${blur}px)` : 'none';
  $('chatBox').style.display = mode === 'online' ? 'flex' : 'none';
  if (!exploring() && $('hint').textContent.startsWith('🚶 Click anywhere')) hint('');
  if (exploring() && !$('hint').textContent) hint('🚶 Click anywhere to walk · click people 💬 to talk & shop · walk to 🏜️ to leave');
}

function bar(v, max, color, label) { const f = max ? Math.max(0, Math.min(1, v / max)) : 0; return `<div class="bar"><div style="width:${f * 100}%;background:${color}"></div><span>${label}</span></div>`; }
function statusList(e) { return Object.entries(e.status).map(([k, n]) => `<span title="${STATUS[k].name}">${STATUS[k].icon}${n}</span>`).join(' ') || '<span class="muted">none</span>'; }
function enemyLabel(e) { return e.kind === 'dragon' ? `🐉 ${e.name}` : e.kind === 'bully' ? `😈 ${e.name} <span class="muted">${e.title}</span>` : `🧑‍🎓 ${e.name} <span class="muted">${e.title}</span>`; }

function goalText(s) {
  if (s.arena) return '🎯 Defeat every dragon!';
  const M = MAPS[s.map], st = M.stages[s.stage];
  if (s.phase === 'explore') return '🎯 Talk to people · walk to 🏜️ to leave';
  if (s.phase !== 'battle') return '';
  if (M.type === 'school') {
    const passed = s.doors.filter(d => d.passed).length;
    return s.exitOpen ? `🎯 Walk to the ${st.bed ? 'bed 🛏️' : 'stairs 🪜'}!` : `🎯 Pass the tests 🚪 (${passed}/${s.doors.length})`;
  }
  if (st.queen) return '🎯 Defeat the Queen!';
  if (st.boss) return `🎯 Defeat the ${st.boss}!`;
  if (s.exitOpen) return `🎯 Exit open! Walk to ${s.exit.icon}`;
  const left = Math.max(0, s.need - s.kills);
  return `🎯 Defeat ${left} more ${TRIBES[M.tribe].name}${left === 1 ? '' : 's'} to open the exit`;
}

function renderSide() {
  const s = S, map = MAPS[s.map];
  $('stageTitle').textContent = s.arena ? '🏟️ Dragon Arena' : `${map.icon} ${map.name} — ${s.stageName}`;
  const goal = goalText(s);
  $('roundInfo').textContent = (s.phase === 'battle' ? `· Round ${s.round} ` : '') + (s.arena ? '' : `· 👑 ${(s.queens || []).length}/${TOTAL_QUEENS} `) + (s.day ? `· 📅 Day ${Math.min(s.day, SCHOOL_DAYS)}/${SCHOOL_DAYS} ` : '') + (goal ? '· ' + goal : '');
  $('roomInfo').textContent = mode === 'online' ? `Room ${roomCode}${isHost ? ' (host)' : ''}` : (mode === 'arena' ? 'Arena' : 'Offline');
  const cp = curPlayer();
  let ti = '';
  if (s.phase === 'battle') {
    if (s.side === 'enemies') ti = map.type === 'school' ? '😈 The hallway is moving…' : '🐉 Dragons are attacking…';
    else if (s.test) ti = `📝 ${S.players.find(p => p.id === s.test.pid)?.name} is taking a ${s.test.subject} test…`;
    else if (cp && cp.owner === myOwner) ti = `⭐ ${cp.name}'s turn! Walk ${cp.moved ? '✔' : '○'} · Action ${cp.acted ? '✔' : '○'} · Item ${cp.itemUsed ? '✔' : '○'}`;
    else if (cp) ti = `⏳ Waiting for ${cp.name}…`;
  } else if (s.phase === 'explore') ti = '🏘️ Free time — explore the village!';
  $('turnInfo').textContent = ti;

  const me = myHero();
  if (me) {
    const C = CLASSES[me.cls];
    const pet = me.pet ? `<div>🐲 <b>${esc(me.pet.name)}</b> — ${PETS[me.pet.type].name} dragon Lv ${me.pet.lvl}/${PET_MAX} <span class="muted">(${PETS[me.pet.type].desc})</span></div>` : '';
    $('heroCard').innerHTML = `<div class="row" style="justify-content:space-between"><b style="font-size:16px">${C.icon} ${esc(me.name)}</b><span>Lv ${me.lvl} ${C.name}</span></div>
      ${bar(me.hp, me.maxHp, '#3fd16b', `HP ${me.hp}/${me.maxHp}${me.shield ? ' +🛡️' + me.shield : ''}`)}
      ${bar(me.mp, me.maxMp, '#4aa3ff', `MP ${me.mp}/${me.maxMp}`)}
      ${bar(me.xp, xpNeed(me.lvl), '#c08bff', `XP ${me.xp}/${xpNeed(me.lvl)}`)}
      <div class="muted">SPD ${me.stats.spd} · STR ${me.stats.str} · ENG ${me.stats.eng} · LCK ${me.stats.lck} · RES ${me.stats.res}</div>
      <div class="muted">Walk ${moveRange(me, s)} · Armor ${acOf(me)} · Hit +${hitBonus(me, s)} · Crit ${critAt(me)}+ · Block ${damageReduce(me)}</div>
      <div>Effects: ${statusList(me)} · 💰 <b style="color:var(--gold)">${me.gold || 0}</b>${me.hint ? ` · 💡 ${me.hint} hint${me.hint > 1 ? 's' : ''}` : ''}</div>
      ${pet}
      <div title="Charges 1 per turn. When full: Divine Balance">🌟 God Power <span class="pips">${[0, 1, 2, 3, 4, 5].map(i => `<span class="${i < me.god ? 'f' : ''}"></span>`).join('')}</span></div>`;
    // equipment slots
    const slots = [['weapon', '🗡️ Weapon'], ['armor', '🛡️ Armor'], ['offhand', '✋ Off-hand']];
    $('equip').innerHTML = slots.map(([k, lab]) => {
      const e = me.equip[k], I = itemOf(e);
      let extra = '';
      if (k === 'armor' && I) { const d = idur(e); extra = bar(d, I.dur, d > I.dur * 0.3 ? '#3fd16b' : '#e74c3c', `${d}/${I.dur}`) + (d <= 0 ? '<span style="color:#f88">BROKEN</span>' : ''); }
      return `<div class="eqs" data-w="${k}" title="${I ? esc(I.name + ': ' + I.desc) : 'empty'}"><span class="lab">${lab}</span><span class="ic">${I ? I.icon : '·'}</span>${I ? esc(I.name) : '<span class="muted">empty</span>'}${extra}</div>`;
    }).join('');
    $('equip').querySelectorAll('.eqs').forEach(b => b.onclick = () => { if (me.equip[b.dataset.w]) sendAction({ type: 'unequip', pid: me.id, which: b.dataset.w }); });
    const mt = myTurn() === me, can = mt && me.alive && !s.test;
    $('aMove').disabled = !can || me.moved || moveRange(me, s) === 0;
    $('aAtk').disabled = !can || me.acted;
    $('aAbility').disabled = !can || me.acted || me.mp < C.ability.mp;
    $('aSpell').disabled = !can || me.acted || me.mp < C.spell.mp;
    $('aHeal').disabled = !can || me.acted || me.mp < 3;
    $('aGod').disabled = !can || me.acted || me.god < 6;
    $('aEnd').disabled = !can;
    $('aAtk').textContent = `⚔️ ${C.atk.name}`;
    $('aAbility').textContent = `💥 ${C.ability.name} (${C.ability.mp})`;
    $('aSpell').textContent = `🔮 ${C.spell.name} (${C.spell.mp})`;
    for (const [id, m] of [['aMove', 'move'], ['aAtk', 'atk'], ['aAbility', 'ability'], ['aSpell', 'spell'], ['aHeal', 'heal']]) $(id).classList.toggle('on', ui.mode === m);
    $('aGod').classList.toggle('gold', me.god >= 6);
    // inventory
    $('invTitle').textContent = `🎒 Inventory (${me.inv.length} slots)`;
    $('inv').innerHTML = me.inv.map((it, i) => { const I = itemOf(it); return `<button class="slot ${ui.slot === i ? 'sel' : ''}" data-i="${i}" title="${I ? esc(I.name + ': ' + I.desc) : 'empty'}">${I ? I.icon : ''}</button>`; }).join('');
    $('inv').querySelectorAll('.slot').forEach(b => b.onclick = () => selectSlot(+b.dataset.i));
    if (ui.slot != null && me.inv[ui.slot]) {
      const e = me.inv[ui.slot], I = itemOf(e), gear = !!I.slot;
      const usable = gear ? (mt || canFreeUse()) : (mt ? !me.itemUsed : canFreeUse() && I.target !== 'enemy');
      const dur = I.slot === 'armor' ? ` (durability ${idur(e)}/${I.dur})` : '';
      $('itemInfo').innerHTML = `<b>${I.icon} ${I.name}</b>${dur} — ${I.desc}<br><button id="useItem" ${usable ? '' : 'disabled'}>${gear ? '🧰 Equip' : 'Use'}</button> <button id="dropItem">🗑️ Drop</button>`;
      $('useItem').onclick = () => useItem(me, ui.slot);
      $('dropItem').onclick = () => { sendAction({ type: 'drop', pid: me.id, slot: ui.slot }); ui.slot = null; };
    } else $('itemInfo').textContent = `${me.inv.filter(Boolean).length}/${me.inv.length} slots used. Click an item to use or equip it.`;
  }
  $('party').innerHTML = s.players.map(p => `<div class="mini ${cp && cp.id === p.id ? 'cur' : ''}">${CLASSES[p.cls].icon} <b>${esc(p.name)}</b> Lv${p.lvl} ${p.pet ? '🐲' : ''} ${p.away ? '📴' : ''}${!p.alive ? '💀' : ''} ${p.owner === myOwner && mode === 'online' ? '(you)' : ''}
     ${bar(p.hp, p.maxHp, '#3fd16b', `${p.hp}/${p.maxHp}`)} ${statusList(p)}</div>`).join('');
  const foes = s.enemies.filter(e => e.alive && e.hostile), calm = s.enemies.filter(e => e.alive && !e.hostile).length;
  $('foes').innerHTML = foes.map(e => `<div class="mini ${s.active === e.id && s.side === 'enemies' ? 'cur' : ''}"><b>${enemyLabel(e)}</b>${e.lvl ? ` <span class="muted">Lv${e.lvl}</span>` : ''}
     ${bar(e.hp, e.maxHp, '#e74c3c', `${e.hp}/${e.maxHp}`)} ${statusList(e)}</div>`).join('') + (calm ? `<div class="muted">🧑‍🎓 ${calm} friendly student${calm > 1 ? 's' : ''} nearby — walk next to one and click to talk</div>` : '') || '<span class="muted">none</span>';
  renderLog();
}
function renderLog() {
  if (!S) return;
  $('log').innerHTML = [...S.log.slice(-40).map(esc), ...chatLines].reverse().map(l => `<div>${l}</div>`).join('');
}

function nextText(s) {
  if (s.arena) return 'Arena complete!';
  const M = MAPS[s.map], st = M.stages[s.stage];
  if (M.type === 'school') return st.bed ? (s.day >= SCHOOL_DAYS ? '🏆 The end!' : `☀️ Day ${s.day + 1} — Floor 1`) : `🪜 Floor ${st.floor + 1}`;
  let i = s.stage + 1, m = s.map; if (i >= M.stages.length) { m++; i = 0; }
  if (m >= MAPS.length) return 'The final victory!';
  return `${MAPS[m].icon} ${MAPS[m].name}: ${MAPS[m].stages[i].name}`;
}
function renderModal() {
  const m = $('modal'), s = S;
  let h = '';
  if (s.test && s.phase === 'battle') {
    const T = s.test, who = s.players.find(p => p.id === T.pid), q = T.qs[T.i];
    if (who && who.owner === myOwner && q) {
      h = `<div class="quiz"><h2>📝 ${esc(T.subject)} Test</h2><p class="muted">${esc(who.name)} · Question ${T.i + 1} of 3 · Correct so far: ${T.right} (need 2)</p>
        ${T.last ? `<p>${T.last.ok ? '✔️ Correct!' : `❌ Wrong — the answer was <b>${esc(T.last.correct)}</b>`}</p>` : ''}
        <h3 style="color:#fff">${esc(q.q)}</h3>
        ${q.a.map((a, i) => `<button class="ans ${q.hide === i ? 'hid' : ''}" data-ans="${i}" ${q.hide === i ? 'disabled' : ''}>${'ABCD'[i]}. ${esc(a)}</button>`).join('')}
        ${q.hide != null ? '<p class="muted">💡 A smart student crossed out one wrong answer for you!</p>' : ''}</div>`;
    } else h = `<h2>📝 ${esc(who ? who.name : '')} is taking a ${esc(T.subject)} test…</h2><p class="muted">Question ${T.i + 1} of 3</p>`;
  } else if (s.phase === 'clear') {
    const q = s.enemies.find(e => e.chief), st = s.arena ? {} : MAPS[s.map].stages[s.stage];
    const title = q ? (q.queen ? '🕊️ The Queen is defeated!' : '⏳ The time portal opens!') : st.bed ? `😴 Day ${s.day} survived!` : MAPS[s.map].type === 'school' ? '🎓 Floor complete!' : '🚶 You made it through!';
    const btn = MAPS[s.map].key === 'ship' && s.stage < 2 && !s.arena ? '🪜 Climb to the next deck' : st.bed ? '😴 Sleep' : q && !q.queen ? '🌀 Jump into the portal' : MAPS[s.map].type === 'school' ? '🪜 Go upstairs' : '➡️ Travel on';
    h = `<h2>${title}</h2><p>${esc(s.stageName)} is behind you.</p><p class="muted">Next: ${esc(nextText(s))}</p>
      ${s.players.some(p => p.points > 0) ? '<p>⭐ Someone leveled up! Spend your points next.</p>' : ''}
      ${isHost ? `<button class="gold big" id="mNext">${btn}</button>` : '<p class="muted">Waiting for the host…</p>'}`;
  } else if (s.phase === 'levelup') {
    const mine = s.players.filter(p => p.owner === myOwner && p.points > 0);
    h = `<h2>⭐ Level Up!</h2><p class="muted">All stats got +1. Spend your ${LEVEL_POINTS} bonus points:</p>`;
    for (const p of mine) {
      const d = allocDraft[p.id] || (allocDraft[p.id] = { ...p.stats });
      let spent = 0; for (const k in STAT_NAMES) spent += d[k] - p.stats[k];
      h += `<div class="card" style="text-align:left"><b>${CLASSES[p.cls].icon} ${esc(p.name)} — Lv ${p.lvl}</b> · points left: <b>${p.points - spent}</b>
        ${Object.keys(STAT_NAMES).map(k => `<div class="statrow"><span>${STAT_NAMES[k]}</span><b>${d[k]}</b><button data-p="${p.id}" data-k="${k}" data-d="-1" ${d[k] <= p.stats[k] ? 'disabled' : ''}>−</button><button data-p="${p.id}" data-k="${k}" data-d="1" ${spent >= p.points ? 'disabled' : ''}>+</button><span class="muted">${STAT_HELP[k]}</span></div>`).join('')}
        <button class="gold" data-ok="${p.id}">✔ Confirm</button></div>`;
    }
    const waiting = s.players.filter(p => p.points > 0 && p.owner !== myOwner && !p.away);
    if (waiting.length) h += `<p class="muted">Waiting for: ${waiting.map(p => esc(p.name)).join(', ')}</p>`;
    if (isHost) h += `<button id="mForce">Skip (keep leftover points)</button>`;
  } else if (s.phase === 'over') {
    h = `<h2>💀 Your party has fallen</h2><p>${MAPS[s.map].type === 'school' ? 'The bullies win this time…' : 'The enemies win this time…'}</p>${isHost ? '<button class="gold big" id="mRetry">🔁 Try again</button><br>' : '<p class="muted">Waiting for the host…</p>'}<button id="mMenu">Main menu</button>`;
  } else if (s.phase === 'victory') {
    const school = !s.arena && MAPS[s.map].type === 'school';
    h = `<h2>${s.arena ? '👑 Arena Champion!' : '🏆 YOU WIN!'}</h2><p>${s.arena ? 'You defeated every dragon in the arena.' : `You made peace with ${s.queens.length} dragon queens, beat the Timekeeper, and survived ${SCHOOL_DAYS} days at Yorkson Creek Middle School in the future!<br>The gods smile on you, scavenger — the world is balanced!`}</p>
      ${isHost ? '<button class="gold big" id="mAgain">⚔️ Play again (keep levels)</button><br>' : ''}<button id="mMenu">Main menu</button>`;
    if (!school && !s.arena) h = h.replace('YOU WIN', 'VICTORY');
  }
  if (!h) { m.style.display = 'none'; m.dataset.h = ''; return; }
  m.style.display = 'flex';
  if (m.dataset.h === h) return; // avoid re-render flicker
  m.dataset.h = h;
  m.innerHTML = `<div class="card">${h}</div>`;
  const on = (id, f) => { const b = $(id); if (b) b.onclick = f; };
  on('mNext', () => sendAction({ type: 'next' }));
  on('mForce', () => sendAction({ type: 'force' }));
  on('mRetry', () => sendAction({ type: 'retry' }));
  on('mAgain', () => sendAction({ type: 'again' }));
  on('mMenu', () => goMenu());
  m.querySelectorAll('button[data-ans]').forEach(b => b.onclick = () => { const p = myTurn(); if (p) sendAction({ type: 'answer', pid: p.id, choice: +b.dataset.ans }); });
  m.querySelectorAll('button[data-k]').forEach(b => b.onclick = () => { allocDraft[b.dataset.p][b.dataset.k] += +b.dataset.d; renderModal(); });
  m.querySelectorAll('button[data-ok]').forEach(b => b.onclick = () => { const id = b.dataset.ok; sendAction({ type: 'alloc', pid: id, stats: allocDraft[id] }); delete allocDraft[id]; });
}

// ---------------- VILLAGE: talking to people ----------------
function openTalk(npcId) { ui.talkOpen = npcId; renderTalk(); }
function closeTalk() { ui.talkOpen = null; $('talk').style.display = 'none'; $('talk').dataset.h = ''; }
function renderTalk() {
  const n = S.npcs.find(x => x.id === ui.talkOpen), me = myHero(); if (!n || !me) return closeTalk();
  const N = VILLAGE_NPCS[n.idx];
  let body = '';
  const goods = (N.goods || []).map(id => {
    const B = BAGS[id], I = B || ITEMS[id], price = I.price;
    const full = B ? me.inv.length >= MAX_SLOTS : !me.inv.includes(null);
    return `<button data-buy="${id}" ${me.gold < price || full ? 'disabled' : ''} title="${esc(I.desc)}"><span class="ic">${I.icon}</span><b>${I.name}</b><br>💰 ${price} · <span class="muted">${esc(I.desc)}</span></button>`;
  }).join('');
  if (goods) body += `<div class="shop">${goods}</div>`;
  if (N.role === 'inn') body += `<button class="gold big" id="tRest">🛏️ Rest (free) — heal everyone</button>`;
  if (N.repair) { const c = helper.repairCost(me); body += `<p>⚒️ Armor repair: ${me.equip.armor ? (c ? `<button id="tRepair" ${me.gold < c ? 'disabled' : ''}>Fix my ${itemOf(me.equip.armor).name} — 💰 ${c}</button>` : 'your armor is perfect!') : 'no armor equipped'}</p>`; }
  if (N.train) {
    body += me.pet ? `<p>🐲 ${esc(me.pet.name)} (${PETS[me.pet.type].name}) is level ${me.pet.lvl}/${PET_MAX}. ${me.pet.lvl < PET_MAX ? `<button id="tTrain" ${me.gold < helper.trainCost(me) ? 'disabled' : ''}>🏋️ Train — 💰 ${helper.trainCost(me)}</button>` : '⭐ Max level!'}</p>`
      : '<p class="muted">Buy an egg, then use it from your inventory to hatch your own dragon! Guardian = +HP, Fury = +damage, Battle = fights with you.</p>';
  }
  if (N.wheel) body += `<p><button class="gold big" id="tSpin" ${me.gold < WHEEL_COST ? 'disabled' : ''}>🎡 Spin the wheel — 💰 ${WHEEL_COST}</button></p><p class="muted">Prizes: ${WHEEL.map(w => w.label).join(' · ')}</p>`;
  if (N.role === 'store' || N.role === 'smith') {
    const sell = me.inv.map((e, i) => e ? `<button data-sell="${i}" style="padding:2px 6px" title="${itemOf(e).name}">${itemOf(e).icon} +${Math.floor((itemOf(e).price || 20) / 2)}</button>` : '').join(' ');
    if (sell.trim()) body += `<div class="muted">Sell (half price): ${sell}</div>`;
  }
  const h = `<div class="who"><span class="face">${N.icon}</span><div><b style="font-size:17px">${esc(N.name)}</b><div class="bubble">${esc(N.greet)}</div></div></div>
    <p class="muted">${CLASSES[me.cls].icon} ${esc(me.name)} · 💰 <b style="color:var(--gold)">${me.gold}</b> gold · 🎒 ${me.inv.filter(Boolean).length}/${me.inv.length}</p>${body}
    <p style="text-align:right"><button id="tBye">👋 Bye</button></p>`;
  const box = $('talk');
  box.style.display = 'flex';
  if (box.dataset.h === h) return;
  box.dataset.h = h; box.innerHTML = `<div class="card">${h}</div>`;
  const on = (id, f) => { const b = $(id); if (b) b.onclick = f; };
  on('tBye', closeTalk);
  on('tRest', () => sendAction({ type: 'rest', pid: me.id }));
  on('tRepair', () => sendAction({ type: 'repair', pid: me.id }));
  on('tTrain', () => sendAction({ type: 'train', pid: me.id }));
  on('tSpin', () => sendAction({ type: 'spin', pid: me.id }));
  box.querySelectorAll('button[data-buy]').forEach(b => b.onclick = () => sendAction({ type: 'buy', pid: me.id, item: b.dataset.buy }));
  box.querySelectorAll('button[data-sell]').forEach(b => b.onclick = () => sendAction({ type: 'sell', pid: me.id, slot: +b.dataset.sell }));
}

// ---------------- WHEEL OF FORTUNE ----------------
function drawWheel(rot) {
  const cv = $('wheelCv'), g = cv.getContext('2d'), n = WHEEL.length, R = 150, c = 160;
  g.clearRect(0, 0, 320, 320);
  for (let i = 0; i < n; i++) {
    const a0 = rot + i * 2 * Math.PI / n, a1 = a0 + 2 * Math.PI / n;
    g.fillStyle = WHEEL[i].color; g.beginPath(); g.moveTo(c, c); g.arc(c, c, R, a0, a1); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    g.save(); g.translate(c, c); g.rotate(a0 + Math.PI / n); g.fillStyle = '#111'; g.font = 'bold 12px sans-serif'; g.textAlign = 'right'; g.fillText(WHEEL[i].label, R - 8, 4); g.restore();
  }
  g.fillStyle = '#3a2408'; g.beginPath(); g.arc(c, c, 18, 0, 7); g.fill();
  g.fillStyle = '#ffd166'; g.beginPath(); g.moveTo(c + R - 10, c); g.lineTo(c + R + 14, c - 10); g.lineTo(c + R + 14, c + 10); g.fill(); // pointer on the right
}
renderer.onWheel = ev => {
  const p = S && S.players.find(q => q.id === ev.pid);
  $('wheelTitle').textContent = `🎡 ${p ? p.name : ''} spins the wheel!`;
  $('wheelRes').textContent = ''; $('wheelOk').style.visibility = 'hidden';
  $('wheelBox').style.display = 'flex';
  const n = WHEEL.length, seg = 2 * Math.PI / n;
  const target = -(ev.idx * seg + seg / 2) + Math.PI * 2 * 6; // land the prize under the pointer
  const t0 = performance.now(), dur = 3200;
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / dur), ease = 1 - Math.pow(1 - k, 3);
    drawWheel(target * ease);
    if (k < 1) requestAnimationFrame(step);
    else { $('wheelRes').textContent = '🎉 ' + ev.label + '!'; $('wheelOk').style.visibility = 'visible'; }
  };
  step();
};
$('wheelOk').onclick = () => { $('wheelBox').style.display = 'none'; };

// ---------------- ACTIONS ----------------
function specOf(p, kind) { const C = CLASSES[p.cls]; return kind === 'atk' ? C.atk : C[kind]; }
function setMode(m) {
  const p = myTurn(); if (!p) return;
  if (ui.mode === m) { ui.mode = null; refreshHighlights(); renderSide(); hint(''); return; }
  ui.mode = m; ui.slot = m === 'item' ? ui.slot : null;
  if (m === 'atk' || m === 'ability' || m === 'spell') {
    const sp = specOf(p, m);
    if ((sp.target || 'enemy') !== 'enemy') { ui.mode = null; askRoll({ type: 'act', pid: p.id, kind: m }, `${sp.name}: ${sp.desc}`, sp); return; }
    hint(`🎯 Click a target within range ${sp.range} for ${sp.name}.`);
  }
  if (m === 'move') hint(`🚶 Click a blue tile to walk (up to ${moveRange(p, S)} tiles; mud costs 2).`);
  if (m === 'heal') hint('💚 Click yourself or an ally within 4 tiles.');
  refreshHighlights(); renderSide();
}
$('aMove').onclick = () => setMode('move');
$('aAtk').onclick = () => setMode('atk');
$('aAbility').onclick = () => setMode('ability');
$('aSpell').onclick = () => setMode('spell');
$('aHeal').onclick = () => setMode('heal');
$('aGod').onclick = () => { const p = myTurn(); if (p) askRoll({ type: 'god', pid: p.id }, '🌟 Divine Balance: heal & revive all allies, cure effects, and smite every enemy (2d10 + level×2).', { dice: [2, 10], word: `+ ${p.lvl * 2} holy damage to every enemy` }); };
$('aEnd').onclick = () => { const p = myTurn(); if (!p) return; ui.mode = null; hint(''); sendAction({ type: 'end', pid: p.id }); };

function selectSlot(i) { ui.slot = ui.slot === i ? null : i; if (ui.mode === 'item') ui.mode = null; refreshHighlights(); renderSide(); }
function useItem(p, slot) {
  const I = itemOf(p.inv[slot]); if (!I) return;
  if (I.slot) { sendAction({ type: 'equip', pid: p.id, slot }); ui.slot = null; return; }
  if (I.target === 'self' || canFreeUse()) { sendAction({ type: 'item', pid: p.id, slot, target: p.id }); ui.slot = null; return; }
  ui.mode = 'item'; hint(I.target === 'enemy' ? `💣 Click an enemy within 5 tiles.` : `${I.icon} Click yourself or an ally standing next to you.`);
  refreshHighlights(); renderSide();
}

function refreshHighlights() {
  const hover = renderer.ui && renderer.ui.hover;
  const r = renderer.ui = { hover }; const p = myTurn();
  if (!p || !ui.mode) return;
  if (ui.mode === 'move') { const reach = helper.reach(p, moveRange(p, S)); r.reach = [...reach.keys()].filter(k => k !== p.x + ',' + p.y); return; }
  if (['atk', 'ability', 'spell'].includes(ui.mode)) {
    const sp = specOf(p, ui.mode);
    r.targets = S.enemies.filter(e => e.alive && cheb(p, e) <= sp.range).map(e => e.id);
    r.range = []; for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (cheb(p, { x, y }) <= sp.range) r.range.push(x + ',' + y);
  }
  if (ui.mode === 'heal') { r.targets = S.players.filter(q => q.alive && !q.away && cheb(p, q) <= 4).map(q => q.id); r.targetColor = '#3fd16b'; }
  if (ui.mode === 'item' && ui.slot != null) {
    const I = itemOf(p.inv[ui.slot]);
    if (I && I.target === 'enemy') r.targets = S.enemies.filter(e => e.alive && cheb(p, e) <= 5).map(e => e.id);
    else if (I) { r.targets = S.players.filter(q => !q.away && (q.alive || I.dead) && cheb(p, q) <= 1).map(q => q.id); r.targetColor = '#3fd16b'; }
  }
}

function tileFromEvent(ev) {
  const rc = $('cv').getBoundingClientRect();
  const cx = (ev.clientX - rc.left) / rc.width * COLS, cy = (ev.clientY - rc.top) / rc.height * ROWS;
  return { x: Math.floor(cx), y: Math.floor(cy), fx: cx, fy: cy };
}
function entityAt(t, ids) {
  if (!S) return null;
  const all = [...S.players.filter(p => !p.away), ...S.enemies.filter(e => e.alive), ...(S.npcs || [])];
  const list = ids ? all.filter(e => ids.includes(e.id)) : all;
  let best = null, bd = 0.9;
  for (const e of list) { const d = Math.hypot(e.x + 0.5 - t.fx, e.y + 0.5 - t.fy); if (d < bd) { bd = d; best = e; } }
  return best;
}
function exploreClick(t) {
  const me = myHero(); if (!me) return;
  const e = entityAt(t);
  if (e && e.owner === myOwner) { ui.sel = e.id; renderSide(); hint(`🧍 Now controlling ${e.name}`); return; }
  if (e && e.role) { // a village person
    if (cheb(me, e) <= 1) { openTalk(e.id); return; }
    const r = helper.reach(me, 80); let best = null;
    for (const v of r.values()) if (cheb(v, e) <= 1 && (!best || v.c < best.c)) best = v;
    if (!best) { hint('⚠️ Can\'t reach them'); return; }
    ui.talkTo = e.id; sendAction({ type: 'walk', pid: me.id, x: best.x, y: best.y }); return;
  }
  const r = helper.reach(me, 80);
  if (!r.get(t.x + ',' + t.y)) { hint('⚠️ Can\'t walk there'); return; }
  if (S.exit && t.x === S.exit.x && t.y === S.exit.y) {
    popup('Leave the village and head to the Scorching Desert?\n(Make sure everyone finished shopping!)', true).then(ok => { if (ok) sendAction({ type: 'walk', pid: me.id, x: t.x, y: t.y }); });
    return;
  }
  sendAction({ type: 'walk', pid: me.id, x: t.x, y: t.y });
}
$('cv').addEventListener('click', ev => {
  if (!S) return;
  const t = tileFromEvent(ev);
  if (exploring()) return exploreClick(t);
  if (S.phase !== 'battle') return;
  const p = myTurn();
  if (p && ui.mode === 'move') {
    if ((renderer.ui.reach || []).includes(t.x + ',' + t.y)) { sendAction({ type: 'move', pid: p.id, x: t.x, y: t.y }); ui.mode = null; hint(''); }
    else hint('⚠️ You can only walk to the blue tiles.');
    return;
  }
  if (p && ui.mode && renderer.ui.targets) {
    const e = entityAt(t, renderer.ui.targets);
    if (!e) { hint('⚠️ Click one of the circled targets.'); return; }
    if (ui.mode === 'item') { sendAction({ type: 'item', pid: p.id, slot: ui.slot, target: e.id }); ui.mode = null; ui.slot = null; hint(''); return; }
    if (ui.mode === 'heal') { const C = CLASSES[p.cls]; askRoll({ type: 'heal', pid: p.id, target: e.id }, `💚 Heal ${e.name}`, { dice: C.heal, word: `+ ${Math.floor(p.stats.eng / 2)} healing` }); return; }
    const sp = specOf(p, ui.mode);
    const go = () => askRoll({ type: 'act', pid: p.id, kind: ui.mode, target: e.id }, `${sp.name} → ${e.name}`, sp, p);
    if (e.kind === 'student' && !e.hostile) popup(`${e.name} is a friendly student. Attack them anyway? They WILL fight back!`, true).then(ok => { if (ok) go(); });
    else go();
    return;
  }
  const e = entityAt(t);
  if (p && e && e.kind === 'student' && !e.hostile && !S.test) {
    if (cheb(p, e) > 1) { hint(`💬 Walk next to ${e.name} to talk to them.`); showInfo(e); return; }
    if (e.talked) { hint(`💬 ${e.name} already helped you.`); return; }
    popup(`Talk to ${e.name} the ${e.title}? They're smart — they'll give you a test hint!`, true).then(ok => { if (ok) sendAction({ type: 'talk', pid: p.id, target: e.id }); });
    return;
  }
  if (e) showInfo(e);
});
$('cv').addEventListener('mousemove', ev => {
  if (!S || !S.tiles) return;
  const t = tileFromEvent(ev); renderer.ui.hover = t;
  const e = entityAt(t); if (e) showInfo(e); else $('infoBox').innerHTML = '';
});

// keep the whole map visible: biggest board with the map's shape that fits the free space
function fitBoard() {
  if (!$('game').classList.contains('show')) return;
  const lc = $('leftCol'), mobile = innerWidth <= 900, ratio = COLS / ROWS;
  const w = lc.clientWidth, h = mobile ? innerHeight * 0.5 : lc.clientHeight;
  if (!w || !h) return;
  const bw = Math.floor(Math.min(w, h * ratio));
  $('board').style.width = bw + 'px'; $('board').style.height = Math.floor(bw / ratio) + 'px';
}
addEventListener('resize', fitBoard);

// ---------------- FULL SCREEN ----------------
function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function toggleFull() {
  const el = document.documentElement;
  try {
    if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (el.requestFullscreen) { el.requestFullscreen({ navigationUI: 'hide' }).catch(() => fsFail()); setTimeout(() => { if (!isFull()) fsFail(); }, 900); }
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else fsFail();
  } catch (e) { fsFail(); }
}
function fsFail() { if ($('popup').style.display === 'flex') return; popup('This browser blocked full screen.\nOpen the game in Chrome, Edge or Firefox and press F (or F11).\nOn iPhone/iPad: tap Share → "Add to Home Screen", then open the game from your home screen for full screen.'); }
function fsLabel() { document.querySelectorAll('.fsBtn').forEach(b => b.textContent = isFull() ? '🗗 Exit full screen' : '⛶ Full screen'); setTimeout(fitBoard, 120); }
document.querySelectorAll('.fsBtn').forEach(b => b.onclick = toggleFull);
document.addEventListener('fullscreenchange', fsLabel);
document.addEventListener('webkitfullscreenchange', fsLabel);
document.addEventListener('keydown', e => { if ((e.key === 'f' || e.key === 'F') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) toggleFull(); });
let infoTimer = null;
$('cv').addEventListener('mouseleave', () => { $('infoBox').innerHTML = ''; renderer.ui.hover = null; });
function showInfo(e) {
  clearTimeout(infoTimer); infoTimer = setTimeout(() => { $('infoBox').innerHTML = ''; }, 5000);
  if (e.role) { const N = VILLAGE_NPCS[e.idx]; $('infoBox').innerHTML = `<b style="font-size:15px">${N.icon} ${esc(N.name)}</b> — ${N.sign}<br><span class="muted">Click to walk over and talk.</span>`; return; }
  if (e.kind === 'dragon') {
    const T = TRIBES[e.tribe];
    $('infoBox').innerHTML = `<b style="font-size:15px">🐉 ${e.name}</b> — ${T.el} type · HP ${e.hp}/${e.maxHp} · Armor ${e.ac}<br>
      <b>${T.a1.name}</b>: 3d6+2 (5–20)${T.a1.status ? ', may ' + STATUS[T.a1.status].name.toLowerCase() : ''} · range ${T.a1.range}<br>
      <b>${T.a2.name}</b>: 2d6−2 (0–10) + ${STATUS[T.a2.status].icon} ${STATUS[T.a2.status].name} for 2–5 turns · range ${T.a2.range}${T.a2.aoe ? ' (area)' : ''}<br>
      <span class="muted">Style: ${T.desc}</span>`;
  } else if (e.kind) {
    const P = PEOPLE[e.ptype], d = A => `${A.dice[0]}d${A.dice[1]}${A.dice[2] ? '+' + A.dice[2] : ''}`;
    $('infoBox').innerHTML = `<b style="font-size:15px">${e.kind === 'bully' ? '😈' : '🧑‍🎓'} ${esc(e.name)} the ${P.title}</b> — Lv ${e.lvl} · HP ${e.hp}/${e.maxHp} · Armor ${e.ac}${e.kind === 'student' ? (e.hostile ? ' · 😠 ANGRY' : ' · 🙂 friendly') : ''}<br>
      <b>${P.a1.name}</b>: ${d(P.a1)} · range ${P.a1.range}<br><b>⚡ Power — ${P.a2.name}</b>: ${d(P.a2)}${P.a2.status ? ' + ' + STATUS[P.a2.status].icon + ' ' + STATUS[P.a2.status].name : ''} · range ${P.a2.range}${P.a2.aoe ? ' (area)' : ''}<br>
      <span class="muted">${P.desc}${e.kind === 'student' && !e.hostile ? ' · Walk next to them and click to get a test hint!' : ''}</span>`;
  } else {
    const C = CLASSES[e.cls];
    $('infoBox').innerHTML = `<b style="font-size:15px">${C.icon} ${esc(e.name)}</b> — Lv ${e.lvl} ${C.name} · HP ${e.hp}/${e.maxHp} · MP ${e.mp}/${e.maxMp}<br>
      🗡️ ${itemOf(e.equip.weapon)?.name || '—'} · 🛡️ ${itemOf(e.equip.armor)?.name || '—'} · ✋ ${itemOf(e.equip.offhand)?.name || '—'}${e.pet ? ` · 🐲 ${esc(e.pet.name)} Lv${e.pet.lvl}` : ''}<br>Effects: ${statusList(e)}`;
  }
}

// ---------------- DICE TRAY ----------------
let diceTimer = null, pendingRoll = null;
function diceText(sp, p) {
  if (!sp.dice) return '';
  const bonus = p ? dmgBonus(p, sp.stat) : 0;
  if (sp.word) return `🎲 ${sp.dice[0]}d${sp.dice[1]} ${sp.word}`;
  return `${sp.auto ? '' : '🎲 d20 to hit, then '}${sp.dice[0]}d${sp.dice[1]}${sp.flat ? '+' + sp.flat : ''}${bonus ? ' +' + bonus : ''} damage${sp.hits ? ' ×' + sp.hits + ' hits' : ''}`;
}
function askRoll(action, title, sp, p) {
  pendingRoll = action; clearTimeout(diceTimer);
  const d = $('dice'); d.style.display = 'block';
  d.innerHTML = `<b>${esc(title)}</b><div class="muted">${diceText(sp, p || myTurn())}</div>
    <div style="margin-top:8px"><button class="gold big" id="rollBtn" style="min-width:160px">🎲 ROLL!</button> <button id="rollCancel">Cancel</button></div>`;
  $('rollBtn').onclick = () => { const a = pendingRoll; pendingRoll = null; ui.mode = null; hint(''); refreshHighlights();
    d.innerHTML = `<div class="dies"><div class="die d20 rolling">?</div><div class="die rolling">?</div></div>`;
    diceTimer = setTimeout(() => { d.style.display = 'none'; }, 4000);
    sendAction(a); renderSide(); };
  $('rollCancel').onclick = () => { pendingRoll = null; d.style.display = 'none'; };
}
renderer.onDice = ev => {
  if (pendingRoll) return; // don't cover the player's own roll prompt
  clearTimeout(diceTimer);
  const d = $('dice'); d.style.display = 'block';
  const cls = r => `die ${r.s === 20 ? 'd20' : ''} ${ev.enemy ? 'enemy' : ''}`;
  d.innerHTML = `<b>${ev.enemy ? '⚔️' : '🧍'} ${esc(ev.who)} — ${esc(ev.label)}</b>
    <div class="dies">${ev.rolls.map(r => `<div class="${cls(r)} rolling">?<small>d${r.s}</small></div>`).join('') || '<span class="muted">no dice</span>'}</div><div id="diceRes" class="muted">rolling…</div>`;
  const els = d.querySelectorAll('.die');
  let n = 0;
  const spin = setInterval(() => { els.forEach((el, i) => el.firstChild.textContent = 1 + Math.floor(Math.random() * ev.rolls[i].s)); if (++n > 8) { clearInterval(spin); done(); } }, 65);
  function done() {
    els.forEach((el, i) => { const r = ev.rolls[i]; el.classList.remove('rolling'); el.firstChild.textContent = r.v; if (r.s === 20 && (r.crit || r.v === 20)) el.classList.add('crit'); if (r.s === 20 && r.v === 1) el.classList.add('nat1'); });
    const res = $('diceRes'); if (res) { res.textContent = ev.result; res.className = ''; }
    diceTimer = setTimeout(() => { if (!pendingRoll) d.style.display = 'none'; }, 2600);
  }
};

if (!location.protocol.startsWith('http')) $('btnOnline').title = 'Run start-server.bat on one computer to play online.';
startPick(true); // the very first screen: choose your class
