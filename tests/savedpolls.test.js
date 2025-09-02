const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

test('index.html includes Saved polls section without separate tab', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /Saved polls/i);
  assert.ok(!/data-tab="saved"/.test(html));
});

test('saved polls save and load via API', async () => {
  const store = {};
  global.fetch = async (url, opts={}) => {
    const method = (opts.method||'GET').toUpperCase();
    const u = new URL(url, 'http://localhost');
    if(u.pathname === '/api/polls' && method === 'GET'){
      return new Response(JSON.stringify(Object.keys(store)), { status:200, headers:{'content-type':'application/json'} });
    }
    if(u.pathname.startsWith('/api/polls/')){
      const id = u.pathname.split('/').pop();
      if(method === 'POST'){
        store[id] = JSON.parse(opts.body);
        return new Response(JSON.stringify({ok:true}), { status:200, headers:{'content-type':'application/json'} });
      }
      if(method === 'GET'){
        if(!(id in store)) return new Response('nf',{status:404});
        return new Response(JSON.stringify(store[id]), { status:200, headers:{'content-type':'application/json'} });
      }
    }
    return new Response('bad', {status:400});
  };
  delete require.cache[require.resolve('../savedPolls.js')];
  const SavedPolls = require('../savedPolls.js');
  await SavedPolls.savePoll({ id: '1', q: 'Example?', type: 'tf' });
  const arr = await SavedPolls.loadSavedPolls();
  assert.strictEqual(arr.length, 1);
  assert.strictEqual(arr[0].q, 'Example?');
});

test('renderSavedPolls calls start callback', async () => {
  const store = {};
  global.fetch = async (url, opts={}) => {
    const method = (opts.method||'GET').toUpperCase();
    const u = new URL(url, 'http://localhost');
    if(u.pathname === '/api/polls' && method === 'GET'){
      return new Response(JSON.stringify(Object.keys(store)), { status:200, headers:{'content-type':'application/json'} });
    }
    if(u.pathname.startsWith('/api/polls/')){
      const id = u.pathname.split('/').pop();
      if(method === 'POST'){
        store[id] = JSON.parse(opts.body);
        return new Response(JSON.stringify({ok:true}), { status:200, headers:{'content-type':'application/json'} });
      }
      if(method === 'GET'){
        if(!(id in store)) return new Response('nf',{status:404});
        return new Response(JSON.stringify(store[id]), { status:200, headers:{'content-type':'application/json'} });
      }
      if(method === 'DELETE'){
        delete store[id];
        return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
      }
    }
    return new Response('bad', {status:400});
  };
  delete require.cache[require.resolve('../savedPolls.js')];
  const SavedPolls = require('../savedPolls.js');
  await SavedPolls.savePoll({ id: '1', q: 'Example?', type: 'tf' });

  const container = {
    _html: '',
    buttons: [],
    set innerHTML(html) {
      this._html = html;
      this.buttons = [];
      const regex = /<button data-i="(\d+)" class="([^"]+)">/g;
      let m;
      while ((m = regex.exec(html))) {
        const idx = m[1]; const cls = m[2];
        const btn = {
          dataset: { i: idx },
          className: cls,
          handlers: {},
          addEventListener(type, fn) { this.handlers[type] = fn; },
          click() { this.handlers.click && this.handlers.click({ preventDefault() {} }); }
        };
        this.buttons.push(btn);
      }
    },
    get innerHTML() { return this._html; },
    querySelectorAll(sel) {
      if (sel === 'button.start') return this.buttons.filter(b => b.className.includes('start'));
      if (sel === 'button.delete') return this.buttons.filter(b => b.className.includes('delete'));
      return [];
    }
  };

  let started = false;
  await SavedPolls.renderSavedPolls(container, () => { started = true; });
  container.querySelectorAll('button.start')[0].click();
  assert.strictEqual(started, true);
});
