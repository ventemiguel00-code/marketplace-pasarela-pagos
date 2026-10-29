const currentOrderId = new URLSearchParams(window.location.search).get('orderId') ?? 'ORD-00125';
let selectedMethodId = null;
let currentAttemptKey = null;
let retryMode = false;
let currentSummary = null;
let paymentInProgress = false;
let unconfirmedAttempt = false;
let isNewCustomerDemo = false;
let reservationQuote = null;
let reservationMethodId = null;
let reservationAttemptKey = null;
let reservationInProgress = false;

function createAttemptKey() {
  const randomPart = crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `attempt:${randomPart}`;
}

function rememberTransactionId(transactionId) {
  try {
    window.PaymentResult.saveLastTransactionId(localStorage, transactionId);
  } catch {
    // La URL también permite recuperar el identificador si localStorage está bloqueado.
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('transactionId', transactionId);
  window.history.replaceState({}, '', nextUrl);
  document.getElementById('status-transaction-id').value = transactionId;
}

function formatCop(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value) + ' COP';
}

async function loadSummary() {
  const message = document.getElementById('summary-status');
  const summaryElement = document.getElementById('purchase-summary');
  // La demo abre ORD-00125; el parámetro permite consultar otra orden preparada.
  summaryElement.hidden = true;
  try {
    const response = await fetch(`/api/payments/summary/${encodeURIComponent(currentOrderId)}`, {
      cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404) {
      message.textContent = 'Orden no encontrada. No hay un resumen disponible para esta compra.';
      return;
    }
    if (!response.ok) throw new Error('No se pudo consultar el resumen.');
    const summary = await response.json();
    currentSummary = summary;
    document.getElementById('order-id').textContent = summary.orderId;
    document.getElementById('recipient').textContent = summary.recipient;
    document.getElementById('product').textContent = summary.product;
    document.getElementById('quantity').textContent = summary.quantity;
    document.getElementById('subtotal-amount').textContent = formatCop(summary.subtotalAmount);
    document.getElementById('shipping-amount').textContent = formatCop(summary.shippingAmount);
    document.getElementById('total-amount').textContent = formatCop(summary.totalAmount);
    message.textContent = '';
    summaryElement.hidden = false;
  } catch {
    message.textContent = 'No se pudo cargar el resumen. Comprueba que el backend esté disponible.';
  }
}

loadSummary();

async function loadReservationQuote() {
  const panel = document.getElementById('reservation-panel');
  const status = document.getElementById('reservation-status');
  panel.hidden = false;
  status.textContent = 'Consultando valores de la reserva…';
  document.getElementById('reservation-quote').hidden = true;
  document.getElementById('reservation-methods').hidden = true;
  document.getElementById('confirm-reservation').disabled = true;

  try {
    const response = await fetch(
      `/api/payments/reservations/quote/${encodeURIComponent(currentOrderId)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) throw new Error('No se pudo consultar la reserva.');
    reservationQuote = await response.json();
    document.getElementById('reservation-product').textContent = reservationQuote.product;
    document.getElementById('reservation-total').textContent = formatCop(reservationQuote.totalAmount);
    document.getElementById('reservation-advance').textContent = formatCop(reservationQuote.advanceAmount);
    document.getElementById('reservation-balance').textContent = formatCop(reservationQuote.balanceAmount);
    status.textContent = 'Selecciona PSE o Código QR para simular el anticipo.';
    document.getElementById('reservation-quote').hidden = false;
    document.getElementById('reservation-methods').hidden = false;
  } catch {
    status.textContent = 'No fue posible preparar la reserva. Comprueba el backend.';
  }
}

document.getElementById('open-reservation').addEventListener('click', loadReservationQuote);

document.querySelectorAll('input[name="reservation-method"]').forEach((input) => {
  input.addEventListener('change', () => {
    reservationMethodId = input.value;
    document.querySelectorAll('.reservation-method-options .method-option').forEach((option) => {
      option.classList.toggle('selected', option.contains(input));
    });
    document.getElementById('confirm-reservation').disabled = false;
  });
});

async function processReservation() {
  if (!reservationQuote || !reservationMethodId || reservationInProgress) return;
  const button = document.getElementById('confirm-reservation');
  const result = document.getElementById('reservation-result');
  reservationInProgress = true;
  button.disabled = true;
  document.querySelectorAll('input[name="reservation-method"]').forEach((input) => {
    input.disabled = true;
  });
  result.hidden = false;
  result.className = 'payment-result';
  document.getElementById('reservation-result-title').textContent = 'Procesando anticipo…';
  document.getElementById('reservation-transaction-id').textContent = '';
  renderTransactionDetails(result, null);
  renderRetryAction(result, null);
  if (!reservationAttemptKey) reservationAttemptKey = createAttemptKey();

  try {
    const response = await fetch('/api/payments/reservations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': reservationAttemptKey,
      },
      body: JSON.stringify({ orderId: currentOrderId, methodId: reservationMethodId }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('No se pudo procesar el anticipo.');
    const transaction = await response.json();
    const presentation = window.PaymentResult.getPaymentResultPresentation(
      transaction.status,
      transaction.transactionId,
      transaction,
    );
    rememberTransactionId(transaction.transactionId);
    document.getElementById('status-query-result').hidden = true;
    result.classList.add(presentation.className);
    document.getElementById('reservation-result-title').textContent = presentation.title;
    document.getElementById('reservation-transaction-id').textContent = presentation.transactionText;
    renderTransactionDetails(result, transaction);
    renderRetryAction(result, transaction);
    reservationAttemptKey = null;
    reservationInProgress = false;
  } catch {
    const presentation = window.PaymentResult.getUnconfirmedPaymentPresentation();
    result.classList.add(presentation.className);
    document.getElementById('reservation-result-title').textContent =
      'Estado del anticipo sin confirmar';
    document.getElementById('reservation-transaction-id').textContent =
      presentation.transactionText;
    reservationInProgress = false;
    button.disabled = false;
  }
}

document.getElementById('confirm-reservation').addEventListener('click', processReservation);

async function loadPaymentMethods() {
  const message = document.getElementById('methods-status');
  const fieldset = document.getElementById('payment-methods');
  const options = document.getElementById('payment-method-options');
  const selectionStatus = document.getElementById('selection-status');
  const paymentButton = document.getElementById('process-payment');

  try {
    const response = await fetch('/api/payments/methods', {
      cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('No se pudieron consultar los métodos.');
    const data = await response.json();

    for (const method of data.methods) {
      const label = document.createElement('label');
      label.className = 'method-option';
      label.dataset.methodId = method.id;
      label.hidden = method.id === 'cod' && !isNewCustomerDemo;

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'payment-method';
      input.value = method.id;
      input.disabled = unconfirmedAttempt || (method.id === 'cod' && !isNewCustomerDemo);

      const name = document.createElement('span');
      name.textContent = method.name;
      label.append(input, name);
      options.append(label);

      input.addEventListener('change', () => {
        selectedMethodId = method.id;
        document.querySelectorAll('.method-option').forEach((option) => {
          option.classList.toggle('selected', option.contains(input));
        });
        selectionStatus.textContent = `Método seleccionado: ${method.name}`;
        paymentButton.disabled = false;
        paymentButton.textContent = method.id === 'cod'
          ? 'Confirmar pago contra entrega'
          : (retryMode ? 'Confirmar nuevo intento' : 'Realizar pago');
        document.getElementById('cod-explanation').hidden = method.id !== 'cod';
        document.getElementById('cancelled-operation').hidden = true;
        renderPendingPaymentReview(method.name);
      });
    }

    message.textContent = '';
    fieldset.hidden = false;
  } catch {
    message.textContent = 'No se pudieron cargar los métodos de pago disponibles.';
    selectionStatus.textContent = '';
  }
}

loadPaymentMethods();

document.getElementById('new-customer-demo').addEventListener('change', (event) => {
  isNewCustomerDemo = event.target.checked;
  const codOption = document.querySelector('.method-option[data-method-id="cod"]');
  const codInput = codOption?.querySelector('input');
  if (codOption) codOption.hidden = !isNewCustomerDemo;
  if (codInput) codInput.disabled = unconfirmedAttempt || !isNewCustomerDemo;

  if (!isNewCustomerDemo && selectedMethodId === 'cod') {
    clearMethodSelection('Pago contra entrega está disponible en la simulación de cliente nuevo.');
  }
});

async function processSelectedPayment() {
  if (!selectedMethodId || paymentInProgress) return;

  const paymentButton = document.getElementById('process-payment');
  const paymentResult = document.getElementById('payment-result');
  const resultTitle = document.getElementById('payment-result-title');
  const transactionId = document.getElementById('payment-transaction-id');
  paymentInProgress = true;
  paymentButton.disabled = true;
  setMethodInputsDisabled(true);
  setReviewActionsDisabled(true);
  document.getElementById('cancel-confirmation').hidden = true;
  paymentResult.hidden = false;
  paymentResult.className = 'payment-result';
  resultTitle.textContent = 'Procesando transacción…';
  transactionId.textContent = '';
  renderSuccessfulPayment(paymentResult, null);
  renderTransactionDetails(paymentResult, null);
  renderRetryAction(paymentResult, null);
  if (!currentAttemptKey) currentAttemptKey = createAttemptKey();

  try {
    const response = await fetch('/api/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': currentAttemptKey,
      },
      body: JSON.stringify({
        orderId: currentOrderId,
        methodId: selectedMethodId,
        customerType: isNewCustomerDemo ? 'NEW_CUSTOMER_DEMO' : undefined,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('No se pudo procesar la transacción.');
    const transaction = await response.json();
    const presentation = window.PaymentResult.getPaymentResultPresentation(
      transaction.status,
      transaction.transactionId,
      transaction,
    );
    rememberTransactionId(transaction.transactionId);
    // Evita mezclar una consulta anterior con el resultado recién registrado.
    document.getElementById('status-query-result').hidden = true;
    paymentResult.classList.add(presentation.className);
    resultTitle.textContent = presentation.title;
    transactionId.textContent = presentation.transactionText;
    renderSuccessfulPayment(paymentResult, transaction);
    renderTransactionDetails(paymentResult, transaction);
    renderRetryAction(paymentResult, transaction);
    currentAttemptKey = null;
    retryMode = false;
    paymentInProgress = false;
    unconfirmedAttempt = false;
    document.getElementById('pending-payment-review').hidden = true;
    paymentButton.textContent = 'Realizar pago';
  } catch {
    const presentation = window.PaymentResult.getUnconfirmedPaymentPresentation();
    paymentResult.classList.add(presentation.className);
    resultTitle.textContent = presentation.title;
    transactionId.textContent = presentation.transactionText;
    renderSuccessfulPayment(paymentResult, null);
    renderTransactionDetails(paymentResult, null);
    renderRetryAction(paymentResult, null);
    paymentInProgress = false;
    unconfirmedAttempt = true;
    setMethodInputsDisabled(true);
    document.getElementById('pending-payment-review').hidden = true;
    paymentButton.disabled = false;
    paymentButton.textContent = 'Consultar resultado del intento';
  }
}

document.getElementById('process-payment').addEventListener('click', processSelectedPayment);

function showStatusQueryResult(presentation, transaction = null) {
  const result = document.getElementById('status-query-result');
  result.hidden = false;
  result.className = `payment-result ${presentation.className}`;
  document.getElementById('status-query-title-result').textContent = presentation.title;
  document.getElementById('status-query-transaction').textContent = presentation.transactionText;
  renderSuccessfulPayment(result, transaction);
  renderTransactionDetails(result, transaction);
  renderRetryAction(result, transaction);
}

function renderSuccessfulPayment(container, transaction) {
  container.querySelector('.success-confirmation')?.remove();
  const confirmation = window.PaymentResult.getSuccessfulPaymentConfirmation(transaction);
  if (!confirmation) return;

  const card = document.createElement('div');
  card.className = 'success-confirmation';

  const heading = document.createElement('div');
  heading.className = 'success-confirmation-heading';
  const icon = document.createElement('span');
  icon.className = 'success-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '✓';
  const title = document.createElement('strong');
  title.textContent = confirmation.title;
  heading.append(icon, title);

  const details = document.createElement('dl');
  details.className = 'confirmation-details';
  const rows = [
    ['Transacción', confirmation.transactionId],
    ['Pedido', confirmation.orderId],
    ['Total pagado', confirmation.amount == null ? null : formatCop(confirmation.amount)],
    ['Método', confirmation.methodName],
    ['Estado', confirmation.statusText],
  ];
  for (const [label, value] of rows) {
    if (value === null || value === undefined || value === '') continue;
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    details.append(row);
  }

  card.append(heading, details);
  container.append(card);
}

function renderPendingPaymentReview(methodName) {
  if (!currentSummary || unconfirmedAttempt || paymentInProgress) return;
  const review = window.PaymentResult.getPaymentReview({
    orderId: currentSummary.orderId,
    amount: currentSummary.totalAmount,
    methodId: selectedMethodId,
  });
  document.getElementById('review-order-id').textContent = review.orderId;
  document.getElementById('review-amount').textContent = formatCop(review.amount);
  document.getElementById('review-method').textContent = methodName ?? review.methodName;
  document.getElementById('cancel-confirmation').hidden = true;
  document.getElementById('pending-payment-review').hidden = false;
  setReviewActionsDisabled(false);
}

function renderTransactionDetails(container, transaction) {
  container.querySelector('.transaction-details')?.remove();
  if (!transaction) return;
  const reservation = window.PaymentResult.getReservationInformation(transaction);
  if (reservation) {
    const registeredAdvance = formatCop(reservation.registeredAdvanceAmount);
    appendTransactionDetails(container, 'Reserva de demostración', [
      ['Transacción', reservation.transactionId],
      ['Pedido', reservation.orderId],
      ['Producto', reservation.product],
      ['Precio total', formatCop(reservation.totalAmount)],
      ['Anticipo solicitado', formatCop(reservation.requestedAdvanceAmount)],
      ['Anticipo registrado', registeredAdvance],
      ['Saldo pendiente', formatCop(reservation.balanceAmount)],
      ['Método', reservation.methodName],
      ['Estado del anticipo', reservation.paymentStatusText],
      ['Estado de la reserva', reservation.reservationStatusText],
    ]);
    return;
  }
  if (transaction.status === 'APPROVED') return;
  const information = window.PaymentResult.getTransactionInformation(transaction);
  appendTransactionDetails(container, 'Información de la transacción', [
    ['Transacción', information.transactionId],
    ['Pedido', information.orderId],
    ['Valor', formatCop(information.amount)],
    ['Método', information.methodName],
    ['Estado', information.statusText],
  ]);
}

function appendTransactionDetails(container, title, rows) {
  const section = document.createElement('div');
  section.className = 'transaction-details';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const details = document.createElement('dl');
  details.className = 'operation-details';
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    details.append(row);
  }
  section.append(heading, details);
  container.append(section);
}

function renderRetryAction(container, transaction) {
  container.querySelector('.retry-payment')?.remove();
  if (!window.PaymentResult.canRetryPayment(transaction)) return;

  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'retry-payment';
  retryButton.textContent = transaction.reservationStatus
    ? 'Intentar el anticipo nuevamente'
    : 'Intentar pagar nuevamente';
  retryButton.addEventListener(
    'click',
    transaction.reservationStatus ? beginReservationRetry : beginRetry,
  );
  container.append(retryButton);
}

function setReviewActionsDisabled(disabled) {
  document.getElementById('change-payment-method').disabled = disabled;
  document.getElementById('cancel-operation').disabled = disabled;
}

function setMethodInputsDisabled(disabled) {
  document.querySelectorAll('input[name="payment-method"]').forEach((input) => {
    input.disabled = disabled || (input.value === 'cod' && !isNewCustomerDemo);
  });
}

function clearMethodSelection(message) {
  selectedMethodId = null;
  document.querySelectorAll('input[name="payment-method"]').forEach((input) => {
    input.checked = false;
  });
  document.querySelectorAll('.method-option').forEach((option) => {
    option.classList.remove('selected');
  });
  document.getElementById('selection-status').textContent = message;
  document.getElementById('pending-payment-review').hidden = true;
  document.getElementById('cancel-confirmation').hidden = true;
  document.getElementById('cod-explanation').hidden = true;
  document.getElementById('process-payment').disabled = true;
}

document.getElementById('change-payment-method').addEventListener('click', () => {
  if (paymentInProgress || unconfirmedAttempt) return;
  currentAttemptKey = null;
  clearMethodSelection('Selecciona otro método de pago.');
});

document.getElementById('cancel-operation').addEventListener('click', () => {
  if (paymentInProgress || unconfirmedAttempt) return;
  document.getElementById('cancel-confirmation').hidden = false;
  document.getElementById('process-payment').disabled = true;
});

document.getElementById('continue-payment').addEventListener('click', () => {
  document.getElementById('cancel-confirmation').hidden = true;
  document.getElementById('process-payment').disabled = !selectedMethodId;
});

document.getElementById('confirm-cancel').addEventListener('click', () => {
  if (paymentInProgress || unconfirmedAttempt) return;
  currentAttemptKey = null;
  retryMode = false;
  clearMethodSelection('Ningún método seleccionado.');
  document.getElementById('process-payment').textContent = 'Realizar pago';
  document.getElementById('cancelled-operation').hidden = false;
});

document.getElementById('return-to-summary').addEventListener('click', () => {
  document.getElementById('cancelled-operation').hidden = true;
  document.getElementById('purchase-summary').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

function beginRetry() {
  retryMode = true;
  currentAttemptKey = null;
  selectedMethodId = null;
  unconfirmedAttempt = false;
  setMethodInputsDisabled(false);
  document.getElementById('cancelled-operation').hidden = true;
  document.getElementById('pending-payment-review').hidden = true;
  document.getElementById('cod-explanation').hidden = true;
  document.querySelectorAll('.retry-payment').forEach((button) => button.remove());
  document.querySelectorAll('input[name="payment-method"]').forEach((input) => {
    input.checked = false;
  });
  document.querySelectorAll('.method-option').forEach((option) => {
    option.classList.remove('selected');
  });
  document.getElementById('selection-status').textContent =
    'Selecciona el método para el nuevo intento.';
  const paymentButton = document.getElementById('process-payment');
  paymentButton.textContent = 'Confirmar nuevo intento';
  paymentButton.disabled = true;
  document.getElementById('payment-methods').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function beginReservationRetry() {
  reservationAttemptKey = null;
  reservationMethodId = null;
  reservationInProgress = false;
  document.querySelectorAll('input[name="reservation-method"]').forEach((input) => {
    input.checked = false;
    input.disabled = false;
  });
  document.querySelectorAll('.reservation-method-options .method-option').forEach((option) => {
    option.classList.remove('selected');
  });
  document.getElementById('reservation-result').hidden = true;
  await loadReservationQuote();
  document.getElementById('reservation-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function queryPaymentStatus(transactionId) {
  const normalizedId = transactionId.trim().toUpperCase();
  if (!normalizedId) return;

  showStatusQueryResult({
    title: 'Consultando estado…',
    className: '',
    transactionText: `Transacción: ${normalizedId}`,
  });

  try {
    const response = await fetch(
      `/api/payments/transactions/${encodeURIComponent(normalizedId)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(5000) },
    );
    if (response.status === 404) {
      showStatusQueryResult({
        title: 'Transacción no encontrada',
        className: 'unconfirmed',
        transactionText: `No se encontró el identificador ${normalizedId}.`,
      });
      return;
    }
    if (response.status === 400) {
      showStatusQueryResult({
        title: 'Identificador no válido',
        className: 'unconfirmed',
        transactionText: 'Verifica el identificador e intenta nuevamente.',
      });
      return;
    }
    if (!response.ok) throw new Error('No se pudo consultar la transacción.');

    const transaction = await response.json();
    const presentation = window.PaymentResult.getPaymentResultPresentation(
      transaction.status,
      transaction.transactionId,
      transaction,
    );
    rememberTransactionId(transaction.transactionId);
    unconfirmedAttempt = false;
    setMethodInputsDisabled(false);
    showStatusQueryResult(presentation, transaction);
  } catch {
    unconfirmedAttempt = true;
    setMethodInputsDisabled(true);
    document.getElementById('pending-payment-review').hidden = true;
    document.getElementById('process-payment').disabled = true;
    showStatusQueryResult(
      window.PaymentResult.getUnconfirmedPaymentPresentation(normalizedId),
    );
  }
}

document.getElementById('payment-status-form').addEventListener('submit', (event) => {
  event.preventDefault();
  queryPaymentStatus(document.getElementById('status-transaction-id').value);
});

const transactionIdFromUrl = new URLSearchParams(window.location.search).get('transactionId');
let lastTransactionId = transactionIdFromUrl;

if (!lastTransactionId) {
  try {
    lastTransactionId = window.PaymentResult.getLastTransactionId(localStorage);
  } catch {
    // La consulta manual permanece disponible si el almacenamiento está bloqueado.
  }
}

if (lastTransactionId) {
  document.getElementById('status-transaction-id').value = lastTransactionId;
  queryPaymentStatus(lastTransactionId);
}
