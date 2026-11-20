function integrationError(code, message, options = {}) {
  const error = new Error(message, options.cause ? { cause: options.cause } : undefined);
  error.code = code;
  error.status = options.status;
  return error;
}

function createTrackingClient({ baseUrl, enabled = false, timeoutMs = 5000, fetchImpl = fetch } = {}) {
  return {
    async updateStatus({ trackingNumber, status, accessToken = null }) {
      if (!enabled) throw integrationError('TRACKING_INTEGRATION_DISABLED', 'La integración con Seguimiento está desactivada.');
      if (!baseUrl) throw integrationError('TRACKING_URL_NOT_CONFIGURED', 'La URL de Seguimiento no está configurada.');
      if (typeof trackingNumber !== 'string' || !trackingNumber.trim() || typeof status !== 'string' || !status.trim()) {
        throw integrationError('INVALID_TRACKING_REQUEST', 'Seguimiento requiere numero_guia y estado.');
      }
      try {
        const response = await fetchImpl(`${baseUrl}/api/seguimiento/${encodeURIComponent(trackingNumber)}/estado`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          body: JSON.stringify({ estado: status }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw integrationError('TRACKING_HTTP_ERROR', 'Seguimiento rechazó la actualización.', { status: response.status });
        const data = await response.json();
        Object.defineProperty(data, '_httpStatus', { value: response.status, enumerable: false });
        return data;
      } catch (error) {
        if (error.code) throw error;
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw integrationError('TRACKING_TIMEOUT', 'Seguimiento no respondió a tiempo.', { cause: error });
        throw integrationError('TRACKING_UNAVAILABLE', 'No fue posible conectar con Seguimiento.', { cause: error });
      }
    },
  };
}

module.exports = { createTrackingClient };
