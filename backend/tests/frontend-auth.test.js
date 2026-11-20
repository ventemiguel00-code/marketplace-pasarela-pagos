const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const authSource = fs.readFileSync(path.resolve(__dirname, '../../frontend/js/marketplace-auth.js'), 'utf8');
const bridgeSource = fs.readFileSync(path.resolve(__dirname, '../../frontend/js/auth-bridge.js'), 'utf8');
const authConfig = {
  required: true,
  url: 'https://login.example.test',
  publishableKey: 'public-test-key',
  issuer: 'https://login.example.test/auth/v1',
  audience: 'authenticated',
};

function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function token({ exp = Math.floor(Date.now() / 1000) + 300, aud = 'authenticated' } = {}) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'ES256', kid: 'test' })}.${encode({
    iss: authConfig.issuer,
    aud,
    sub: 'buyer-123',
    exp,
  })}.test-signature`;
}

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function createBrowser({ storage = createStorage(), fetchImpl } = {}) {
  const window = {
    sessionStorage: storage,
    fetch: fetchImpl,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
  };
  const context = vm.createContext({ window, console });
  vm.runInContext(authSource, context);
  vm.runInContext(bridgeSource, context);
  return window;
}

test('Fase 18: sin sesión muestra acceso anónimo y no inventa un JWT', async () => {
  const browser = createBrowser({
    fetchImpl: async (url) => {
      assert.equal(url, '/api/public-config');
      return jsonResponse({ authentication: authConfig });
    },
  });
  const state = await browser.MarketplaceAuth.initialize();
  assert.equal(state.status, 'anonymous');
  assert.equal(await browser.MarketplaceAuth.getAccessToken(), null);
});

test('Fase 18: login central conserva la sesión en la pestaña y agrega Bearer', async () => {
  const storage = createStorage();
  const browser = createBrowser({
    storage,
    fetchImpl: async (url, options = {}) => {
      if (url === '/api/public-config') return jsonResponse({ authentication: authConfig });
      assert.equal(url, `${authConfig.url}/auth/v1/token?grant_type=password`);
      assert.equal(options.headers.apikey, authConfig.publishableKey);
      return jsonResponse({
        access_token: token(), refresh_token: 'refresh-test', user: { email: 'buyer@example.test' },
      });
    },
  });
  await browser.MarketplaceAuth.initialize();
  const state = await browser.MarketplaceAuth.login('buyer@example.test', 'not-stored');
  assert.equal(state.status, 'authenticated');
  assert.equal(state.email, 'buyer@example.test');
  assert.ok(storage.getItem('usc_payments_auth_session'));
  const headers = await browser.MarketplaceAuthBridge.withAuthHeaders({ Accept: 'application/json' });
  assert.match(headers.Authorization, /^Bearer /);
  assert.equal(browser.MarketplaceAuth.getPublicSessionInfo().audience, 'authenticated');
});

test('Fase 18: recupera y renueva una sesión expirada sin reenviar la contraseña', async () => {
  const storage = createStorage({
    usc_payments_auth_session: JSON.stringify({
      accessToken: token({ exp: Math.floor(Date.now() / 1000) - 1 }),
      refreshToken: 'refresh-test', expiresAt: Date.now() - 1000,
      subject: 'buyer-123', email: 'buyer@example.test',
      audience: 'authenticated', issuer: authConfig.issuer,
    }),
  });
  const calls = [];
  const browser = createBrowser({
    storage,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url === '/api/public-config') return jsonResponse({ authentication: authConfig });
      return jsonResponse({
        access_token: token(), refresh_token: 'refresh-rotated', user: { email: 'buyer@example.test' },
      });
    },
  });
  const state = await browser.MarketplaceAuth.initialize();
  assert.equal(state.status, 'authenticated');
  assert.equal(calls[1].url, `${authConfig.url}/auth/v1/token?grant_type=refresh_token`);
  assert.deepEqual(JSON.parse(calls[1].options.body), { refresh_token: 'refresh-test' });
});

test('Fase 18: audiencia incorrecta se rechaza y cerrar sesión elimina el estado local', async () => {
  let useWrongAudience = true;
  const storage = createStorage();
  const browser = createBrowser({
    storage,
    fetchImpl: async (url) => {
      if (url === '/api/public-config') return jsonResponse({ authentication: authConfig });
      if (url.endsWith('/logout')) return jsonResponse({});
      return jsonResponse({
        access_token: token({ aud: useWrongAudience ? 'other' : 'authenticated' }),
        refresh_token: 'refresh-test', user: { email: 'buyer@example.test' },
      });
    },
  });
  await browser.MarketplaceAuth.initialize();
  await assert.rejects(browser.MarketplaceAuth.login('buyer@example.test', 'not-stored'));
  assert.equal(browser.MarketplaceAuth.getState().status, 'anonymous');
  useWrongAudience = false;
  await browser.MarketplaceAuth.login('buyer@example.test', 'not-stored');
  await browser.MarketplaceAuth.logout();
  assert.equal(storage.getItem('usc_payments_auth_session'), null);
  assert.equal(browser.MarketplaceAuth.getState().status, 'anonymous');
});
