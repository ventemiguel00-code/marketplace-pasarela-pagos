function serviceUnavailable(res) {
  return res.status(503).json({ error: 'La verificación de propiedad del pedido no está disponible' });
}

function createRequestAuthorization({ orderOwnershipPort = null } = {}) {
  async function authorizeOrder(req, res, next) {
    if (!req.auth) return next();
    if (!orderOwnershipPort?.isOrderOwnedBy) return serviceUnavailable(res);
    try {
      const owned = await orderOwnershipPort.isOrderOwnedBy({
        orderId: req.params.orderId ?? req.body.orderId,
        buyerSubject: req.auth.subject,
      });
      return owned ? next() : res.status(403).json({ error: 'No tienes acceso a este pedido' });
    } catch {
      return serviceUnavailable(res);
    }
  }

  async function authorizeTransaction(req, res, next) {
    if (!req.auth) return next();
    if (!orderOwnershipPort?.isTransactionOwnedBy) return serviceUnavailable(res);
    try {
      const owned = await orderOwnershipPort.isTransactionOwnedBy({
        transactionId: req.params.transactionId,
        buyerSubject: req.auth.subject,
      });
      return owned ? next() : res.status(403).json({ error: 'No tienes acceso a esta transacción' });
    } catch {
      return serviceUnavailable(res);
    }
  }

  return { authorizeOrder, authorizeTransaction };
}

module.exports = { createRequestAuthorization };
