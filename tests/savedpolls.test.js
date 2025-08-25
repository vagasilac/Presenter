const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

test('index.html includes Saved Polls tab', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /Saved Polls/);
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
