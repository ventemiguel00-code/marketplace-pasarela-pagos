const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SUPPORT_PHONE,
  getSupportContactPresentation,
} = require('../../frontend/js/support-contact');

test('HU-PG-10: sin número configurado muestra el contacto pendiente', () => {
  assert.equal(SUPPORT_PHONE, '');
  assert.deepEqual(getSupportContactPresentation(), {
    available: false,
    message: 'Número de soporte pendiente por definir.',
    phone: null,
    callHref: null,
    whatsappHref: null,
  });
});

test('HU-PG-10: un número internacional válido se muestra y permite llamar', () => {
  assert.deepEqual(getSupportContactPresentation('+57 300 123 4567'), {
    available: true,
    message: 'Soporte del Marketplace: +57 300 123 4567',
    phone: '+57 300 123 4567',
    callHref: 'tel:+573001234567',
    whatsappHref: null,
  });
});

test('HU-PG-10: una configuración inválida no genera enlaces funcionales', () => {
  const result = getSupportContactPresentation('número pendiente');

  assert.equal(result.available, false);
  assert.equal(result.callHref, null);
  assert.equal(result.whatsappHref, null);
});
