function integrationError(code, message, options = {}) {
  const error = new Error(message, options.cause ? { cause: options.cause } : undefined);
  error.code = code;
  error.status = options.status;
  return error;
}

function createInventoryClient({ baseUrl, enabled = false, timeoutMs = 5000, fetchImpl = fetch } = {}) {
  return {
    async confirmReservation({ referenceId, accessToken = null }) {
      if (!enabled) throw integrationError('INVENTORY_INTEGRATION_DISABLED', 'La integración con Inventario está desactivada.');
      if (!baseUrl) throw integrationError('INVENTORY_URL_NOT_CONFIGURED', 'La URL de Inventario no está configurada.');
      if (typeof referenceId !== 'string' || !referenceId.trim()) throw integrationError('INVALID_INVENTORY_REQUEST', 'Inventario requiere referencia_id.');
      try {
        const response = await fetchImpl(`${baseUrl}/api/inventario/confirmar/${encodeURIComponent(referenceId)}`, {
          method: 'POST',
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw integrationError('INVENTORY_HTTP_ERROR', 'Inventario rechazó la confirmación.', { status: response.status });
        const data = await response.json();
        Object.defineProperty(data, '_httpStatus', { value: response.status, enumerable: false });
        return data;
      } catch (error) {
        if (error.code) throw error;
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw integrationError('INVENTORY_TIMEOUT', 'Inventario no respondió a tiempo.', { cause: error });
        throw integrationError('INVENTORY_UNAVAILABLE', 'No fue posible conectar con Inventario.', { cause: error });
      }
    },
  };
}

module.exports = { createInventoryClient };
