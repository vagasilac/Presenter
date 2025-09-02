(function(global){
  async function loadSavedPolls(){
    try{
      const res = await fetch('/api/polls');
      if(!res.ok) return [];
      const names = await res.json();
      const polls = [];
      for(const n of names){
        try{
          const r = await fetch('/api/polls/'+encodeURIComponent(n));
          if(r.ok){
            const p = await r.json();
            polls.push(p);
          }
        }catch(_){ }
      }
      return polls;
    }catch(_){ return []; }
  }
  async function savePoll(poll){
    if(!poll || !poll.id) return;
    try{
      await fetch('/api/polls/'+encodeURIComponent(poll.id), {
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify(poll)
      });
    }catch(_){ }
  }
  async function deletePoll(id){
    try{ await fetch('/api/polls/'+encodeURIComponent(id), { method:'DELETE' }); }
    catch(_){ }
  }
  async function renderSavedPolls(container, startCb){
    if(!container) return;
    const polls = await loadSavedPolls();
    if(!polls.length){
      container.innerHTML = 'No saved polls.';
      return;
    }
    container.innerHTML = polls.map((p,i)=>
      `<div class="row gap8 mt6"><div class="chip flex1">${p.q}</div>`+
      `<button data-i="${i}" class="start pill primary mini">Start</button>`+
      `<button data-i="${i}" class="delete pill danger mini">Delete</button></div>`
    ).join('');
    container.querySelectorAll('button.start').forEach(btn=>{
      btn.addEventListener('click', (ev)=>{
        ev.preventDefault();
        const poll = polls[Number(btn.dataset.i)];
        if(startCb) startCb(poll);
      });
    });
    container.querySelectorAll('button.delete').forEach(btn=>{
      btn.addEventListener('click', async (ev)=>{
        ev.preventDefault();
        const poll = polls[Number(btn.dataset.i)];
        await deletePoll(poll.id);
        renderSavedPolls(container,startCb);
      });
    });
  }
  global.SavedPolls = { loadSavedPolls, savePoll, renderSavedPolls };
  if(typeof module!=='undefined') module.exports = global.SavedPolls;
})(typeof window!=='undefined'? window : globalThis);
