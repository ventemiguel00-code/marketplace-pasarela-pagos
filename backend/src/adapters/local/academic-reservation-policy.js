// Valor de prueba para la sustentación. No es una regla comercial oficial.
const ACADEMIC_ADVANCE_AMOUNT = 50000;

/** @type {import('../../ports/reservation-policy-port').ReservationPolicyPort} */
const academicReservationPolicy = {
  async getAdvanceAmount() {
    return ACADEMIC_ADVANCE_AMOUNT;
  },
};

module.exports = { academicReservationPolicy, ACADEMIC_ADVANCE_AMOUNT };
