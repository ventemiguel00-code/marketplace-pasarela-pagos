// Contacto autorizado para la demostración académica del Marketplace.
const SUPPORT_PHONE = '3154721757';
const SUPPORT_PHONE_INTERNATIONAL = '+573154721757';
const SUPPORT_WHATSAPP_URL = 'https://wa.me/573154721757';

function getSupportContactPresentation(phone = SUPPORT_PHONE_INTERNATIONAL) {
  const displayPhone = String(phone).trim();
  const normalizedPhone = displayPhone.replace(/[\s()-]/g, '');
  const isValid = /^\+[1-9]\d{7,14}$/.test(normalizedPhone);

  if (!isValid) {
    return {
      available: false,
      message: 'Número de soporte pendiente por definir.',
      phone: null,
      callHref: null,
      whatsappHref: null,
    };
  }

  return {
    available: true,
    message: `Soporte del Marketplace: ${SUPPORT_PHONE}`,
    phone: SUPPORT_PHONE,
    callHref: null,
    whatsappHref: normalizedPhone === SUPPORT_PHONE_INTERNATIONAL
      ? SUPPORT_WHATSAPP_URL
      : `https://wa.me/${normalizedPhone.slice(1)}`,
  };
}

function renderSupportContact(documentRef, phone = SUPPORT_PHONE_INTERNATIONAL) {
  const status = documentRef.getElementById('support-contact-status');
  if (!status) return;

  const presentation = getSupportContactPresentation(phone);
  status.className = `support-contact-status ${presentation.available ? 'available' : 'pending'}`;
  status.textContent = '';

  if (!presentation.available) {
    status.textContent = presentation.message;
    return;
  }

  const phoneText = documentRef.createElement('span');
  phoneText.className = 'support-contact-number';
  phoneText.textContent = `Soporte: ${presentation.phone}`;

  const whatsappLink = documentRef.createElement('a');
  whatsappLink.className = 'support-whatsapp-link';
  whatsappLink.href = presentation.whatsappHref;
  whatsappLink.target = '_blank';
  whatsappLink.rel = 'noopener noreferrer';
  whatsappLink.textContent = 'Contactar por WhatsApp';
  status.append(phoneText, whatsappLink);
}

if (typeof window !== 'undefined') {
  window.SupportContact = { getSupportContactPresentation, renderSupportContact };
  renderSupportContact(document);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SUPPORT_PHONE,
    SUPPORT_PHONE_INTERNATIONAL,
    SUPPORT_WHATSAPP_URL,
    getSupportContactPresentation,
    renderSupportContact,
  };
}
