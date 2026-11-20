const REQUIRED_RESPONSE_FIELDS = [
  'id', 'pedido_id', 'vendedor_id', 'comprador_id', 'monto_bruto',
  'porcentaje_comision', 'comision_plataforma', 'monto_neto_vendedor',
  'estado_escrow', 'creado_en',
];

function integrationError(code, message, options = {}) {
  const error = new Error(message, options.cause ? { cause: options.cause } : undefined);
  error.code = code;
  error.status = options.status;
  return error;
}

function assertEscrowRequest(payload) {
  const requiredIds = ['pedido_id', 'vendedor_id', 'comprador_id'];
  if (!payload || requiredIds.some((key) => typeof payload[key] !== 'string' || !payload[key].trim())) {
    throw integrationError('INVALID_ESCROW_REQUEST', 'El evento de escrow no tiene los identificadores requeridos.');
  }
  if (!Number.isFinite(payload.monto_bruto) || payload.monto_bruto < 0) {
    throw integrationError('INVALID_ESCROW_REQUEST', 'El monto bruto de escrow no es válido.');
  }
}

function assertEscrowResponse(payload) {
  if (!payload || REQUIRED_RESPONSE_FIELDS.some((key) => payload[key] === undefined || payload[key] === null)) {
    throw integrationError('INVALID_ACCOUNTING_RESPONSE', 'Contabilidad respondió con un formato no reconocido.');
  }
  if (!Number.isFinite(payload.monto_bruto)) {
    throw integrationError('INVALID_ACCOUNTING_RESPONSE', 'Contabilidad respondió con un monto no válido.');
  }
}

function isTimeout(error) {
  return error?.name === 'TimeoutError' || error?.name === 'AbortError';
}

function createAccountingEscrowClient({
  baseUrl,
  enabled = false,
  timeoutMs = 5000,
  fetchImpl = fetch,
} = {}) {
  return {
    async retainEscrow(payload) {
      if (!enabled) {
        throw integrationError('ACCOUNTING_INTEGRATION_DISABLED', 'La integración con Contabilidad está desactivada.');
      }
      if (!baseUrl) {
        throw integrationError('ACCOUNTING_URL_NOT_CONFIGURED', 'La URL de Contabilidad no está configurada.');
      }
      assertEscrowRequest(payload);

      let response;
      try {
        response = await fetchImpl(`${baseUrl}/api/contabilidad/escrow/retener`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (isTimeout(error)) {
          throw integrationError('ACCOUNTING_TIMEOUT', 'Contabilidad no respondió a tiempo.', { cause: error });
        }
        throw integrationError('ACCOUNTING_UNAVAILABLE', 'No fue posible conectar con Contabilidad.', { cause: error });
      }
      if (!response.ok) {
        throw integrationError('ACCOUNTING_HTTP_ERROR', 'Contabilidad rechazó el evento de escrow.', {
          status: response.status,
        });
      }

      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw integrationError('INVALID_ACCOUNTING_RESPONSE', 'Contabilidad no devolvió JSON válido.', { cause: error });
      }
      assertEscrowResponse(data);
      Object.defineProperty(data, '_httpStatus', { value: response.status, enumerable: false });
      return data;
    },
  };
}

module.exports = { createAccountingEscrowClient };
