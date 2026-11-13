// Runs without MongoDB: only routes that never touch the database.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../src/app');

function call(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { port: server.address().port, method, path, headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('API: /api/validate returns category, priority, routing key and branch (no DB needed)', async () => {
  const server = createApp().listen(0);
  try {
    const ok = await call(server, 'POST', '/api/validate', { loanCode: 'LOANV123456', income: '900000', amount: '1500000', urgency: 'High' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.valid, true);
    assert.equal(ok.body.category, 'Vehicle');
    assert.equal(ok.body.routingKey, 'V:HIGH');
    assert.equal(ok.body.branch, 'V2');
    assert.equal(ok.body.priority, 'High');

    const bad = await call(server, 'POST', '/api/validate', { loanCode: 'LOANX123456', income: '1', amount: '1' });
    assert.equal(bad.body.valid, false);
    assert.equal(bad.body.category, 'Invalid');
    assert.equal(bad.body.reasonCode, 'ERR_UNSUPPORTED_TYPE');

    const meta = await call(server, 'GET', '/api/meta');
    assert.equal(meta.body.threshold, 1000000);
    const nf = await call(server, 'GET', '/api/nope');
    assert.equal(nf.status, 404);
  } finally {
    server.close();
  }
});
