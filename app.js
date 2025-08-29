/* Lean Training — Presenter app (v7.5)
   Fixes:
   - Buttons clickable (whiteboard no-pointer until ON)
   - Always-on Mini-QR renders via server /qr and is resizable
     from bottom-left using a custom handle
   - Tabs re-bound robustly
*/

// ---------- Tiny helpers ----------
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const toast = (m)=>{ const el=$('#toast'); if(!el) return; el.textContent=m; el.style.display='block'; setTimeout(()=>el.style.display='none',2600) };
const uid = ()=>Math.random().toString(36).slice(2,8);

// ---------- Global-ish state ----------
let ROLE = 'host';
let ROOM = localStorage.getItem('room') || uid();
let WS = null;
let NAME = localStorage.getItem('name') || '';
let CLIENT_ID = localStorage.getItem('clientId') || uid();
let AVATAR = localStorage.getItem('avatar') || '';

// Reflect room in header badge
(function(){ const b = $('#roomId'); if(b) b.textContent = ROOM; })();

// ---------- URL params influence role/room ----------
(function(){
  const params = new URLSearchParams(location.search);
  if (params.get('room')) { ROOM = params.get('room'); localStorage.setItem('room', ROOM); const b=$('#roomId'); if(b) b.textContent=ROOM; }
  if (params.get('role') === 'client') {
    ROLE = 'client';
    // Switch to client view
    $('#slidesCard')?.classList.add('hidden');
    $('#clientCard')?.classList.remove('hidden');
    // Pre-fill WS URL to current host:port
    const host = location.hostname || 'localhost';
    const port = location.port || '8080';
    const ws = $('#wsUrl'); if (ws) ws.value = `ws://${host}:${port}`;
  }
})();

// ---------- Join URL + session helpers ----------
function computeJoinUrl(){
  const origin = (location.origin && location.origin !== 'null' && location.origin !== 'file://')
    ? location.origin
    : `http://${location.hostname || '127.0.0.1'}:${location.port || '8080'}`;
  const path = location.pathname || '/';
  return `${origin}${path}?room=${encodeURIComponent(ROOM)}&role=client`;
}
function syncSessionHints(){
  const joinUrl = computeJoinUrl();
  const t = $('#joinUrlText'); if (t) t.textContent = joinUrl;
  const ws = $('#wsUrl');
  try{ const u = new URL(joinUrl); if(ws && (!ws.value || !ws.value.startsWith('ws://'))) ws.value = `ws://${u.hostname}:${u.port || '8080'}`; }catch(_){ /* noop */ }
  const hw = $('#hostWarning'); if(hw && ['localhost','127.0.0.1',''].includes(location.hostname)) hw.classList.remove('hidden');
}

// ---------- Always-on Mini-QR (host only) ----------
(function(){
  const mini = $('#miniQR'); if(!mini) return;
  if (ROLE === 'client') { mini.style.display='none'; return; } // host-only QR

  // Disable native handle (bottom-right) — we implement our own bottom-left handle
  

  // Ensure <img> and a custom bottom-left handle element
  let img = mini.querySelector('img');
  if(!img){
    img = document.createElement('img');
    img.alt = 'Scan to join';
    img.draggable = false; // visual rules live in CSS
    mini.appendChild(img);
  }
  let handle = mini.querySelector('.mini-qr-handle');
  if(!handle){
    handle = document.createElement('div');
    handle.className = 'mini-qr-handle'; // styling in CSS
    mini.appendChild(handle);
  }

  function renderMiniQR(){
    const url = computeJoinUrl();
    const side = Math.max(96, Math.min(512, Math.round(Math.min(mini.clientWidth||110, mini.clientHeight||110))));
    const qs = `text=${encodeURIComponent(url)}&size=${side}&ec=Q&border=4&t=${Date.now()}`;
    img.src = `/qr.svg?${qs}`;
  }

  function persistSize(){
    const r = mini.getBoundingClientRect();
    localStorage.setItem('miniQR:size', JSON.stringify({ w:Math.round(r.width), h:Math.round(r.height) }));
  }
  function restoreSize(){
    try{
      const s = JSON.parse(localStorage.getItem('miniQR:size')||'null');
      if(s && s.w && s.h){ mini.style.width = s.w+'px'; mini.style.height = s.h+'px'; }
      else { mini.style.width='110px'; mini.style.height='110px'; }
    }catch(_){ mini.style.width='110px'; mini.style.height='110px'; }
  }

  // Custom BL resize behaviour — element is anchored top-right (via CSS)
  function blResizeStart(ev){ ev.preventDefault(); ev.stopPropagation();
    const startX = ev.clientX; const startY = ev.clientY;
    const rect0 = mini.getBoundingClientRect();
    const rightEdge = rect0.right; const topEdge = rect0.top;
    function onMove(e){
      const x = e.clientX; const y = e.clientY;
      let newW = Math.max(48, Math.min(window.innerWidth, rightEdge - x));
      let newH = Math.max(48, Math.min(window.innerHeight, y - topEdge));
      mini.style.width = newW + 'px';
      mini.style.height = newH + 'px';
      renderMiniQR();
    }
    function onUp(){ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); persistSize(); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once:true });
  }
  handle.addEventListener('pointerdown', blResizeStart);

  // Retry loader in case server boots after page load
  let tries = 0; const MAX_TRIES = 30;
  function ensureLoaded(){
    if(img.complete && img.naturalWidth>0){ return; }
    tries++; if(tries>MAX_TRIES) return;
    renderMiniQR();
    setTimeout(ensureLoaded, 1000);
  }
  let didFB=false;
  img.addEventListener('error', ()=>{
    if(!didFB){
      const side = Math.round(Math.min(mini.clientWidth||110, mini.clientHeight||110))*2;
      const data = qrFallbackDataURL(computeJoinUrl(), side);
      if(data){ img.src = data; didFB=true; return; }
    }
    setTimeout(ensureLoaded, 800);
  });
  img.addEventListener('load', ()=> { tries = MAX_TRIES+1; });


  // Keep QR crisp on size/orientation/layout changes
  if (typeof ResizeObserver !== 'undefined'){
    const ro = new ResizeObserver(()=>renderMiniQR()); ro.observe(mini);
  } else {
    window.addEventListener('resize', ()=>renderMiniQR());
  }
  window.addEventListener('orientationchange', ()=>renderMiniQR());

  restoreSize();
  renderMiniQR();
})();

// ---------- Tabs ----------
(function(){
  function showTab(tabEl){
    $$('.tab').forEach(x=>x.classList.remove('active'));
    $$('.slide').forEach(s=>s.classList.remove('active'));
    if (tabEl){ tabEl.classList.add('active'); const target=$('#'+tabEl.dataset.tab); if(target) target.classList.add('active'); }
  }
  // Delegate clicks so it's robust
  document.addEventListener('click', (ev)=>{
    const t = ev.target.closest('.tab');
    if(!t) return; ev.preventDefault(); showTab(t);
  });
  // Ensure Presentation is active on load by default
  const active = document.querySelector('.tab.active');
  if(!active){ const first = document.querySelector('.tab[data-tab="presentation"]') || document.querySelector('.tab'); if(first) showTab(first); }
})();

// ---------- Charts (sparklines) ----------
function spark(id, values){ const c=$(id); if(!c) return; const ctx=c.getContext('2d'); const w=c.width=Math.max(200,c.clientWidth||200); const h=c.height; const min=Math.min(...values), max=Math.max(...values); ctx.clearRect(0,0,w,h); ctx.lineWidth=2; ctx.strokeStyle='#58c4dc'; ctx.beginPath(); values.forEach((v,i)=>{const x=i/(values.length-1)*w; const y=h-(v-min)/(max-min+1e-6)*h; i?ctx.lineTo(x,y):ctx.moveTo(x,y)}); ctx.stroke(); }
function drawComparative(){ spark('#chartLead',[18,16,17,15,14,13,9,8]); spark('#chartCost',[10,9,9,8,7,6,5,4]); spark('#chartFlex',[2,3,3,4,5,6,8,9]); }
window.addEventListener('resize', drawComparative);
setTimeout(drawComparative, 60);

// ---------- Mass line animation ----------
(function(){
  function runAnim(){ const g=document.querySelector('#massViz #cars'); if(!g) return; g.innerHTML=''; for(let i=0;i<8;i++){ const x=30+i*28; const car=document.createElementNS('http://www.w3.org/2000/svg','rect'); car.setAttribute('x',x);car.setAttribute('y',58);car.setAttribute('width',22);car.setAttribute('height',22);car.setAttribute('rx',4); car.setAttribute('fill','#58c4dc'); g.appendChild(car);} let t=0; const id=setInterval(()=>{ t+=1; const rects=[...g.children]; rects.forEach((r,idx)=>{const x=30+((t+idx*6)%260); r.setAttribute('x',x)}); if(t>1200) clearInterval(id); },30); toast('Animation: Flow vs Push in action'); }
  document.addEventListener('click',(e)=>{ const b=e.target.closest('#animateBtn'); if(b){ e.preventDefault(); runAnim(); }});
})();

// ---------- WebSocket realtime ----------
const rtState={scores:{}, currentPoll:null, answers:{}, timer:null, timeLeft:0, reactions:{}, qa:{}, pollFinished:false};

function renderParticipants(){
  const list=$('#participantList');
  const count=$('#participantCount');
  if(!list||!count) return;
  const entries=Object.values(rtState.scores);
  count.textContent=String(entries.length);
  if(!entries.length){ list.textContent='No participants yet.'; return; }
  list.innerHTML=entries.map(e=>`<div class="chip">${e.avatar||'🙂'} ${e.name||'Guest'}</div>`).join(' ');
}

function send(obj){ if(!WS||WS.readyState!==1) return; WS.send(JSON.stringify(obj)); }
function handle(msg){
  if(!msg || (msg.room && msg.room!==ROOM)) return;
  if(/^qa_/.test(msg.t)) return handleQA(msg);
  switch(msg.t){
    case 'hello': break;
    case 'announce': addClient(msg.id,msg.name,msg.avatar); break;
    case 'poll': rtState.currentPoll=msg.poll; rtState.answers={}; renderClientPoll(); renderResults(); startTimer(msg.poll); break;
    case 'answer': rtState.answers[msg.id]=msg.answer; renderResults(); break;
    case 'scores': rtState.scores=msg.scores||rtState.scores; renderLeader(); renderParticipants(); break;
    case 'reset': rtState.scores={}; renderLeader(); renderParticipants(); break;
    case 'react': rtState.reactions[msg.emoji]=(rtState.reactions[msg.emoji]||0)+1; renderReactions(); showReactionBubble(msg.emoji); send({t:'react_update', room:ROOM, reactions:rtState.reactions}); break;
    case 'react_update': rtState.reactions = msg.reactions || rtState.reactions; renderReactions(); break;
    case 'roster': setRoster(msg.avatars || []); break;
    case 'avatar_conflict': toast('Avatar already taken — please pick another one.'); localStorage.removeItem('joined'); showJoinUI(); break;
  }
}

function addClient(id,name,avatar){ if(!rtState.scores[id]) rtState.scores[id]={name,points:0,avatar:avatar||'🙂'}; renderParticipants(); }

renderParticipants();

function connectWS(){ const url=$('#wsUrl')?.value?.trim(); if(!url) return toast('Enter WebSocket URL');
  $('#connState').textContent='connecting…';
  try{ WS=new WebSocket(url);}catch(e){ $('#connState').textContent='disconnected'; return toast('Invalid WS URL') }
  WS.onopen=()=>{ $('#connState').textContent='connected'; send({t:'hello',room:ROOM,role:ROLE,name:NAME});
    if(ROLE==='client' && (localStorage.getItem('joined')==='1')){
      AVATAR = localStorage.getItem('avatar') || '🙂';
      NAME = localStorage.getItem('name') || genCodeName(AVATAR);
      CLIENT_ID = localStorage.getItem('clientId') || CLIENT_ID;
      send({t:'announce',room:ROOM,id:CLIENT_ID,name:NAME,avatar:AVATAR});
      hideJoinUI();
    }
  };
  WS.onclose=()=>{$('#connState').textContent='disconnected'};
  WS.onerror=()=>{$('#connState').textContent='error'; toast('WebSocket connect failed. Is the server running?');};
  WS.onmessage=(ev)=>{ let msg={}; try{ msg=JSON.parse(ev.data) }catch(e){ return } handle(msg) };
}

// Bind Connect button robustly
(function(){ document.addEventListener('click',(e)=>{ const b=e.target.closest('#connectBtn'); if(!b) return; e.preventDefault(); connectWS(); }); })();

// ---------- Polls (host) ----------
(function(){ const t=$('#pollType'); if(!t) return; // host UI exists only on presenter
  const choicesWrap=$('#choicesWrap');
  const multiWrap=$('#multiWrap');
  const savedAcc=$('#savedAcc'), createAcc=$('#createAcc');
  if(savedAcc && createAcc){
    savedAcc.addEventListener('toggle',()=>{ if(savedAcc.open) createAcc.open=false; });
    createAcc.addEventListener('toggle',()=>{ if(createAcc.open) savedAcc.open=false; });
  }
  function syncPollType(){ const v=t.value; if(choicesWrap) choicesWrap.style.display=(v==='mc')?'block':'none'; if(multiWrap) multiWrap.style.display=(v==='mc')?'inline-flex':'none'; }
  t.addEventListener('change',syncPollType); syncPollType();
  function buildPoll(){
    const type=$('#pollType').value; const q=$('#pollQ').value.trim(); if(!q){ toast('Enter a question'); return null; }
    let choices=null; if(type==='mc'){ choices=[...$$('#choicesWrap .choice')].map(i=>i.value).filter(Boolean); if(choices.length<2){ toast('Need 2+ choices'); return null; } }
    const timed=$('#timed').checked? Number($('#secs').value||20):0;
    const correct=$('#correctEnable').checked? $('#correctKey').value.trim():null;
    return { id:uid(), type, q, choices, timed, correct, multi: $('#multiMC').checked, allowChange: $('#allowChange').checked, maxWords: Number($('#wcLimit').value||3), maxChars: Number($('#openChars').value||120), score: $('#scoreEnable').checked };
  }
  function startSaved(poll){
    rtState.currentPoll=poll; rtState.answers={}; startTimer(poll); renderResults(); send({t:'poll',room:ROOM,poll});
  }
  const sendBtn = $('#sendPoll');
  if(sendBtn) sendBtn.addEventListener('click',()=>{ const poll=buildPoll(); if(!poll) return; startSaved(poll); });
  const saveBtn = $('#savePoll');
  if(saveBtn) saveBtn.addEventListener('click',()=>{ const poll=buildPoll(); if(!poll) return; SavedPolls.savePoll(poll); SavedPolls.renderSavedPolls($('#savedList'), startSaved); toast('Poll saved'); });
  SavedPolls.renderSavedPolls($('#savedList'), startSaved);
})();

function startTimer(poll){
  clearInterval(rtState.timer);
  rtState.timeLeft = poll.timed || 0;
  rtState.pollFinished = false;
  updateTimerBar();
  if(!poll.timed) return;
  rtState.timer = setInterval(()=>{
    rtState.timeLeft--;
    updateTimerBar();
    send({t:'tick', room:ROOM, left:rtState.timeLeft});
    if(rtState.timeLeft<=0){
      clearInterval(rtState.timer);
      finalizePoll();
    }
  },1000);
}
function updateTimerBar(){ const total=(rtState.currentPoll&&rtState.currentPoll.timed)||0; const pct=total? Math.max(0,(rtState.timeLeft/total)*100):0; const el=$('#timerBar'); if(el) el.style.width=pct+'%'; }

function renderResults(){ const area=$('#resultsArea'); const poll=rtState.currentPoll; if(!area) return; if(!poll){ area.textContent='No active poll'; return }
  const answers=rtState.answers; let html=`<div><div class="muted">${poll.q}</div>`;
  function countMatch(v){ return Object.values(answers).filter(x=>x===v || (Array.isArray(x)&&x.includes(v))).length }
  if(poll.type==='mc'){ (poll.choices||[]).forEach((c,idx)=>{ const key=String.fromCharCode(65+idx); const n=countMatch(key); html+=bar(`${key}. ${c}`,n) }); }
  else if(poll.type==='tf'){ ['True','False'].forEach(k=>{ const n=countMatch(k); html+=bar(k,n) }); }
  else if(poll.type==='scale'){ for(let i=1;i<=5;i++){ const n=Object.values(answers).filter(v=>String(v)===String(i)).length; html+=bar(String(i),n) } }
  else if(poll.type==='wordcloud'){
    const freq={}; Object.values(answers).forEach(v=>{ (Array.isArray(v)?v:[v]).forEach(w=>{ const k=String(w||'').trim().toLowerCase(); if(k) freq[k]=(freq[k]||0)+1; })});
    const entries = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,40);
    const max = entries[0]?.[1]||1;
    html += '<div class="mt8" style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">';
    entries.forEach(([w,n])=>{ const sz = 12 + Math.round(24*(n/max)); html+=`<span style="font-size:${sz}px" class="chip">${w} (${n})</span>`; });
    html += '</div>';
  }
  else if(poll.type==='open'){
    const items = Object.values(answers).map(v=>String(v)).filter(Boolean);
    html += '<div class="mt8">'+ (items.length? items.map(t=>`<div class="chip" style="margin:4px 4px 0 0">${t}</div>`).join('') : 'No responses yet.') + '</div>';
  }
  else if(poll.type==='rank'){
    const freq={}; Object.values(answers).forEach(v=>{ const num=Number(v); if(!isNaN(num)) freq[num]=(freq[num]||0)+1; });
    const entries=Object.entries(freq).sort((a,b)=>Number(a[0])-Number(b[0]));
    entries.forEach(([num,n])=>{ html+=bar(String(num),n); });
    if(poll.correct!=null && rtState.pollFinished) html+=`<div class="mt8 mini">Correct: ${poll.correct}</div>`;
  }
  else { html += '<div class="mini muted">Type not supported yet on host results.</div>'; }
  html+='</div>'; area.innerHTML=html;
  function bar(label,n){ return `<div class="mt8"><div class="row"><div class="chip">${label}</div><div class="right mini muted">${n}</div></div><div class="progress"><div style="width:${Math.min(100,n*14)}%"></div></div></div>` }
}

function renderLeader(){ const t=$('#leaderTable'); if(!t) return; const rows=Object.entries(rtState.scores).sort((a,b)=>b[1].points-a[1].points); let html='<tr><td>#</td><td>Name</td><td>Points</td></tr>'; rows.forEach(([id,info],i)=>{ const av=(info&&info.avatar)||'🙂'; html+=`<tr><td>${i+1}</td><td>${av} ${(info&&info.name)||id}</td><td>${(info&&info.points)|0}</td></tr>`; }); t.innerHTML=html }

function finalizePoll(){
  const poll = rtState.currentPoll;
  if(!poll) return;
  rtState.pollFinished = true;
  if(!poll.score){
    toast('Poll finished.');
    return;
  }
  let correctKey=null;
  if(poll.correct!=null) correctKey=poll.correct;
  const base=100;

  if(poll.type==='rank' && correctKey!=null){
    // Determine smallest difference from correct answer
    let minDiff = Infinity;
    for(const ans of Object.values(rtState.answers)){
      const d = Math.abs(Number(ans) - Number(correctKey));
      if(d < minDiff) minDiff = d;
    }
    for(const [id,ans] of Object.entries(rtState.answers)){
      if(!rtState.scores[id]) rtState.scores[id]={name:'Guest',points:0,avatar:'🙂'};
      const d = Math.abs(Number(ans) - Number(correctKey));
      if(d === minDiff) rtState.scores[id].points += base;
    }
  } else {
    for(const [id,ans] of Object.entries(rtState.answers)){
      if(!rtState.scores[id]) rtState.scores[id]={name:'Guest',points:0,avatar:'🙂'};
      let ok=true;
      if(correctKey!=null){
        ok = String(ans).toLowerCase()===String(correctKey).toLowerCase();
      }
      if(ok) rtState.scores[id].points += base;
    }
  }
  renderLeader();
  send({t:'scores',room:ROOM,scores:rtState.scores});
  toast('Poll finished. Scores updated.');
}
$('#resetScores')?.addEventListener('click',()=>{ rtState.scores={}; renderLeader(); renderParticipants(); send({t:'reset',room:ROOM}) });

// ---------- Reactions (host agg) ----------
function renderReactions(){ const host = $('#resultsArea'); if(!host) return; const line = Object.entries(rtState.reactions).map(([k,v])=>`${k} ${v|0}`).join('  '); const id='rxline'; let el=$('#'+id); if(!el){ el=document.createElement('div'); el.id=id; el.className='mini'; host.prepend(el); } el.textContent = line ? ('Reactions: '+line) : ''; }

function showReactionBubble(emoji){
  if(ROLE!=='host') return;
  const b=document.createElement('div');
  b.className='reaction-bubble';
  b.textContent=emoji;
  const max=Math.max(0,window.innerWidth-40);
  b.style.left=Math.floor(Math.random()*max)+'px';
  b.style.setProperty('--shift',(Math.random()*120-60)+'px');
  document.body.appendChild(b);
  setTimeout(()=>b.remove(),5000);
}

// ---------- Q&A (host) ----------
function renderQA(){ const div = $('#qaList'); if(!div) return; const arr = Object.entries(rtState.qa).sort((a,b)=> (b[1].votes|0)-(a[1].votes|0)); div.innerHTML = arr.length ? arr.map(([qid,q])=>`<div class="row" style="gap:8px;margin:6px 0"><span>${q.avatar||'🙂'}</span><span>${q.text}</span><span class="chip">▲ ${q.votes|0}</span></div>`).join('') : 'No questions yet.'; }
function handleQA(msg){ if(msg.t==='qa_new'){ const id = msg.qid || uid(); rtState.qa[id] = {text:msg.text, from:msg.name, avatar:msg.avatar, votes:0}; send({t:'qa_update', room:ROOM, qa:rtState.qa}); renderQA(); } if(msg.t==='qa_vote'){ const id = msg.qid; if(rtState.qa[id]) rtState.qa[id].votes=(rtState.qa[id].votes||0)+1; send({t:'qa_update', room:ROOM, qa:rtState.qa}); renderQA(); } if(msg.t==='qa_update'){ rtState.qa = msg.qa||rtState.qa; renderQA(); } }

// ---------- Client-side rendering ----------
let clientLocked=false;
function renderClientPoll(){ if(ROLE!=='client') return; const area=$('#clientArea'); const poll=rtState.currentPoll; if(!area) return; if(!poll){ area.innerHTML=''; return } clientLocked=false; let html=`<div class="card"><div class="muted">${poll.q}</div>`;
  if(poll.type==='mc'){ (poll.choices||[]).forEach((c,idx)=>{ const key=String.fromCharCode(65+idx); html+=`<button data-ans="${key}" class="pill ghost mt8">${key}. ${c}</button>` }); }
  else if(poll.type==='tf'){ html+=`<div class="row mt8"><button data-ans="True" class="pill ghost">True</button><button data-ans="False" class="pill ghost">False</button></div>`; }
  else if(poll.type==='scale'){ html+='<div class="row mt8">'+[1,2,3,4,5].map(v=>`<button data-ans="${v}" class="pill ghost">${v}</button>`).join('')+'</div>'; }
  else if(poll.type==='wordcloud'){ const max = rtState.currentPoll.maxWords||3; html += `<div class="row mt8"><input id="wcInput" placeholder="Enter up to ${max} words (comma/space separated)" style="flex:1"/></div><button id="wcSend" class="pill primary mt8">Send</button>`; }
  else if(poll.type==='open'){ html += `<div class="row mt8"><input id="openInput" placeholder="${rtState.currentPoll.maxChars||120} chars max" style="flex:1"/></div><button id="openSend" class="pill primary mt8">Send</button>`; }
  else if(poll.type==='rank'){ html+='<div class="row mt8"><input id="rankInput" type="number" class="w100" placeholder="Enter number"/></div><button id="rankSend" class="pill primary mt8">Send</button>'; }
  else { html+='<div class="mini muted mt8">This question type will be supported soon.</div>'; }
  html+='</div>'; area.innerHTML=html;
  $$('#clientArea button.pill.ghost').forEach(b=>b.onclick=()=>{ if(clientLocked && !rtState.currentPoll.allowChange) return; lockClient('Answer sent ✓'); send({t:'answer',room:ROOM,id:CLIENT_ID,pollId:poll.id,answer:b.dataset.ans}); });
  const wcs=$('#wcSend'); if(wcs) wcs.onclick=()=>{ const raw = ($('#wcInput').value||'').trim(); if(!raw) return; let words=raw.split(/[\s,]+/).filter(Boolean).slice(0, rtState.currentPoll.maxWords||3); lockClient('Sent ✓'); send({t:'answer', room:ROOM, id:CLIENT_ID, pollId:poll.id, answer: words}); };
  const os=$('#openSend'); if(os) os.onclick=()=>{ let txt = ($('#openInput').value||'').slice(0, rtState.currentPoll.maxChars||120); if(!txt) return; lockClient('Sent ✓'); send({t:'answer', room:ROOM, id:CLIENT_ID, pollId:poll.id, answer: txt}); };
  const rs=$('#rankSend'); if(rs) rs.onclick=()=>{ const val=$('#rankInput').value; if(val==='') return; lockClient('Sent ✓'); send({t:'answer', room:ROOM, id:CLIENT_ID, pollId:poll.id, answer: Number(val)}); };
}
function lockClient(msg){ clientLocked=true; const area=$('#clientArea'); if(!area) return; area.querySelectorAll('button, input').forEach(el=>el.disabled=true); toast(msg); try{ navigator.vibrate&&navigator.vibrate(20) }catch(_){} }

// ---------- Anonymous join + avatars ----------
let USED_AVATARS = new Set();
const AVATARS = ['🙂','😀','😎','🤓','🤠','🧐','🤖','👾','👻','🎩','🧠','🦾','🪄','🐱','🐶','🦊','🐼','🐵','🐯','🦁','🐨','🦄','🐸','🐙','🐢','🐳','🦉','🦅','🦆','🦜','🐝','🦋','🐞','🦖','🐲','🐉','🔥','⚡','❄️','🌞','🌙','⭐','🌈','💎','🧊','🍀','🍉'];
const EMOJI_NAMES = {
  '🙂':'Smile','😀':'Grin','😎':'Cool','🤓':'Nerd','🤠':'Cowboy','🧐':'Thinker','🤖':'Robot','👾':'Alien','👻':'Ghost','🎩':'Tophat','🧠':'Brain','🦾':'Cyborg','🪄':'Wand','🐱':'Cat','🐶':'Dog','🦊':'Fox','🐼':'Panda','🐵':'Monkey','🐯':'Tiger','🦁':'Lion','🐨':'Koala','🦄':'Unicorn','🐸':'Frog','🐙':'Octopus','🐢':'Turtle','🐳':'Whale','🦉':'Owl','🦅':'Eagle','🦆':'Duck','🦜':'Parrot','🐝':'Bee','🦋':'Butterfly','🐞':'Ladybug','🦖':'Dino','🐲':'Dragon','🐉':'Dragon','🔥':'Fire','⚡':'Bolt','❄️':'Snow','🌞':'Sun','🌙':'Moon','⭐':'Star','🌈':'Rainbow','💎':'Gem','🧊':'Ice','🍀':'Clover','🍉':'Melon'
};
function genCodeName(av){ const adj=['Brave','Calm','Swift','Clever','Mighty','Quiet','Sunny','Lucky','Nimble','True','Noble','Witty','Zen','Bold','Bright']; const base=EMOJI_NAMES[av]||'Friend'; const n=Math.floor(Math.random()*90)+10; return `${adj[Math.floor(Math.random()*adj.length)]}-${base}-${n}`; }
function setRoster(list){ USED_AVATARS = new Set(list||[]); renderAvatars(); }
function updatePreview(){ const el=$('#preview'); if(!el) return; if(!AVATAR){ el.innerHTML='<span class="muted">Pick an avatar</span>'; return; } if(!NAME) NAME = genCodeName(AVATAR); el.innerHTML=`<span class="emoji">${AVATAR}</span><span class="chip">${NAME}</span>`; }
function renderAvatars(){ const wrap = $('#avatarPick'); if(!wrap) return; wrap.innerHTML = AVATARS.map(a=>{ const taken = USED_AVATARS.has(a); return `<button class="pill ghost" data-av="${a}" style="opacity:${taken?0.35:1}" ${taken?'disabled':''}>${a}</button>`; }).join(''); $$('#avatarPick button').forEach(b=>{ if(b.dataset.av===AVATAR) b.classList.add('active'); b.onclick=()=>{ if(b.disabled) return; AVATAR = b.dataset.av; NAME = genCodeName(AVATAR); localStorage.setItem('avatar', AVATAR); $$('#avatarPick button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); updatePreview(); toast('Avatar selected'); }; }); updatePreview(); }
renderAvatars();
function showJoinUI(){
  $('#joinForm').style.display='flex';
  const ch=$('#clientHeader');
  if(ch){ ch.textContent='Join'; ch.style.display='block'; }
  $('#clientArea').style.display='none';
  $('#reactRow').style.display='none';
  $('#qaForm').classList.add('hidden');
  $('#qaBtn')?.classList.add('hidden');
  updatePreview();
  updateHeader();
}
function hideJoinUI(){
  $('#joinForm').style.display='none';
  const ch=$('#clientHeader');
  if(ch){ ch.style.display='none'; }
  $('#clientArea').style.display='block';
  $('#reactRow').style.display='flex';
  $('#qaForm').classList.add('hidden');
  $('#qaBtn')?.classList.remove('hidden');
  updateHeader();
}
function updateHeader(){
  const user=$('#headerClient');
  const h1=$('#hostTitle');
  const room=$('#roomBadge');
  if(ROLE==='client' && localStorage.getItem('joined')==='1'){
    if(user){
      user.innerHTML=`<span class="emoji">${AVATAR||'🙂'}</span><span class="name">${NAME||''}</span><span class="chip mono">${ROOM}</span>`;
      user.classList.remove('hidden');
    }
    if(h1) h1.style.display='none';
    if(room) room.style.display='none';
  } else {
    if(user) user.classList.add('hidden');
    if(h1) h1.style.display='';
    if(room) room.style.display='';
  }
}

// Sticky join for clients
(function(){ const wasJoined = localStorage.getItem('joined')==='1'; if (ROLE==='client' && wasJoined){ AVATAR = localStorage.getItem('avatar') || '🙂'; NAME = localStorage.getItem('name') || genCodeName(AVATAR); CLIENT_ID = localStorage.getItem('clientId') || CLIENT_ID; hideJoinUI(); }})();

// Join button
$('#joinBtn')?.addEventListener('click', ()=>{ if(!AVATAR || USED_AVATARS.has(AVATAR)) { toast('Pick an available avatar'); return; } if(!NAME) NAME = genCodeName(AVATAR); localStorage.setItem('name', NAME); localStorage.setItem('clientId', CLIENT_ID); localStorage.setItem('avatar', AVATAR); localStorage.setItem('joined', '1'); send({t:'announce',room:ROOM,id:CLIENT_ID,name:NAME,avatar:AVATAR}); hideJoinUI(); toast(`Joined as ${AVATAR} ${NAME}`); });

// Reactions (client)
(function(){ const EMO = ['👏','👍','🎉','🤯','😅']; const bar = $('#reactBar'); if(!bar) return; bar.innerHTML = EMO.map(e=>`<button class="pill ghost" data-emo="${e}" style="font-size:18px">${e}</button>`).join(''); bar.addEventListener('click',(ev)=>{ const b=ev.target.closest('button[data-emo]'); if(!b) return; send({t:'react', room:ROOM, id:CLIENT_ID, emoji:b.dataset.emo}); }); })();

// Q&A (client ask)
$('#qaBtn')?.addEventListener('click',()=> $('#qaForm').classList.toggle('hidden'));
$('#qaSend')?.addEventListener('click',()=>{ const txt = $('#qaInput').value.trim(); if(!txt) return; send({t:'qa_new', room:ROOM, id:CLIENT_ID, name:NAME, avatar:AVATAR, text:txt}); $('#qaInput').value=''; toast('Question sent'); });

// ---------- Builds (step-by-step) ----------
// ---------- Presentation builder ----------
(function(){
  const shell = document.querySelector('#presentation .page-shell');
  if(!shell) return;

  const prevPage=$('#prevPage'), nextPage=$('#nextPage'), pageDots=$('#pageDots');
  const presName=$('#presName'), presNew=$('#presNew'), presAdd=$('#presAdd'), presSave=$('#presSave'), presList=$('#presList'), presLoad=$('#presLoad');
  const buildPrev=$('#buildPrev'), buildNext=$('#buildNext'), buildInfo=$('#buildInfo'), buildEdit=$('#buildEdit'), buildClear=$('#buildClear');
  const fontSelect=$('#fontSelect'), fontSize=$('#fontSize'), fontColor=$('#fontColor'), imgBtn=$('#imgBtn'), imgInput=$('#imgInput');
  const moveLeft=$('#moveLeft'), moveRight=$('#moveRight');

  let pages=[], builds=[], current=0;
  try{ document.execCommand('styleWithCSS', true); }catch(_){ }

  function BuildState(page){
    const content=page.querySelector('.content');
    let currentStep=0, maxStep=0, editMode=false;
    function scan(){ maxStep=0; content.querySelectorAll('[data-step]').forEach(el=>{ const s=parseInt(el.getAttribute('data-step')||'0',10); if(!isNaN(s)) maxStep=Math.max(maxStep,s); el.classList.add('rel'); }); }
    function apply(){ content.querySelectorAll('[data-step]').forEach(el=>{ const s=parseInt(el.getAttribute('data-step')||'0',10); const vis=(s===0||s<=currentStep); el.classList.toggle('build-hidden', !vis); el.classList.toggle('build-visible', vis); let tag=el.querySelector(':scope>.build-tag'); if(editMode){ if(!tag){ tag=document.createElement('div'); tag.className='build-tag'; el.prepend(tag); } tag.textContent='S'+s; } else if(tag){ tag.remove(); } }); if(buildInfo) buildInfo.textContent=`Step ${currentStep}/${maxStep}`; }
    function setStep(n){ currentStep=Math.max(0, Math.min(maxStep, n)); apply(); }
    function next(){ if(currentStep<maxStep) setStep(currentStep+1); }
    function prev(){ if(currentStep>0) setStep(currentStep-1); }
    function clear(){ content.querySelectorAll('[data-step]').forEach(el=> el.setAttribute('data-step','0')); maxStep=0; setStep(0); }
    function onEditClick(e){ const el=e.target.closest('[data-step], .card, li, svg, h2, p, img, div'); if(!el||!content.contains(el)) return; e.preventDefault(); e.stopPropagation(); const cur=parseInt(el.getAttribute('data-step')||'0',10); const nxt=(cur+1)%(maxStep+2); el.setAttribute('data-step', String(nxt)); if(nxt>maxStep) maxStep=nxt; apply(); }
    function setEdit(on){ editMode=on; if(editMode){ content.addEventListener('click', onEditClick); } else { content.removeEventListener('click', onEditClick); } apply(); }
    scan(); setStep(0);
    return { next, prev, clear, setEdit, apply, setStep, get currentStep(){return currentStep;}, get maxStep(){return maxStep;} };
  }

  function refreshPages(){
    pages=$$('#presentation .page-shell .page');
    builds=pages.map(p=>BuildState(p));
    updateDots();
    if(pages.length) showPage(0);
  }

  function updateDots(){ if(!pageDots) return; pageDots.innerHTML=''; pages.forEach((_,i)=>{ const d=document.createElement('div'); d.className='dot'+(i===current?' active':''); d.addEventListener('click',()=>showPage(i)); pageDots.appendChild(d); }); }

  function showPage(idx){ if(idx<0||idx>=pages.length) return; pages.forEach((p,i)=>{ p.style.display = i===idx?'':'none'; }); current=idx; builds[current].apply(); updateDots(); }

  function createBlank(){ const page=document.createElement('div'); page.className='page'; const content=document.createElement('div'); content.className='content'; content.contentEditable='true'; content.innerHTML='<h2>Title</h2><p>Content</p>'; page.appendChild(content); shell.appendChild(page); refreshPages(); showPage(pages.length-1); }

  function moveSlide(from,to){
    if(to<0||to>=pages.length) return;
    const page=pages[from];
    const ref=pages[to];
    if(from<to) ref.after(page); else ref.before(page);
    refreshPages();
    showPage(to);
  }

  function gather(){ return { slides: pages.map(p=>({ html: p.querySelector('.content').innerHTML })) }; }

  async function save(){ const name=(presName?.value||'').trim(); if(!name){ toast('Name required'); return; } try{ await fetch('/api/presentations/'+encodeURIComponent(name), { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(gather()) }); loadList(); toast('Saved'); }catch(_){ toast('Save failed'); } }

  async function load(name){ try{ const res=await fetch('/api/presentations/'+encodeURIComponent(name)); if(!res.ok) return; const data=await res.json(); $$('#presentation .page-shell .page').forEach(p=>p.remove()); (data.slides||[]).forEach(s=>{ const page=document.createElement('div'); page.className='page'; const content=document.createElement('div'); content.className='content'; content.contentEditable='true'; content.innerHTML=s.html||''; page.appendChild(content); shell.appendChild(page); }); refreshPages(); showPage(0); presName.value=name; }catch(_){ toast('Load failed'); } }

  async function loadList(){ try{ const res=await fetch('/api/presentations'); if(!res.ok) return; const arr=await res.json(); if(presList){ presList.innerHTML='<option value="">(choose)</option>'+arr.map(n=>`<option value="${n}">${n}</option>`).join(''); } }catch(_){ /* noop */ } }

  if(prevPage) prevPage.addEventListener('click',()=>showPage(current-1));
  if(nextPage) nextPage.addEventListener('click',()=>showPage(current+1));
  if(presAdd) presAdd.addEventListener('click',createBlank);
  if(presNew) presNew.addEventListener('click',()=>{ $$('#presentation .page-shell .page').forEach(p=>p.remove()); createBlank(); presName.value=''; });
  if(presSave) presSave.addEventListener('click',save);
  if(presLoad) presLoad.addEventListener('click',()=>{ const n=presList.value; if(n) load(n); });
  if(moveLeft) moveLeft.addEventListener('click',()=>moveSlide(current, current-1));
  if(moveRight) moveRight.addEventListener('click',()=>moveSlide(current, current+1));
  if(buildPrev) buildPrev.addEventListener('click',()=>builds[current]?.prev());
  if(buildNext) buildNext.addEventListener('click',()=>builds[current]?.next());
  if(buildEdit) buildEdit.addEventListener('change',e=>builds[current]?.setEdit(e.target.checked));
  if(buildClear) buildClear.addEventListener('click',()=>builds[current]?.clear());
  if(fontSelect) fontSelect.addEventListener('change',()=>document.execCommand('fontName',false,fontSelect.value));
  if(fontSize) fontSize.addEventListener('change',()=>document.execCommand('fontSize',false,fontSize.value));
  if(fontColor) fontColor.addEventListener('input',()=>document.execCommand('foreColor',false,fontColor.value));
  if(imgBtn && imgInput){
    imgBtn.addEventListener('click',()=>imgInput.click());
    imgInput.addEventListener('change',()=>{
      const f=imgInput.files[0];
      if(!f) return;
      const reader=new FileReader();
      reader.onload=e=>document.execCommand('insertImage',false,e.target.result);
      reader.readAsDataURL(f);
      imgInput.value='';
    });
  }
  window.addEventListener('keydown',e=>{ const t=e.target; if(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable) return; if(e.key==='ArrowRight'||e.key===' '){ e.preventDefault(); builds[current]?.next(); } if(e.key==='ArrowLeft'){ e.preventDefault(); builds[current]?.prev(); } });

  loadList();
  refreshPages();
  if(!pages.length) createBlank();
})();

// ---------- Boot ----------
(function(){ function boot(){ document.body.classList.remove('ink-on','wb-open');  syncSessionHints();
    setTimeout(()=>{ const wsFilled=$('#wsUrl')?.value; if(wsFilled) connectWS(); }, 60);
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', boot, { once:true }); } else { boot(); }
})();











/* ---- Minimal QR fallback (EmbedQR) — no CSS, canvas-only ---- */
(function(t){function e(t){this.mode=o,this.data=t}function n(t,e){this.typeNumber=t,this.errorCorrectLevel=e,this.modules=null,this.moduleCount=0,this.dataList=[]}function r(){this.buffer=[],this.length=0}var o=4,i={L:1,M:0,Q:3,H:2};e.prototype={getLength:function(){return this.data.length},write:function(t){for(var e=0;e<this.data.length;e++)t.put(this.data.charCodeAt(e),8)}};n.prototype={addData:function(t){this.dataList.push(new e(t))},isDark:function(t,e){if(null==this.modules)throw new Error("QR not built");return this.modules[t][e]},getModuleCount:function(){return this.moduleCount},make:function(){this.moduleCount=33,this.modules=new Array(this.moduleCount);for(var t=0;t<this.moduleCount;t++){this.modules[t]=new Array(this.moduleCount);for(var e=0;e<this.moduleCount;e++)this.modules[t][e]=null}this._pos(0,0),this._pos(this.moduleCount-7,0),this._pos(0,this.moduleCount-7),this._map(this._data())},_pos:function(t,e){for(var n=-1;n<=7;n++)if(!(t+n<=-1||this.moduleCount<=t+n))for(var r=-1;r<=7;r++)e+r<=-1||this.moduleCount<=e+r||(this.modules[t+n][e+r]=n>=0&&6>=n&&(0==r||6==r)||r>=0&&6>=r&&(0==n||6==n)||n>=2&&4>=n&&r>=2&&4>=r)},_data:function(){var t=new r;for(var e=0;e<this.dataList.length;e++){var n=this.dataList[e];t.put(4,4),t.put(n.getLength(),8),n.write(t)}for(;t.length+4<=512;)t.put(0,4);for(;t.length%8!=0;)t.put(0,1);for(var o=[],i=0;i<t.buffer.length;i++)o.push(t.buffer[i]);for(;o.length<512;)o.push(0);return o},_map:function(t){for(var e=0,n=0,r=this.moduleCount-1,o=this.moduleCount-1;o>0;o-=2)for(6==o&&o--;o>=0;o--){for(var i=0;i<2;i++)null==this.modules[o-i][r]&&(e<n&&null==this.modules[o-i][r]&&(this.modules[o-i][r]=(t[e>>3]>>(7-(7&e))&1)==1),e++);r+=-1}}};r.prototype={put:function(t,e){for(var n=0;n<e;n++)this.putBit((t>>(e-n-1)&1)==1)},putBit:function(t){var e=Math.floor(this.length/8);this.buffer.length<=e&&this.buffer.push(0),t&&(this.buffer[e]|=128>>>this.length%8),this.length++}};var u=function(t){var e=new n(4,i.L);return e.addData(t),e.make(),e};t.EmbedQR={drawCanvas:function(t,e){var n=u(t),r=e||256,o=e||256,i=document.createElement("canvas");i.width=r;i.height=o;for(var a=i.getContext("2d"),s=0;s<o;s++)for(var l=0;l<r;l++){var h=Math.floor(s*n.getModuleCount()/o),c=Math.floor(l*n.getModuleCount()/r),f=n.isDark(h,c)?0:255;a.fillStyle="rgb("+f+","+f+","+f+")",a.fillRect(l,s,1,1)}return i}}})(window);
function qrFallbackDataURL(text, size){ try{ var c = window.EmbedQR.drawCanvas(text, size||256); return c.toDataURL('image/png'); }catch(e){ return null; } }
