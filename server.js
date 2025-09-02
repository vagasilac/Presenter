// server.js — Single-port static server + WebSocket relay + robust QR endpoints
// Usage: node server.js 8080
// Needs: npm i ws qrcode

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { URL } = require('url');
const WebSocket = require('ws');
const QRCode = require('qrcode'); // ✅ standards-compliant QR

const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(PUBLIC_DIR, 'presentations');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const POLL_DIR = path.join(PUBLIC_DIR, 'polls');
if (!fs.existsSync(POLL_DIR)) fs.mkdirSync(POLL_DIR, { recursive: true });

const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml',
  '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host}`);

    // ---- Short URL: /j/<ROOM>  or  /j?room=ROOM  → /?room=ROOM&role=client
    if (u.pathname === '/j' || u.pathname.startsWith('/j/')) {
      const room = u.pathname.startsWith('/j/') ? decodeURIComponent(u.pathname.slice(3))
                                               : (u.searchParams.get('room') || 'default');
      const to = '/?room=' + encodeURIComponent(room) + '&role=client';
      res.statusCode = 302;
      res.setHeader('Location', to);
      res.end('Redirecting to ' + to);
      return;
    }

    // ---- Image endpoint (SVG): /qr.svg?text=...&size=420&ec=M&border=4
    if (u.pathname === '/qr.svg') {
      const text   = u.searchParams.get('text') || `http://${req.headers.host}/`;
      const size   = Math.max(240, Math.min(1024, parseInt(u.searchParams.get('size')||'420',10) || 420));
      const ec     = (u.searchParams.get('ec') || 'M').toUpperCase();     // L, M, Q, H
      const border = Math.max(2, Math.min(16, parseInt(u.searchParams.get('border')||'4',10) || 4)); // quiet zone (modules)

      // qrcode renders proper format/timing/alignment patterns etc. ✔
      const svg = await QRCode.toString(text, {
        type: 'svg',
        errorCorrectionLevel: ec,
        margin: border,   // modules of white border
        width: size       // target pixel width
      });

      res.writeHead(200, {'content-type':'image/svg+xml; charset=utf-8', 'cache-control':'no-store'});
      res.end(svg);
      return;
    }

    // ---- Optional PNG endpoint: /qr.png?text=... (in case you ever want PNG)
    if (u.pathname === '/qr.png') {
      const text   = u.searchParams.get('text') || `http://${req.headers.host}/`;
      const size   = Math.max(240, Math.min(1024, parseInt(u.searchParams.get('size')||'420',10) || 420));
      const ec     = (u.searchParams.get('ec') || 'M').toUpperCase();
      const border = Math.max(2, Math.min(16, parseInt(u.searchParams.get('border')||'4',10) || 4));

      const buf = await QRCode.toBuffer(text, {
        type: 'png',
        errorCorrectionLevel: ec,
        margin: border,
        width: size
      });

      res.writeHead(200, {'content-type':'image/png', 'cache-control':'no-store'});
      res.end(buf);
      return;
    }

    // ---- Simple test page (kept): /qr?text=...
    if (u.pathname === '/qr') {
      const text   = u.searchParams.get('text') || `http://${req.headers.host}/`;
      const size   = Math.max(240, Math.min(1024, parseInt(u.searchParams.get('size')||'420',10) || 420));
      const ec     = (u.searchParams.get('ec') || 'M').toUpperCase();
      const border = Math.max(2, Math.min(16, parseInt(u.searchParams.get('border')||'4',10) || 4));
      const page = `<!doctype html><meta charset="utf-8"/><title>QR</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#0b0f14;color:#e6eef6;font-family:system-ui}
.wrap{background:#0f1520;border:1px solid #1b2635;border-radius:16px;padding:16px;box-shadow:0 10px 24px rgba(0,0,0,.35)}
.mono{font:12px ui-monospace,Menlo,Consolas,monospace;color:#9fb3c6;word-break:break-all;max-width:70ch;text-align:center}</style>
<div class="wrap">
  <img alt="QR" src="/qr.svg?text=${encodeURIComponent(text)}&size=${size}&ec=${ec}&border=${border}">
  <div class="mono">${text.replace(/</g,'&lt;')}</div>
</div>`;
      res.writeHead(200, {'content-type':'text/html; charset=utf-8'}); res.end(page); return;
    }

    // ---- Presentation storage API ----
    if (u.pathname === '/api/presentations' && req.method === 'GET') {
      try {
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(files));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'failed' }));
      }
      return;
    }

    if (u.pathname.startsWith('/api/presentations/')) {
      const name = path.basename(u.pathname.replace('/api/presentations/', '')).replace(/[^a-z0-9_\-]/ig, '');
      const file = path.join(DATA_DIR, name + '.json');
      if (req.method === 'GET') {
        fs.readFile(file, 'utf8', (err, data) => {
          if (err) {
            res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'not found' }));
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(data);
        });
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            JSON.parse(body);
            fs.writeFile(file, body, 'utf8', err => {
              if (err) {
                res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'write failed' }));
                return;
              }
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: true }));
            });
          } catch (_) {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'bad json' }));
          }
        });
        return;
      }
    }

    // ---- Poll storage API ----
    if (u.pathname === '/api/polls' && req.method === 'GET') {
      try {
        const files = fs.readdirSync(POLL_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(files));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'failed' }));
      }
      return;
    }

    if (u.pathname.startsWith('/api/polls/')) {
      const name = path.basename(u.pathname.replace('/api/polls/', '')).replace(/[^a-z0-9_\-]/ig, '');
      const file = path.join(POLL_DIR, name + '.json');
      if (req.method === 'GET') {
        fs.readFile(file, 'utf8', (err, data) => {
          if (err) {
            res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'not found' }));
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(data);
        });
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            JSON.parse(body);
            fs.writeFile(file, body, 'utf8', err => {
              if (err) {
                res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'write failed' }));
                return;
              }
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: true }));
            });
          } catch (_) {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'bad json' }));
          }
        });
        return;
      }
      if (req.method === 'DELETE') {
        fs.unlink(file, err => {
          if (err) {
            res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'delete failed' }));
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true }));
        });
        return;
      }
    }

    // ---- Static files
    let filePath = u.pathname === '/' ? '/index.html' : u.pathname;
    filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
    const abs = path.join(PUBLIC_DIR, filePath);
    fs.readFile(abs, (err, data) => {
      if (err) {
        res.writeHead(err.code === 'ENOENT' ? 404 : 500, {'content-type':'text/plain; charset=utf-8'});
        res.end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
        return;
      }
      const ext = path.extname(abs).toLowerCase();
      res.writeHead(200, {'content-type': MIME[ext] || 'application/octet-stream'});
      res.end(data);
    });

  } catch (e) {
    res.writeHead(500, {'content-type':'text/plain; charset=utf-8'});
    res.end('Bad request');
  }
});

// ======= WebSocket: rooms, scores, avatars (unchanged from your working version) =======
const rooms = new Map(), scores = new Map(), avatars = new Map();
function roomPeers(r){ if(!rooms.has(r)) rooms.set(r,new Set()); return rooms.get(r); }
function roomScores(r){ if(!scores.has(r)) scores.set(r,{}); return scores.get(r); }
function roomAvatars(r){ if(!avatars.has(r)) avatars.set(r,new Map()); return avatars.get(r); }
function broadcast(r,msg,except=null){ const s=JSON.stringify(msg); for(const c of roomPeers(r)){ if(c.readyState===WebSocket.OPEN && c!==except){ try{c.send(s)}catch{}} } }
function rosterList(r){ return Array.from(roomAvatars(r).keys()); }

const wss = new WebSocket.Server({ noServer: true });
wss.on('connection',(ws)=>{
  ws.id = Math.random().toString(36).slice(2,10);
  ws.isAlive = true;
  ws.on('pong',()=>ws.isAlive=true);
  ws.on('message',(raw)=>{
    let msg={}; try{ msg=JSON.parse(raw) }catch{ return; }
    const room=(msg.room||'default')+'';
    if(!ws.room){ ws.room=room; roomPeers(room).add(ws);
      ws.send(JSON.stringify({t:'roster',room,avatars:rosterList(room)}));
      ws.send(JSON.stringify({t:'scores',room,scores:roomScores(room)}));
    }
    switch(msg.t){
      case 'hello': break;
      case 'announce': {
        const avMap=roomAvatars(room);
        const wanted=(msg.avatar||'🙂')+''; const clientId=(msg.id||ws.id)+'';
        if(avMap.has(wanted) && avMap.get(wanted)!==clientId){ ws.send(JSON.stringify({t:'avatar_conflict',room})); break; }
        avMap.set(wanted, clientId); ws.clientId=clientId; ws.avatar=wanted;
        const s=roomScores(room); if(!s[clientId]) s[clientId]={name:msg.name||'Guest',points:0,avatar:wanted}; else s[clientId].avatar=wanted;
        broadcast(room,{t:'announce',room,id:clientId,name:s[clientId].name,avatar:wanted});
        broadcast(room,{t:'scores',room,scores:s});
        broadcast(room,{t:'roster',room,avatars:rosterList(room)});
        break;
      }
      case 'poll': case 'answer': case 'tick':
      case 'react': case 'react_update':
      case 'qa_new': case 'qa_vote': case 'qa_update':
        broadcast(room,msg); break;
      case 'scores':
        scores.set(room, msg.scores||roomScores(room));
        broadcast(room,{t:'scores',room,scores:roomScores(room)}); break;
      case 'reset':
        scores.set(room, {}); broadcast(room,{t:'reset',room}); broadcast(room,{t:'scores',room,scores:{}}); break;
    }
  });
  ws.on('close',()=>{
    const room=ws.room; if(!room) return;
    roomPeers(room).delete(ws);
    if(ws.avatar){ const avMap=roomAvatars(room); if(avMap.get(ws.avatar)===ws.clientId) avMap.delete(ws.avatar); broadcast(room,{t:'roster',room,avatars:rosterList(room)}); }
  });
});
server.on('upgrade',(req,socket,head)=>{ wss.handleUpgrade(req,socket,head,(ws)=>wss.emit('connection',ws,req)); });
setInterval(()=>{ wss.clients.forEach(ws=>{ if(!ws.isAlive) return ws.terminate(); ws.isAlive=false; try{ws.ping()}catch{} }); }, 30000);

server.listen(PORT, ()=>{
  const ifaces = getIPs().map(ip => `http://${ip}:${PORT}`);
  console.log('Serving static + WS on:'); ifaces.forEach(u=>console.log('  ', u));
  console.log('Open the FIRST URL on your laptop, then scan the QR on the Session tab.');
});
function getIPs(){
  const os=require('os'); const ips=[]; const nics=os.networkInterfaces();
  Object.values(nics).forEach(list=>{ (list||[]).forEach(i=>{ if(i.family==='IPv4' && !i.internal) ips.push(i.address); }); });
  if(!ips.length) ips.push('127.0.0.1'); return ips;
}
