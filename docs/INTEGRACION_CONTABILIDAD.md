# Integración propuesta con Contabilidad

Este documento explica el módulo académico de Pasarela de Pagos del Grupo 2. No hay
una integración activa con Contabilidad y no se procesan pagos reales.

## Información que guarda Pagos

La tabla `payment_transactions` puede guardar:

- `transaction_id`: identificador único de la transacción.
- `order_id`: identificador del pedido.
- `method_id`: `pse`, `qr` o `cod`.
- `amount`: valor intentado o registrado en COP.
- `status`: `APPROVED`, `REJECTED` o `PENDING_COD`.
- `created_at`: fecha y hora de PostgreSQL.
- `idempotency_key`: clave opcional y única contra duplicados.
- Para anticipos: producto, valor total, saldo y estado de reserva.

No almacena números de tarjeta, cuentas bancarias ni datos bancarios sensibles.

## Estados que Contabilidad debe diferenciar

- `APPROVED` sin datos de reserva: pago completo aprobado en la simulación.
- `REJECTED`: intento rechazado; no representa dinero recibido.
- `PENDING_COD`: solicitud de pago contra entrega; el dinero sigue pendiente.
- Anticipo `APPROVED` y reserva `CONFIRMED`: solamente se recibió el valor del
  anticipo, no el total del pedido.
- Anticipo `REJECTED` y reserva `NOT_CONFIRMED`: no se recibió dinero y no se
  confirmó la reserva.

## APIs existentes

Base local: `http://127.0.0.1:3000`.

| Método | Ruta | Función |
|---|---|---|
| GET | `/health` | Comprueba que Express responde |
| GET | `/api/payments/summary/:orderId` | Consulta la compra preparada |
| GET | `/api/payments/methods` | Lista los métodos disponibles |
| POST | `/api/payments` | Registra pago o solicitud contra entrega |
| GET | `/api/payments/transactions/:transactionId` | Consulta una transacción guardada |
| GET | `/api/payments/reservations/quote/:orderId` | Calcula anticipo y saldo |
| POST | `/api/payments/reservations` | Registra un intento de anticipo |

### Ejemplos de consulta

`GET /health` responde `200`:

```json
{"status":"ok","module":"payments"}
```

`GET /api/payments/summary/ORD-00125` responde `200`:

```json
{
  "orderId": "ORD-00125",
  "recipient": "TechStore Marketplace",
  "product": "Audífonos Bluetooth JBL Tune 520BT",
  "quantity": 1,
  "subtotalAmount": 139900,
  "shippingAmount": 10000,
  "totalAmount": 149900
}
```

`GET /api/payments/methods` responde `200` con PSE, Código QR y Pago contra
entrega. Una orden inexistente devuelve `404`.

### Procesar un pago

Solicitud a `POST /api/payments`:

```http
Idempotency-Key: accounting-demo-001
Content-Type: application/json
```

```json
{"orderId":"ORD-00125","methodId":"pse"}
```

La primera solicitud válida devuelve `201`. Repetir exactamente la misma operación
con la misma clave devuelve `200` y la transacción anterior. Reutilizar la clave para
otra operación devuelve `409`.

Respuesta académica de ejemplo:

```json
{
  "transactionId": "TX-000125",
  "orderId": "ORD-00125",
  "methodId": "pse",
  "amount": 149900,
  "status": "APPROVED"
}
```

PSE produce `APPROVED`, QR produce `REJECTED` y contra entrega produce
`PENDING_COD`. Para contra entrega también se envía
`"customerType":"NEW_CUSTOMER_DEMO"`.

### Consultar una transacción

`GET /api/payments/transactions/TX-000125` devuelve identificador, pedido, método,
monto, estado y fecha. Si corresponde a un anticipo también devuelve producto, total,
saldo y estado de reserva. Formato inválido devuelve `400` y una transacción que no
existe devuelve `404`.

### Reserva con anticipo

`GET /api/payments/reservations/quote/ORD-00125`:

```json
{
  "orderId": "ORD-00125",
  "product": "Audífonos Bluetooth JBL Tune 520BT",
  "totalAmount": 149900,
  "advanceAmount": 50000,
  "balanceAmount": 99900,
  "rule": "ACADEMIC_FIXED_AMOUNT"
}
```

`POST /api/payments/reservations` acepta solamente `pse` o `qr` y usa también
`Idempotency-Key`. PSE confirma la reserva académica y deja saldo de 99900; QR no
confirma la reserva y conserva saldo de 149900. El anticipo de 50000 es una regla de
demostración, no una regla comercial oficial.

## Errores comunes

- `400`: JSON, identificador, datos o método inválidos.
- `404`: orden, transacción o ruta inexistente.
- `409`: conflicto al reutilizar una clave de idempotencia.
- `413`: cuerpo demasiado grande.
- `500`: error interno; no debe interpretarse como pago rechazado.

## Ejecución local

```powershell
cd backend
npm ci
Copy-Item .env.example .env
# Escribir la contraseña local solamente en .env
npm run db:migrate
npm run db:check
npm start
```

El frontend queda disponible en `http://127.0.0.1:3000/`. Las pruebas se ejecutan
desde `backend` con `npm test`.

## Propuesta de comunicación entre Pagos y Contabilidad

### Ya implementado

- Identificación única mediante `transactionId`.
- Relación con el pedido mediante `orderId`.
- Consulta de transacciones persistidas.
- Estados separados para aprobación, rechazo y contra entrega pendiente.
- Anticipos con total, abono, saldo y estado de reserva.
- Protección contra duplicados dentro de Pagos mediante `Idempotency-Key`.

### Propuesta todavía no aprobada

Pagos podría compartir: versión del contrato, origen, `transactionId`, `orderId`,
tipo de operación, método, valor intentado, valor recibido, estado, total, saldo,
estado de reserva, fecha y una marca de simulación académica.

Contabilidad debería usar `transactionId` como clave contra duplicados. El valor
recibido sería cero para `REJECTED` y `PENDING_COD`; para un anticipo aprobado sería
solo el abono. Una consulta repetida no debería crear otro registro contable.

### Pendiente de acordar

- Si Contabilidad consultará la API o recibirá notificaciones.
- Autenticación y autorización entre módulos.
- Campos obligatorios, formato de fechas y versiones.
- Tratamiento final del recaudo contra entrega.
- Reversos, correcciones, auditoría y reintentos.
- Qué debe hacerse cuando el estado no está confirmado.

Las APIs actuales no tienen autenticación. No deben desplegarse públicamente ni
conectarse con otros módulos hasta acordar seguridad y contrato.
