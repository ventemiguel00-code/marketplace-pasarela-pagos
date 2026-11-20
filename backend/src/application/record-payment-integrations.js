function event(transaction, eventType, targetService, payload) {
  return {
    eventId: `${transaction.transactionId}:${eventType}`,
    transactionId: transaction.transactionId,
    orderId: transaction.orderId,
    eventType,
    targetService,
    payload,
  };
}

function planEvents({ transaction, orderSummary, operationType, confirmedOrderStatus, inventoryResponsibility, trackingStatus }) {
  const events = [];
  const buyerId = orderSummary?.buyerId;
  const sellerId = orderSummary?.sellerId;
  const fullPayment = operationType === 'PAYMENT';

  if (transaction.status === 'APPROVED' && fullPayment) {
    if (buyerId && sellerId) {
      events.push(event(transaction, 'ACCOUNTING_ESCROW_RETAIN', 'ACCOUNTING', {
        pedido_id: transaction.orderId,
        vendedor_id: sellerId,
        comprador_id: buyerId,
        monto_bruto: transaction.amount,
      }));
    }
    if (confirmedOrderStatus) {
      events.push(event(transaction, 'ORDER_STATUS_UPDATE', 'ORDERS', {
        orderId: transaction.orderId,
        status: confirmedOrderStatus,
      }));
    }
    if (buyerId) {
      events.push(event(transaction, 'NOTIFY_PAYMENT_APPROVED', 'NOTIFICATIONS', {
        usuario_id: buyerId,
        tipo: 'PAGO_APROBADO',
        titulo: 'Pago aprobado',
        mensaje: 'Tu pago fue aprobado correctamente.',
        referencia_id: transaction.orderId,
        referencia_tipo: 'ORDEN',
      }));
    }
    if (inventoryResponsibility && orderSummary?.inventoryReferenceId) {
      events.push(event(transaction, 'INVENTORY_RESERVATION_CONFIRM', 'INVENTORY', {
        referenceId: String(orderSummary.inventoryReferenceId),
      }));
    }
    if (trackingStatus && orderSummary?.trackingNumber) {
      events.push(event(transaction, 'TRACKING_STATUS_UPDATE', 'TRACKING', {
        trackingNumber: String(orderSummary.trackingNumber),
        status: trackingStatus,
      }));
    }
  } else if (transaction.status === 'REJECTED' && buyerId) {
    events.push(event(transaction, 'NOTIFY_PAYMENT_REJECTED', 'NOTIFICATIONS', {
      usuario_id: buyerId,
      tipo: 'PAGO_RECHAZADO',
      titulo: 'Pago rechazado',
      mensaje: 'El intento de pago fue rechazado.',
      referencia_id: transaction.orderId,
      referencia_tipo: 'ORDEN',
    }));
  }
  return events;
}

function createRecordPaymentIntegrations({
  outboxPort,
  dispatcher = null,
  confirmedOrderStatus = null,
  inventoryResponsibility = false,
  trackingStatus = null,
}) {
  return async function recordPaymentIntegrations({ transaction, orderSummary, operationType = 'PAYMENT', authContext = {} }) {
    const planned = planEvents({
      transaction, orderSummary, operationType, confirmedOrderStatus,
      inventoryResponsibility, trackingStatus,
    });
    if (planned.length === 0) return [];
    const inserted = await outboxPort.enqueue(planned);
    if (dispatcher && inserted.length > 0) {
      await dispatcher.dispatch(inserted, authContext);
    }
    return inserted;
  };
}

module.exports = { createRecordPaymentIntegrations, planEvents };
