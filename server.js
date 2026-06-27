// PEPE vs TRUMPE — lobby relay server
// Pairs two players by a 4-letter code and relays messages between them.
// It does NOT run the game; the HOST's browser simulates the match and the
// GUEST streams inputs / renders snapshots. Deploy on Render/Railway/Fly
// (anything that keeps a process running — NOT Vercel serverless).

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const rooms = new Map();                 // code -> { host, guest }

function makeCode(){
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no easily-confused chars
  let c = ''; for (let i=0;i<4;i++) c += A[Math.floor(Math.random()*A.length)];
  return c;
}
function send(ws, obj){ if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

// plain HTTP so platforms see a healthy service
const server = http.createServer((req,res)=>{ res.writeHead(200,{'Content-Type':'text/plain'}); res.end('lobby ok'); });
const wss = new WebSocketServer({ server });

wss.on('connection', (ws)=>{
  ws.room = null; ws.role = null; ws.alive = true;
  ws.on('pong', ()=>{ ws.alive = true; });

  ws.on('message', (raw)=>{
    let m; try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'create') {
      let c = makeCode(); while (rooms.has(c)) c = makeCode();
      rooms.set(c, { host: ws, guest: null });
      ws.room = c; ws.role = 'host';
      send(ws, { t:'created', code:c });

    } else if (m.t === 'join') {
      const c = String(m.code||'').toUpperCase().trim();
      const r = rooms.get(c);
      if (!r)            return send(ws, { t:'error', msg:'No lobby with that code.' });
      if (r.guest)       return send(ws, { t:'error', msg:'That lobby is full.' });
      r.guest = ws; ws.room = c; ws.role = 'guest';
      send(ws,    { t:'joined', code:c });
      send(r.host,{ t:'peer-joined' });     // host: your friend arrived
      send(ws,    { t:'peer-here'   });     // guest: you are in

    } else if (m.t === 'relay') {
      const r = rooms.get(ws.room); if (!r) return;
      const other = ws.role === 'host' ? r.guest : r.host;
      send(other, { t:'relay', d:m.d });    // forward game payload to the peer

    } else if (m.t === 'leave') {
      cleanup(ws);
    }
  });

  ws.on('close', ()=> cleanup(ws));
});

function cleanup(ws){
  const r = ws.room && rooms.get(ws.room);
  if (r){
    const other = ws.role === 'host' ? r.guest : r.host;
    send(other, { t:'peer-left' });
    rooms.delete(ws.room);
  }
  ws.room = null;
}

// drop dead connections every 30s
setInterval(()=>{
  wss.clients.forEach(ws=>{ if (!ws.alive) return ws.terminate(); ws.alive=false; ws.ping(); });
}, 30000);

server.listen(PORT, ()=> console.log('Lobby relay listening on', PORT));
