/**
 * Contrato pendiente con Órdenes. El adaptador deberá validar que el subject
 * JWT es propietario del pedido o de la transacción, sin aceptar IDs del cliente.
 * @typedef {Object} OrderOwnershipPort
 * @property {function({orderId: string, buyerSubject: string}): Promise<boolean>} isOrderOwnedBy
 * @property {function({transactionId: string, buyerSubject: string}): Promise<boolean>} isTransactionOwnedBy
 */
