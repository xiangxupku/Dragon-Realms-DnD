// Dragon Realms D&D — multiplayer server (no dependencies, just Node.js)
// Run:  node server.js     then open http://localhost:8080  (other devices: http://<your-ip>:8080)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const PORT = process.env.PORT || 8080;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const f = path.normalize(path.join(PUB, u));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(d);
  });
});

// ---------- tiny WebSocket implementation ----------
const rooms = new Map(); // code -> { code, clients:[], host, state }
let nextCid = 1;

server.on('upgrade', (req, sock) => {
  if ((req.headers['upgrade'] || '').toLowerCase() !== 'websocket') { sock.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  sock.setNoDelay(true);
  const c = { id: 'c' + (nextCid++), sock, buf: Buffer.alloc(0), room: null, frag: [], closed: false };
  sock.on('data', d => { c.buf = Buffer.concat([c.buf, d]); parse(c); });
  sock.on('close', () => leave(c));
  sock.on('error', () => leave(c));
});

function frame(data, op = 1) {
  const len = data.length; let h;
  if (len < 126) { h = Buffer.alloc(2); h[1] = len; }
  else if (len < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.alloc(10); h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
  h[0] = 0x80 | op;
  return Buffer.concat([h, data]);
}
function parse(c) {
  while (true) {
    const b = c.buf;
    if (b.length < 2) return;
    const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    const mOff = off; if (masked) off += 4;
    if (b.length < off + len) return;
    const payload = Buffer.from(b.subarray(off, off + len));
    if (masked) for (let i = 0; i < len; i++) payload[i] ^= b[mOff + (i & 3)];
    c.buf = b.subarray(off + len);
    if (op === 8) { try { c.sock.end(frame(Buffer.alloc(0), 8)); } catch (e) {} leave(c); return; }
    if (op === 9) { try { c.sock.write(frame(payload, 10)); } catch (e) {} continue; }
    if (op === 10) continue;
    c.frag.push(payload);
    if (fin) {
      const msg = Buffer.concat(c.frag).toString('utf8'); c.frag = [];
      try { onMsg(c, JSON.parse(msg)); } catch (e) { console.log('bad message', e.message); }
    }
  }
}
function send(c, obj) { if (c.closed) return; try { c.sock.write(frame(Buffer.from(JSON.stringify(obj)))); } catch (e) {} }

// ---------- rooms / relay ----------
function code() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let s; do { s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; } while (rooms.has(s)); return s; }

function onMsg(c, m) {
  const room = c.room;
  switch (m.t) {
    case 'create': {
      const r = { code: code(), clients: [c], host: c, state: null };
      rooms.set(r.code, r); c.room = r;
      send(c, { t: 'welcome', cid: c.id, host: true, room: r.code });
      console.log(`Room ${r.code} created by ${c.id}`);
      break;
    }
    case 'join': {
      const r = rooms.get(String(m.room || '').toUpperCase());
      if (!r) { send(c, { t: 'error', msg: 'Room not found. Check the code!' }); return; }
      if (r.clients.length >= 6) { send(c, { t: 'error', msg: 'Room is full (6 players max).' }); return; }
      r.clients.push(c); c.room = r;
      send(c, { t: 'welcome', cid: c.id, host: false, room: r.code });
      send(r.host, { t: 'peerJoin', cid: c.id, char: m.char });
      if (r.state) send(c, { t: 'state', state: r.state });
      console.log(`${c.id} joined room ${r.code}`);
      break;
    }
    case 'act':
      if (room && room.host !== c) send(room.host, { t: 'act', from: c.id, action: m.action });
      break;
    case 'state':
      if (room && room.host === c) { room.state = m.state; for (const o of room.clients) if (o !== c) send(o, { t: 'state', state: m.state }); }
      break;
    case 'chat':
      if (room) for (const o of room.clients) send(o, { t: 'chat', name: String(m.name || '?').slice(0, 20), text: String(m.text || '').slice(0, 200) });
      break;
  }
}

function leave(c) {
  if (c.closed) return; c.closed = true;
  const r = c.room; if (!r) return;
  r.clients = r.clients.filter(x => x !== c);
  if (!r.clients.length) { rooms.delete(r.code); console.log(`Room ${r.code} closed`); return; }
  if (r.host === c) {
    r.host = r.clients[0];
    send(r.host, { t: 'promote', state: r.state });
    console.log(`Host left ${r.code}; ${r.host.id} is now host`);
  }
  send(r.host, { t: 'peerLeave', cid: c.id });
}

server.listen(PORT, () => {
  console.log('\n🐉  Dragon Realms D&D server is running!\n');
  console.log(`   This computer:   http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`   Other devices:   http://${a.address}:${PORT}`);
  console.log('\n   (Devices must be on the same Wi-Fi. Press Ctrl+C to stop.)\n');
});
