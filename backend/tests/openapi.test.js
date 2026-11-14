const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApiDocument } = require('../src/adapters/http/openapi');

test('Fase 9C: OpenAPI documenta JWT, idempotencia, compatibilidad y anticipos', () => {
  assert.equal(openApiDocument.components.securitySchemes.bearerAuth.scheme, 'bearer');
  assert.ok(openApiDocument.paths['/api/pagos/procesar']);
  assert.ok(openApiDocument.paths['/api/pagos/{id}']);
  assert.ok(openApiDocument.paths['/api/payments/reservations/quote/{orderId}']);
  assert.ok(openApiDocument.paths['/api/payments/reservations']);
  assert.ok(openApiDocument.paths['/api/payments'].post.parameters);
  assert.equal(openApiDocument.paths['/api/payments'].post.responses[409].description.includes('idempotente'), true);
});
