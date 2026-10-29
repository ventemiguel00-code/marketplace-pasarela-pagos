/**
 * Contrato para consultar los métodos de pago disponibles.
 * Un adaptador debe implementar findAll().
 *
 * @typedef {Object} PaymentMethodPort
 * @property {function(): Promise<import('../domain/payment-method')[]>} findAll
 */

module.exports = {};
