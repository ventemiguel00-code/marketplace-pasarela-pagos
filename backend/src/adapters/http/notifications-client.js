const NOTIFICATION_TYPES = new Set([
  'ORDEN_CREADA', 'PAGO_APROBADO', 'PAGO_RECHAZADO', 'ENVIO_EN_TRANSITO',
  'ENVIO_ENTREGADO', 'STOCK_BAJO', 'DEVOLUCION_SOLICITADA', 'REEMBOLSO_PROCESADO',
  'ESCROW_LIBERADO', 'INCIDENCIA_PQR', 'SISTEMA_INFO',
]);
const REQUIRED_RESPONSE_FIELDS = ['id', 'usuario_id', 'tipo', 'titulo', 'mensaje', 'leido', 'creado_en'];

function integrationError(code, message, options = {}) {
  const error = new Error(message, options.cause ? { cause: options.cause } : undefined);
  error.code = code;
  error.status = options.status;
  return error;
}

function assertNotificationRequest(payload) {
  if (!payload || typeof payload.usuario_id !== 'string' || !payload.usuario_id.trim()) {
    throw integrationError('INVALID_NOTIFICATION_REQUEST', 'La notificación requiere usuario_id.');
  }
  if (!NOTIFICATION_TYPES.has(payload.tipo)) {
    throw integrationError('INVALID_NOTIFICATION_REQUEST', 'El tipo de notificación no es válido.');
  }
  if (typeof payload.titulo !== 'string' || !payload.titulo.trim() || payload.titulo.length > 200) {
    throw integrationError('INVALID_NOTIFICATION_REQUEST', 'El título de la notificación no es válido.');
  }
  if (typeof payload.mensaje !== 'string' || !payload.mensaje.trim()) {
    throw integrationError('INVALID_NOTIFICATION_REQUEST', 'La notificación requiere mensaje.');
  }
}

function assertNotificationResponse(payload) {
  if (!payload || REQUIRED_RESPONSE_FIELDS.some((key) => payload[key] === undefined || payload[key] === null)) {
    throw integrationError('INVALID_NOTIFICATIONS_RESPONSE', 'Notificaciones respondió con un formato no reconocido.');
  }
}

function isTimeout(error) {
  return error?.name === 'TimeoutError' || error?.name === 'AbortError';
}

function createNotificationsClient({
  baseUrl,
  enabled = false,
  timeoutMs = 5000,
  fetchImpl = fetch,
} = {}) {
  return {
    async createNotification(payload) {
      if (!enabled) {
        throw integrationError('NOTIFICATIONS_INTEGRATION_DISABLED', 'La integración con Notificaciones está desactivada.');
      }
      if (!baseUrl) {
        throw integrationError('NOTIFICATIONS_URL_NOT_CONFIGURED', 'La URL de Notificaciones no está configurada.');
      }
      assertNotificationRequest(payload);

      let response;
      try {
        response = await fetchImpl(`${baseUrl}/api/notificaciones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (isTimeout(error)) {
          throw integrationError('NOTIFICATIONS_TIMEOUT', 'Notificaciones no respondió a tiempo.', { cause: error });
        }
        throw integrationError('NOTIFICATIONS_UNAVAILABLE', 'No fue posible conectar con Notificaciones.', { cause: error });
      }
      if (!response.ok) {
        throw integrationError('NOTIFICATIONS_HTTP_ERROR', 'Notificaciones rechazó el evento.', {
          status: response.status,
        });
      }

      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw integrationError('INVALID_NOTIFICATIONS_RESPONSE', 'Notificaciones no devolvió JSON válido.', { cause: error });
      }
      assertNotificationResponse(data);
      return data;
    },
  };
}

module.exports = { createNotificationsClient };
