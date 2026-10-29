# Marketplace — Grupo 2 — Pasarela de Pagos

Sprint 1: base técnica, **HU-PG-01 — Ver destinatario, detalle y valor total antes de pagar**,
**HU-PG-02 — Seleccionar un método de pago** y **HU-PG-03 — Realizar el pago del pedido**.
**HU-PG-04 — Conocer si el pago fue aprobado o rechazado** completa el Sprint 1.
Sprint 2 incluye hasta ahora **HU-PG-05 — Conocer el estado del pago si falla la página**
y **HU-PG-06 — Recibir confirmación de pago exitoso** y
**HU-PG-07 — Reintentar un pago rechazado** y
**HU-PG-08 — Verificar, editar o cancelar ante un problema**.
Sprint 3 comienza con **HU-PG-09 — Consultar información básica de una transacción**.
Continúa únicamente con **HU-PG-10 — Mostrar un número de contacto para recibir ayuda**.
También incluye **HU-PG-11 — Permitir pago contra entrega para un cliente nuevo**.
HU-PG-12 completa el Sprint 3 con **Reservar un producto mediante un anticipo**.
El procesamiento es simulado y no existe integración con un proveedor bancario.

Este repositorio contiene solamente el código fuente del módulo. La versión portátil,
sus ejecutables, su PostgreSQL incluido y los respaldos se conservan por separado y
no deben publicarse en GitHub.

## Documentación para integración

- [Integración propuesta con Contabilidad](docs/INTEGRACION_CONTABILIDAD.md): explica
  las APIs que ya existen, los estados y una propuesta que todavía debe acordarse con
  el otro grupo.
- [Preguntas para el Grupo de Contabilidad](docs/PREGUNTAS_GRUPO_CONTABILIDAD.md):
  lista los datos y decisiones que necesitamos confirmar antes de conectar módulos.

Todavía no hay integración automática, webhooks ni endpoints especiales para
Contabilidad. El código fuente se publica en este repositorio privado para el
trabajo académico del Grupo 2.

## Ejecutar localmente

Requisitos: Node.js 22 o superior, npm y PostgreSQL local para verificar la conexión.
Desde la raíz, en PowerShell:

```powershell
cd backend
npm ci
# Solo si .env no existe:
Copy-Item .env.example .env
npm start
```

Si ya existe `.env`, conserva su contenido. Para desarrollo puedes usar `npm run dev`.
Express sirve API y frontend: abre http://127.0.0.1:3000/.
No abras index.html mediante file://. Detén el servidor con Ctrl+C.
HOST y PORT se configuran en `backend/.env`; reinicia tras modificarlo.

## HU-PG-01

La página consulta con `fetch` la compra ficticia `ORD-00125`. Muestra comercio,
producto, cantidad, subtotal, envío y total en pesos colombianos (COP).

```http
GET /api/payments/summary/ORD-00125
```

HTTP 200, JSON:

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

Una orden inexistente devuelve HTTP 404 con `{"error":"Orden no encontrada"}`.
La página muestra un mensaje sin datos de compra. Puedes comprobarlo abriendo
http://127.0.0.1:3000/?orderId=ORD-999. Si el servidor no responde, muestra un error
sencillo de carga. Los textos recibidos se insertan con `textContent`.

## HU-PG-02

Debajo del resumen, la página consulta y muestra exclusivamente PSE y Código QR.
Los radio buttons permiten seleccionar solo uno y la tarjeta elegida queda resaltada
con el texto `Método seleccionado`. La selección vive solamente en JavaScript mientras
la página está abierta: no se almacena ni procesa un pago.

```http
GET /api/payments/methods
```

HTTP 200, JSON:

```json
{
  "methods": [
    { "id": "pse", "name": "PSE" },
    { "id": "qr", "name": "Código QR" }
  ]
}
```

La comprobación `/health` continúa disponible para uso técnico, pero su tarjeta y
el botón «Comprobar conexión» ya no aparecen en la interfaz principal.

## HU-PG-03

Después de seleccionar PSE o Código QR, se habilita «Realizar pago». El botón envía
la orden y el método al backend, se deshabilita durante el envío y evita múltiples
solicitudes simultáneas. HU-PG-04 interpreta el resultado devuelto por este mismo flujo.

```http
POST /api/payments
Content-Type: application/json
Idempotency-Key: attempt:demo-001

{"orderId":"ORD-00125","methodId":"pse"}
```

Respuesta HTTP 201 de ejemplo:

```json
{
  "transactionId": "TX-000011",
  "orderId": "ORD-00125",
  "methodId": "pse",
  "amount": 149900,
  "status": "APPROVED"
}
```

El estado técnico es determinista en esta simulación para facilitar las pruebas.
Una solicitud sin `orderId` o `methodId`, o con un método distinto de `pse` y `qr`,
devuelve HTTP 400 y no se procesa.

## HU-PG-04

Se reutilizan el endpoint, caso de uso y persistencia de HU-PG-03. El adaptador
simulado aplica una regla controlada para demostrar ambos resultados:

- PSE devuelve `APPROVED`; la interfaz muestra «Pago aprobado» en verde.
- Código QR devuelve `REJECTED`; la interfaz muestra «Pago rechazado» en rojo.

En ambos casos se muestra `Transacción: TX-...`. No hay reintento, edición,
cancelación, confirmaciones adicionales ni consulta histórica.

## HU-PG-05

La sección «Consulta el estado de tu pago» permite escribir un identificador `TX-...`
y recuperar desde PostgreSQL una transacción ya registrada:

```http
GET /api/payments/transactions/TX-000014
```

La consulta devuelve HTTP 200 con el identificador, orden, método, monto, estado y
fecha de creación. Un identificador válido que no existe devuelve HTTP 404; un formato
inválido devuelve HTTP 400. Consultar es una operación de lectura y no crea ni repite
un pago.

Después de recibir una transacción, el navegador conserva su identificador en
`localStorage` y en el parámetro `transactionId` de la URL. Al recargar o reabrir esa
URL, consulta nuevamente el mismo registro. Si la conexión falla, muestra «Estado del
pago sin confirmar»; la falla nunca se presenta como un pago rechazado.

## HU-PG-06

Cuando el backend devuelve `APPROVED`, la interfaz muestra la confirmación
«¡Pago realizado con éxito!» junto con el identificador de transacción, pedido,
total pagado, método y estado «Aprobado». La confirmación se presenta tanto después
del pago como al recuperar la transacción mediante el endpoint de HU-PG-05.

Las transacciones `REJECTED` continúan mostrando «Pago rechazado» y no reciben una
confirmación de éxito. Ante una falla temporal se conserva «Estado del pago sin
confirmar». HU-PG-06 reutiliza la transacción persistida por HU-PG-03 y la consulta
de HU-PG-05; no añade endpoints, tablas ni procesa nuevamente el pago.

## HU-PG-07

Una transacción confirmada como `REJECTED` muestra «Intentar pagar nuevamente».
El botón limpia la selección anterior y obliga a escoger PSE o Código QR y a pulsar
«Confirmar nuevo intento». No se procesa nada al abrir el formulario de reintento.
Los pagos aprobados, los estados sin confirmar y las transacciones inexistentes no
muestran esta opción.

Cada confirmación voluntaria genera una clave de intento nueva en el navegador y la
envía en el encabezado `Idempotency-Key`. El backend guarda esa clave junto con la
transacción. Si recibe nuevamente la misma solicitud, devuelve la transacción ya
existente con HTTP 200; el primer registro devuelve HTTP 201. Si una clave se intenta
usar con otro pedido o método, devuelve HTTP 409. Así, un doble clic, una respuesta
tardía o repetir la solicitud no generan otra fila. Después de una falla de conexión,
el botón permite consultar el mismo intento usando la misma clave.

Un reintento voluntario usa una clave diferente y crea otra transacción. La fila
rechazada anterior nunca se actualiza ni elimina; ambas quedan relacionadas de forma
sencilla por `order_id`. Se reutilizan `POST /api/payments`, la consulta de HU-PG-05
y la confirmación de HU-PG-06, sin tablas ni endpoints nuevos.

## HU-PG-08

Después de seleccionar PSE o Código QR, la interfaz muestra una revisión previa con
el pedido, valor, método y estado «Pendiente de confirmación». En esta etapa se puede
cambiar el método o cancelar la operación. Cancelar exige una confirmación y no hace
ninguna solicitud de pago, por lo que no crea una transacción. «Volver al resumen»
permite comenzar de nuevo.

Una vez procesado el pago, el identificador, pedido, valor, método y estado provienen
de la transacción persistida en PostgreSQL y se presentan como datos de solo lectura.
No se permite editar, eliminar, cancelar ni revocar una transacción histórica. Si el
estado no puede confirmarse por una falla de conexión, primero se recupera el mismo
intento o se consulta su identificador; nunca se interpreta automáticamente como
rechazado ni se habilita otra operación mientras permanezca desconocido.

HU-PG-08 reutiliza los endpoints, casos de uso, puertos y adaptadores existentes. No
añade tablas, migraciones ni endpoints. La cancelación previa ocurre exclusivamente
en el estado local de la interfaz y no representa un reembolso.

## HU-PG-09

La sección «Consulta la información de tu pago» reutiliza el endpoint de lectura
`GET /api/payments/transactions/:transactionId` desarrollado en HU-PG-05. Al escribir
un identificador muestra la transacción, el pedido, el método, el valor y el estado
guardados en PostgreSQL. `APPROVED` se presenta como «Aprobado» y `REJECTED` como
«Rechazado».

La consulta es de solo lectura: no procesa el pago, no crea otra fila y no permite
editar ni cancelar una transacción histórica. Un identificador inexistente muestra
«Transacción no encontrada» y una falla de conexión muestra «Estado del pago sin
confirmar»; nunca se interpreta una falla técnica como un rechazo. HU-PG-09 no agrega
tablas, migraciones ni endpoints.

## HU-PG-10

Al final de la página aparece una tarjeta «¿Necesitas ayuda con tu pago?». El número
oficial todavía no está confirmado, por lo que la interfaz muestra «Número de soporte
pendiente por definir» y no crea enlaces de llamada o WhatsApp que aparenten funcionar.

Cuando el Marketplace autorice un número, se configura en
`frontend/js/support-contact.js`, en la constante `SUPPORT_PHONE`, usando formato
internacional: signo `+`, código del país y número completo. Un valor válido se muestra
como contacto de soporte y habilita un enlace `tel:` para llamar. Un valor vacío o
inválido conserva el mensaje pendiente y no genera enlaces. Esta función es solo
informativa: no consulta PostgreSQL, no registra compradores ni procesa pagos.

## HU-PG-11

La interfaz permite activar «Simular cliente nuevo». Esta opción es únicamente una
demostración académica: el proyecto no tiene registro de usuarios, autenticación ni
historial real de compradores. Al activarla aparece «Pago contra entrega» junto con
PSE y Código QR. Antes de confirmar se explica que el dinero se pagará cuando se
reciba el producto.

La solicitud utiliza el mismo `POST /api/payments`, conserva `Idempotency-Key` y se
guarda en `payment_transactions` con `method_id = 'cod'` y estado `PENDING_COD`.
Este estado se muestra como «Pendiente de pago contra entrega». No significa que el
pago fue recibido, no genera «¡Pago realizado con éxito!» y no reutiliza los estados
`APPROVED` o `REJECTED`. La consulta posterior usa el endpoint existente
`GET /api/payments/transactions/:transactionId` y no crea registros adicionales.

La migración amplía de forma repetible la restricción de estados para aceptar
`PENDING_COD`; conserva las filas, índices y claves de idempotencia existentes. No se
creó otra tabla porque el registro actual ya contiene pedido, método, monto, estado,
identificador y fecha necesarios para distinguir la solicitud pendiente.

La integración con Envíos queda pendiente. En el futuro ambos módulos deberán acordar
como mínimo el identificador del pedido, el identificador de la solicitud, el monto,
la modalidad contra entrega y los eventos de entrega o recaudo. Este proyecto todavía
no registra despachos, entregas completadas ni pagos recibidos por el transportador.

## HU-PG-12

La tarjeta «Reservar con anticipo» muestra producto, precio total, anticipo y saldo
pendiente antes de procesar nada. Como no apareció la plantilla original del profesor,
la demostración usa un anticipo fijo y visible de **$50.000 COP**. Esta configuración
vive en `academic-reservation-policy.js` y no representa una regla comercial oficial.
Para la orden de $149.900 COP, el saldo calculado con enteros es $99.900 COP.

El navegador consulta la cotización con
`GET /api/payments/reservations/quote/:orderId`. El backend obtiene total y producto
del resumen preparado; no acepta como verdad montos enviados por el frontend. El caso
de uso valida que total y anticipo sean enteros positivos y que el anticipo no supere
el total.

`POST /api/payments/reservations` simula el anticipo con PSE o Código QR y conserva
`Idempotency-Key`. PSE guarda `APPROVED` y `reservation_status = 'CONFIRMED'`, registra
el anticipo y calcula el saldo. QR guarda `REJECTED`, deja la reserva en
`NOT_CONFIRMED` y no descuenta el intento rechazado del saldo. Contra entrega no se
usa para anticipos.

La consulta posterior reutiliza `GET /api/payments/transactions/:transactionId` y
recupera producto, total, anticipo solicitado, saldo y estado desde PostgreSQL. Una
reserva confirmada es solo académica: no bloquea inventario ni equivale al pago total.
La integración futura con Productos o Inventario necesitará acordar pedido, producto,
anticipo confirmado, saldo y estado; todavía no se descuentan unidades.

## Arquitectura hexagonal sencilla

- `backend/src/domain/payment-summary.js`: modelo de lectura del resumen y sus importes.
- `backend/src/ports/order-summary-port.js`: contrato documentado en JSDoc;
  `findByOrderId(orderId)` devuelve una promesa con el resumen o `null`.
- `backend/src/application/get-payment-summary.js`: caso de uso que recibe el puerto.
- `backend/src/adapters/local/local-order-summary.js`: datos de prueba en memoria;
  implementa el contrato y devuelve una instancia del modelo.
- `backend/src/adapters/http/app.js`: traduce la consulta HTTP a una llamada al caso
  de uso y responde JSON, con 200 o 404.
- `backend/src/domain/payment-method.js`: representación pública de un método.
- `backend/src/ports/payment-method-port.js`: contrato para consultar métodos.
- `backend/src/application/get-payment-methods.js`: caso de uso de consulta.
- `backend/src/adapters/local/local-payment-methods.js`: catálogo local PSE, QR y
  pago contra entrega.
- `backend/src/domain/payment-transaction.js`: datos básicos de una transacción.
- `backend/src/domain/payment-reservation.js`: valida valores enteros y calcula el saldo.
- `backend/src/ports/payment-processor-port.js`: contrato del proveedor de pago.
- `backend/src/ports/payment-transaction-repository-port.js`: contrato de persistencia.
- `backend/src/application/process-payment.js`: valida, procesa y registra el pago;
  para contra entrega exige el marcador académico de cliente nuevo.
- `backend/src/application/get-reservation-quote.js`: prepara producto, total, anticipo
  y saldo usando datos del backend.
- `backend/src/application/process-reservation.js`: procesa el anticipo, define el
  estado académico de la reserva y reutiliza la idempotencia.
- `backend/src/ports/reservation-policy-port.js`: contrato de la regla de anticipo.
- `backend/src/adapters/local/academic-reservation-policy.js`: regla académica fija de
  $50.000 COP, reemplazable cuando exista una regla oficial.
- `backend/src/application/get-payment-status.js`: valida el identificador y consulta
  una transacción existente mediante el puerto de persistencia.
- `backend/src/adapters/local/simulated-payment-processor.js`: proveedor determinista.
- `backend/src/adapters/persistence/postgres-transaction-repository.js`: registro y
  lectura por identificador o clave de intento mediante consultas parametrizadas.
- `backend/scripts/migrate.js`: mantiene la tabla y admite de forma repetible el
  estado `PENDING_COD` sin borrar transacciones históricas.
- `frontend/js/payment-result.js`: traduce el estado técnico a texto y prepara los
  datos visibles de la confirmación, el reintento, la revisión y la consulta de
  información básica de HU-PG-09.
- `frontend/js/support-contact.js`: contiene la configuración y presentación sencilla
  del contacto de ayuda de HU-PG-10, separada del procesamiento de pagos.
- `backend/src/server.js`: conecta adaptador local, caso de uso y aplicación HTTP.
- `backend/src/adapters/persistence/postgres.js`: conexión PostgreSQL existente.
- `frontend/index.html`, `css/styles.css`, `js/app.js`: presentación y consulta REST.

El dominio y el caso de uso no dependen de Express ni PostgreSQL. Para consultar
compras reales, se sustituirá el adaptador local en la composición por otro que
cumpla el mismo puerto. El contrato de integración con el módulo de pedidos aún
queda por acordar. Se creó únicamente `payment_transactions` para registrar HU-PG-03;
el resumen y los métodos continúan en adaptadores locales.

## PostgreSQL y credenciales

La instalación local está activa y la base `marketplace_payments` ya fue creada.
En `backend/.env` se utilizan PGHOST=127.0.0.1, PGPORT=5432,
PGDATABASE=marketplace_payments, PGUSER=postgres y PGPASSWORD con la clave local.
Escribe la clave únicamente en `.env`: Git lo ignora. `.env.example` contiene
solo valores de ejemplo. No publiques contraseñas en código, documentación ni logs.
Las variables del entorno del proceso tienen prioridad sobre `.env`.

```powershell
# Desde backend:
npm run db:migrate
npm run db:check
```

`db:migrate` crea, si no existe, `payment_transactions` con `id`, `transaction_id`,
`order_id`, `method_id`, `amount`, `status`, `idempotency_key` y `created_at`.
La clave es opcional para registros anteriores y tiene un índice único para impedir
duplicados. No se creó una tabla adicional.
HU-PG-12 agrega columnas opcionales `product_name`, `total_amount`, `balance_amount` y
`reservation_status`. Los registros anteriores conservan estos campos en `NULL`.

Debe mostrar `Conexión a PostgreSQL correcta (SELECT 1).` y terminar con código 0.
No crea ni modifica tablas. `/health` verifica HTTP independientemente de la base.
Ante ECONNREFUSED, revisa el servicio y puerto; ante 28P01, las credenciales;
ante 3D000, la existencia de la base.

En otro equipo Windows, usa el [instalador oficial](https://www.postgresql.org/download/windows/)
con PostgreSQL Server, pgAdmin y Command Line Tools. Define la clave de postgres,
conserva el puerto 5432 y comprueba el servicio en `services.msc`. Stack Builder
no es necesario. En pgAdmin, conectado a la base postgres, ejecuta una sola vez
`CREATE DATABASE marketplace_payments;` si todavía no existe.

## Verificación

Desde backend:

```powershell
npm test
npm run db:check
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/api/payments/summary/ORD-00125
Invoke-RestMethod http://127.0.0.1:3000/api/payments/methods
Invoke-RestMethod http://127.0.0.1:3000/api/payments/transactions/TX-000014
$body = @{ orderId = 'ORD-00125'; methodId = 'pse' } | ConvertTo-Json
$headers = @{ 'Idempotency-Key' = 'attempt:demo-pse-001' }
Invoke-RestMethod http://127.0.0.1:3000/api/payments -Method Post -Headers $headers -ContentType 'application/json' -Body $body
```

Última verificación antes de preparar el proyecto para GitHub:

- `npm test`: 59/59 PASS para HU-PG-01 a HU-PG-12.
- `npm run db:check`: conexión real correcta con `SELECT 1`.
- `/health`: HTTP 200 con `{"status":"ok","module":"payments"}`.
- Frontend, resumen, métodos, consulta de transacciones y cotización de anticipo:
  HTTP 200 con los datos académicos esperados.
- Las pruebas cubren PSE aprobado, QR rechazado, pago contra entrega pendiente,
  consulta, reintento, cancelación previa, confirmación, idempotencia, anticipo,
  saldos y errores controlados.
- Las pruebas de persistencia limpian sus propios registros y no modifican las
  transacciones históricas de demostración.

Para revisar visualmente, abre http://127.0.0.1:3000/. Con PSE debe aparecer «Pago
aprobado» y el identificador; al recargar y usar Código QR debe aparecer «Pago
rechazado» y un nuevo identificador.

Sprint 1, Sprint 2 y las cuatro historias del Sprint 3 están terminados funcionalmente.
La copia portátil se distribuye por separado y no forma parte del repositorio de código
fuente. La integración real con otros grupos y el Excel del Sprint 3 son tareas
independientes.
