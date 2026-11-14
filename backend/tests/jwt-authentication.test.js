const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createJwtAuthentication } = require('../src/adapters/http/jwt-authentication');

let privateKey;
let keySet;
let SignJWT;
let hmacSecret;
const issuer = 'https://login.marketplace.test/auth/v1';
const audience = 'marketplace-web';

before(async () => {
  const jose = await import('jose');
  const pair = await jose.generateKeyPair('ES256');
  const publicJwk = await jose.exportJWK(pair.publicKey);
  publicJwk.kid = 'test-key';
  publicJwk.alg = 'ES256';
  publicJwk.use = 'sig';
  privateKey = pair.privateKey;
  keySet = jose.createLocalJWKSet({ keys: [publicJwk] });
  SignJWT = jose.SignJWT;
  hmacSecret = await jose.generateSecret('HS256');
});

async function createToken({ expiresAt = '5m', issuerValue = issuer, audienceValue = audience } = {}) {
  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setSubject('buyer-123')
    .setIssuer(issuerValue)
    .setAudience(audienceValue)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(privateKey);
}

async function request(token) {
  const app = express();
  app.get('/private', createJwtAuthentication({ required: true, issuer, audience, keySet }), (req, res) => {
    res.json({ subject: req.auth.subject });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    return await fetch(`http://127.0.0.1:${server.address().port}/private`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('Fase 9B: JWT ES256 válido identifica al comprador', async () => {
  const response = await request(await createToken());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { subject: 'buyer-123' });
});

test('Fase 9B: JWT ausente, inválido o vencido devuelve 401', async () => {
  assert.equal((await request()).status, 401);
  assert.equal((await request('not.a.jwt')).status, 401);
  assert.equal((await request(await createToken({ expiresAt: '-1s' }))).status, 401);
});

test('Fase 9B: JWT con emisor o audiencia distintos devuelve 401', async () => {
  assert.equal((await request(await createToken({ issuerValue: 'https://other.test' }))).status, 401);
  assert.equal((await request(await createToken({ audienceValue: 'other-client' }))).status, 401);
});

test('Fase 9C: JWT con algoritmo no permitido devuelve 401', async () => {
  const token = await new SignJWT()
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('buyer-123')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(hmacSecret);
  assert.equal((await request(token)).status, 401);
});
