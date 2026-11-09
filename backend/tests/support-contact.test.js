const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SUPPORT_PHONE,
  SUPPORT_PHONE_INTERNATIONAL,
  SUPPORT_WHATSAPP_URL,
  getSupportContactPresentation,
} = require('../../frontend/js/support-contact');

test('HU-PG-10: muestra el contacto autorizado y su enlace exacto de WhatsApp', () => {
  assert.equal(SUPPORT_PHONE, '3154721757');
  assert.equal(SUPPORT_PHONE_INTERNATIONAL, '+573154721757');
  assert.equal(SUPPORT_WHATSAPP_URL, 'https://wa.me/573154721757');
  assert.deepEqual(getSupportContactPresentation(), {
    available: true,
    message: 'Soporte del Marketplace: 3154721757',
    phone: '3154721757',
    callHref: null,
    whatsappHref: 'https://wa.me/573154721757',
  });
});

test('HU-PG-10: el formato con espacios conserva el enlace autorizado', () => {
  assert.deepEqual(getSupportContactPresentation('+57 315 472 1757'), {
    available: true,
    message: 'Soporte del Marketplace: 3154721757',
    phone: '3154721757',
    callHref: null,
    whatsappHref: 'https://wa.me/573154721757',
  });
});

test('HU-PG-10: una configuración inválida no genera enlaces funcionales', () => {
  const result = getSupportContactPresentation('número pendiente');

  assert.equal(result.available, false);
  assert.equal(result.callHref, null);
  assert.equal(result.whatsappHref, null);
});
