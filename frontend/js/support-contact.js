// Configura aquí el número oficial cuando el Marketplace lo autorice.
// Usa formato internacional, por ejemplo: +57 seguido del número completo.
const SUPPORT_PHONE = '';

function getSupportContactPresentation(phone = '') {
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
    message: `Soporte del Marketplace: ${displayPhone}`,
    phone: displayPhone,
    callHref: `tel:${normalizedPhone}`,
    whatsappHref: null,
  };
}

function renderSupportContact(documentRef, phone = SUPPORT_PHONE) {
  const status = documentRef.getElementById('support-contact-status');
  if (!status) return;

  const presentation = getSupportContactPresentation(phone);
  status.className = `support-contact-status ${presentation.available ? 'available' : 'pending'}`;
  status.textContent = '';

  if (!presentation.available) {
    status.textContent = presentation.message;
    return;
  }

  const callLink = documentRef.createElement('a');
  callLink.href = presentation.callHref;
  callLink.textContent = `Llamar a soporte: ${presentation.phone}`;
  status.append(callLink);
}

if (typeof window !== 'undefined') {
  window.SupportContact = { getSupportContactPresentation, renderSupportContact };
  renderSupportContact(document);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SUPPORT_PHONE,
    getSupportContactPresentation,
    renderSupportContact,
  };
}
