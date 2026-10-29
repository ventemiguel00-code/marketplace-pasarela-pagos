/**
 * Contrato de consulta de compras preparadas.
 * Un adaptador debe implementar findByOrderId(orderId).
 * Devuelve un resumen o null si la orden no existe.
 * No modifica pedidos ni realiza pagos.
 *
 * @typedef {Object} OrderSummaryPort
 * @property {function(string): Promise<import('../domain/payment-summary') | null>} findByOrderId
 */

module.exports = {};
