// Método disponible para seleccionar antes del pago. No contiene datos sensibles.
class PaymentMethod {
  constructor({ id, name }) {
    this.id = id;
    this.name = name;
  }
}

module.exports = PaymentMethod;
