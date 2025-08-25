const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

test('index.html includes Saved polls section without separate tab', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /Saved polls/i);
  assert.ok(!/data-tab="saved"/.test(html));
});

test('saved polls save and load from localStorage', () => {
  const store = {};
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; }
  };
  const SavedPolls = require('../savedPolls.js');
  localStorage.clear();
  SavedPolls.savePoll({ id: '1', q: 'Example?', type: 'tf' });
  const arr = SavedPolls.loadSavedPolls();
  assert.strictEqual(arr.length, 1);
  assert.strictEqual(arr[0].q, 'Example?');
});

test('renderSavedPolls calls start callback', () => {
  const store = {};
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    clear: () => { for (const k in store) delete store[k]; }
  };
  const SavedPolls = require('../savedPolls.js');
  localStorage.clear();
  SavedPolls.savePoll({ id: '1', q: 'Example?', type: 'tf' });

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
  SavedPolls.renderSavedPolls(container, () => { started = true; });
  container.querySelectorAll('button.start')[0].click();
  assert.strictEqual(started, true);
});
