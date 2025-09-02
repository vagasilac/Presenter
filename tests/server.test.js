const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 8123;
let serverProcess;

test.before(async () => {
  serverProcess = spawn('node', ['server.js', PORT], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  // give the server a moment to start
  await delay(500);
});

test.after(() => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

test('serves index.html', async () => {
  const res = await fetch(`http://localhost:${PORT}/`);
  assert.strictEqual(res.status, 200);
  const body = await res.text();
  assert.match(body, /Lean Training/);
});

test('redirects short join URL', async () => {
  const res = await fetch(`http://localhost:${PORT}/j/testroom`, { redirect: 'manual' });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.get('location'), '/?room=testroom&role=client');
});

test('QR endpoint returns SVG', async () => {
  const res = await fetch(`http://localhost:${PORT}/qr.svg?text=hello`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
  const body = await res.text();
  assert.ok(body.includes('<svg'));
});

test('presentation save and load', async () => {
  const data = { slides: [{ html: '<h2>Hi</h2>' }] };
  const saveRes = await fetch(`http://localhost:${PORT}/api/presentations/testpres`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data)
  });
  assert.strictEqual(saveRes.status, 200);

  const loadRes = await fetch(`http://localhost:${PORT}/api/presentations/testpres`);
  assert.strictEqual(loadRes.status, 200);
  const loaded = await loadRes.json();
  assert.strictEqual(loaded.slides[0].html, '<h2>Hi</h2>');

  const listRes = await fetch(`http://localhost:${PORT}/api/presentations`);
  const list = await listRes.json();
  assert.ok(list.includes('testpres'));

  const file = path.join(__dirname, '..', 'presentations', 'testpres.json');
  if (fs.existsSync(file)) fs.unlinkSync(file);
});

test('poll save and load', async () => {
  const poll = { id: 'testpoll', q: 'Example?', type: 'tf', choices: null, timed: 0, correct: null, multi: false, allowChange: false, maxWords: 3, maxChars: 120, score: false };
  const saveRes = await fetch(`http://localhost:${PORT}/api/polls/${poll.id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(poll)
  });
  assert.strictEqual(saveRes.status, 200);

  const loadRes = await fetch(`http://localhost:${PORT}/api/polls/${poll.id}`);
  assert.strictEqual(loadRes.status, 200);
  const loaded = await loadRes.json();
  assert.strictEqual(loaded.q, 'Example?');

  const listRes = await fetch(`http://localhost:${PORT}/api/polls`);
  const list = await listRes.json();
  assert.ok(list.includes('testpoll'));

  const file = path.join(__dirname, '..', 'polls', 'testpoll.json');
  if (fs.existsSync(file)) fs.unlinkSync(file);
});
