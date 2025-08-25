(function(global){
  function loadSavedPolls(){
    try{ return JSON.parse(localStorage.getItem('savedPolls')||'[]'); }
    catch(_){ return []; }
  }
  function savePoll(poll){
    const arr = loadSavedPolls();
    arr.push(poll);
    localStorage.setItem('savedPolls', JSON.stringify(arr));
  }
  function renderSavedPolls(container, startCb){
    if(!container) return;
    const polls = loadSavedPolls();
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
      btn.onclick = ()=>{ const poll=polls[Number(btn.dataset.i)]; startCb && startCb(poll); };
    });
    container.querySelectorAll('button.delete').forEach(btn=>{
      btn.onclick = ()=>{ const idx=Number(btn.dataset.i); polls.splice(idx,1); localStorage.setItem('savedPolls', JSON.stringify(polls)); renderSavedPolls(container,startCb); };
    });
  }
  global.SavedPolls = { loadSavedPolls, savePoll, renderSavedPolls };
  if(typeof module!=='undefined') module.exports = global.SavedPolls;
})(typeof window!=='undefined'? window : globalThis);
