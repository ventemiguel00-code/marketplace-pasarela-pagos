/**
 * Contrato para registrar y consultar transacciones procesadas.
 *
 * @typedef {Object} PaymentTransactionRepositoryPort
 * @property {function(import('../domain/payment-transaction')): Promise<import('../domain/payment-transaction')>} save
 * @property {function(string): Promise<import('../domain/payment-transaction') | null>} findByTransactionId
 * @property {function(string): Promise<import('../domain/payment-transaction') | null>} findByIdempotencyKey
 */

module.exports = {};
