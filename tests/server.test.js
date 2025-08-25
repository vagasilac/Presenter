const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

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
