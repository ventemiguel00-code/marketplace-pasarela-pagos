const { test } = require('node:test');
const assert = require('node:assert/strict');
const createApp = require('../src/adapters/http/app');

test('Fase 18: expone solo la configuración pública del Login central', async () => {
  const authentication = {
    required: true,
    url: 'https://login.example.test',
    publishableKey: 'public-key',
    issuer: 'https://login.example.test/auth/v1',
    audience: 'authenticated',
  };
  const unused = async () => null;
  const app = createApp(unused, async () => [], unused, unused, unused, unused, {
    publicAuthentication: authentication,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public-config`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { authentication });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
