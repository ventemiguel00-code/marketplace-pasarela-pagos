const PaymentSummary = require('../../domain/payment-summary');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function integrationError(code, message, options = {}) {
  const error = new Error(message, options.cause ? { cause: options.cause } : undefined);
  error.code = code;
  error.status = options.status;
  return error;
}

function unwrapOrder(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.data?.orden ?? payload.data?.order ?? payload.orden ?? payload.order ?? payload.data ?? payload;
}

function firstDefined(source, keys) {
  return keys.map((key) => source?.[key]).find((value) => value !== undefined && value !== null);
}

function normalizeAmount(value) {
  const amount = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(amount) ? amount : null;
}

function getOrderIdentity(order) {
  return {
    orderId: String(firstDefined(order, ['pedido_id', 'orden_id', 'order_id', 'id']) ?? ''),
    buyerId: String(firstDefined(order, ['comprador_id', 'buyer_id', 'cliente_id', 'usuario_id']) ?? ''),
    sellerId: String(firstDefined(order, ['vendedor_id', 'seller_id', 'comercio_id']) ?? ''),
    inventoryReferenceId: firstDefined(order, ['referencia_id', 'reserva_id', 'inventory_reference_id']) ?? null,
    trackingNumber: firstDefined(order, ['numero_guia', 'tracking_number']) ?? null,
  };
}

function toPaymentSummary(order, requestedOrderId) {
  const identity = getOrderIdentity(order);
  const items = firstDefined(order, ['items', 'detalles', 'productos']);
  const firstItem = Array.isArray(items) ? items[0] : null;
  const totalAmount = normalizeAmount(firstDefined(order, ['monto_total', 'total', 'total_amount', 'valor_total']));
  if (!identity.orderId || identity.orderId !== requestedOrderId || totalAmount === null || totalAmount < 0) {
    throw integrationError('INVALID_ORDERS_RESPONSE', 'Órdenes respondió con un pedido incompleto o inconsistente.');
  }

  const subtotalAmount = normalizeAmount(firstDefined(order, ['subtotal', 'subtotal_amount'])) ?? totalAmount;
  const shippingAmount = normalizeAmount(firstDefined(order, ['costo_envio', 'shipping_amount', 'envio'])) ?? 0;
  const quantity = Number(firstDefined(firstItem, ['cantidad', 'quantity']) ?? firstDefined(order, ['cantidad', 'quantity']) ?? 1);
  const summary = new PaymentSummary({
    orderId: identity.orderId,
    recipient: String(firstDefined(order, ['comercio', 'nombre_comercio', 'vendedor_nombre', 'recipient']) ?? 'Marketplace USC'),
    product: String(firstDefined(firstItem, ['nombre', 'producto', 'product_name']) ?? firstDefined(order, ['producto', 'product', 'descripcion']) ?? 'Compra Marketplace'),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    subtotalAmount,
    shippingAmount,
    totalAmount,
  });
  Object.assign(summary, identity, { rawOrder: order });
  return summary;
}

function isTimeout(error) {
  return error?.name === 'TimeoutError' || error?.name === 'AbortError';
}

function createOrdersClient({ baseUrl, enabled = false, timeoutMs = 5000, fetchImpl = fetch } = {}) {
  async function request(orderId, accessToken, options = {}) {
    if (!enabled) throw integrationError('ORDERS_INTEGRATION_DISABLED', 'La integración con Órdenes está desactivada.');
    if (!baseUrl) throw integrationError('ORDERS_URL_NOT_CONFIGURED', 'La URL de Órdenes no está configurada.');
    if (!UUID_PATTERN.test(orderId)) throw integrationError('INVALID_ORDER_ID', 'Órdenes requiere un identificador UUID.');
    if (typeof accessToken !== 'string' || !accessToken) throw integrationError('ORDERS_AUTH_REQUIRED', 'Órdenes requiere autenticación del comprador.');
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/api/ordenes/${encodeURIComponent(orderId)}${options.path ?? ''}`, {
        method: options.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (isTimeout(error)) throw integrationError('ORDERS_TIMEOUT', 'Órdenes no respondió a tiempo.', { cause: error });
      throw integrationError('ORDERS_UNAVAILABLE', 'No fue posible conectar con Órdenes.', { cause: error });
    }
    if (response.status === 404 && !options.body) return null;
    if (!response.ok) throw integrationError('ORDERS_HTTP_ERROR', 'Órdenes rechazó la operación.', { status: response.status });
    try {
      const data = await response.json();
      if (data && typeof data === 'object') Object.defineProperty(data, '_httpStatus', { value: response.status, enumerable: false });
      return data;
    } catch (error) {
      throw integrationError('INVALID_ORDERS_RESPONSE', 'Órdenes no devolvió JSON válido.', { cause: error });
    }
  }

  return {
    async getOrder({ orderId, accessToken }) {
      const payload = await request(orderId, accessToken);
      return payload ? unwrapOrder(payload) : null;
    },
    async findByOrderId(orderId, context = {}) {
      const order = context.order ?? await this.getOrder({ orderId, accessToken: context.accessToken });
      return order ? toPaymentSummary(order, orderId) : null;
    },
    async isOrderOwnedBy({ orderId, buyerSubject, accessToken }) {
      const order = await this.getOrder({ orderId, accessToken });
      if (!order) return false;
      return getOrderIdentity(order).buyerId === buyerSubject;
    },
    async updateStatus({ orderId, status, accessToken }) {
      if (typeof status !== 'string' || !status.trim()) {
        throw integrationError('INVALID_ORDER_STATUS', 'No se configuró un estado autorizado para Órdenes.');
      }
      const payload = await request(orderId, accessToken, {
        method: 'PUT', path: '/estado', body: { nuevo_estado: status },
      });
      const data = unwrapOrder(payload);
      if (data && typeof data === 'object') Object.defineProperty(data, '_httpStatus', { value: payload._httpStatus, enumerable: false });
      return data;
    },
  };
}

module.exports = { createOrdersClient, getOrderIdentity, toPaymentSummary, UUID_PATTERN };
