# Marketplace — Grupo 2 — Pasarela de Pagos

Módulo académico desarrollado con HTML, CSS, JavaScript, Node.js, Express y
PostgreSQL, organizado con arquitectura hexagonal sencilla. Los tres Sprints y sus
12 historias de usuario están terminados. El procesamiento continúa siendo simulado:
no existe conexión con bancos ni movimiento de dinero real.

## Funcionalidad terminada

- Sprint 1, HU-PG-01 a HU-PG-04: resumen, PSE o QR, procesamiento simulado y resultado.
- Sprint 2, HU-PG-05 a HU-PG-08: recuperación, confirmación, reintento y revisión previa.
- Sprint 3, HU-PG-09 a HU-PG-12: consulta, soporte, contra entrega y reserva con anticipo.
- PSE produce `APPROVED` y Código QR produce `REJECTED` de forma determinista.
- Contra entrega exige un anticipo académico de **$50.000 COP** y conserva el saldo.
- La reserva independiente usa el mismo anticipo, pero no bloquea inventario real.
- PostgreSQL conserva transacciones e idempotencia sin almacenar datos bancarios.

Este repositorio contiene solamente el código fuente del módulo. La versión portátil,
sus ejecutables, su PostgreSQL incluido y los respaldos se conservan por separado y
no deben publicarse en GitHub.

## Estado de integración

- [Integración propuesta con Contabilidad](docs/INTEGRACION_CONTABILIDAD.md): explica
  las APIs, estados y contratos todavía pendientes de aprobación.
- [Preguntas para el Grupo de Contabilidad](docs/PREGUNTAS_GRUPO_CONTABILIDAD.md):
  lista los datos y decisiones que necesitamos confirmar antes de conectar módulos.

El backend incluye adaptadores preparados para Contabilidad y Notificaciones, y un
puerto para validar propiedad mediante Órdenes. No se invocan automáticamente porque
siguen pendientes la autenticación entre servicios, la URL definitiva de Órdenes y
los contratos de comprador y vendedor. No se presentan como conexiones operativas.

La autenticación JWT está preparada para ES256 mediante JWKS. Valida firma, algoritmo,
emisor, audiencia y vencimiento. La audiencia exacta debe configurarse mediante una
variable privada cuando el equipo de Login la confirme. Con JWT activo, las operaciones
sensibles permanecen bloqueadas si Órdenes no puede comprobar la propiedad.

Este es un repositorio público de código fuente. Los archivos `.env`, credenciales,
respaldos, runtimes y la versión portátil se conservan fuera de GitHub.

## API y Swagger

Además de las rutas históricas `/api/payments`, se ofrecen rutas compatibles con el
Marketplace sin duplicar casos de uso:

| Método | Ruta | Función |
|---|---|---|
| GET | `/health` | Estado técnico del módulo |
| GET | `/api/payments/methods` | Métodos disponibles |
| GET | `/api/payments/summary/:orderId` | Resumen de compra |
| POST | `/api/payments` | Procesamiento original |
| GET | `/api/payments/transactions/:transactionId` | Consulta original |
| POST | `/api/pagos/procesar` | Procesamiento compatible con el Marketplace |
| GET | `/api/pagos/:id` | Consulta compatible con el Marketplace |
| GET | `/api/payments/reservations/quote/:orderId` | Cotización del anticipo |
| POST | `/api/payments/reservations` | Procesamiento del anticipo |

Las escrituras aceptan `Idempotency-Key`. La primera operación devuelve `201`; una
repetición idéntica devuelve `200`, y reutilizar la clave con otros datos devuelve
`409`. Swagger está disponible en `http://127.0.0.1:3000/docs`.

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
de soporte autorizado se configura en `frontend/js/support-contact.js` y permite abrir
WhatsApp. Esta función es informativa: no consulta PostgreSQL, no registra compradores
ni procesa pagos. Si la configuración es inválida, no genera un enlace funcional.

## HU-PG-11

> **Adaptación posterior para integración:** la versión inicial del Sprint 3 permitía
> registrar la solicitud contra entrega sin anticipo. La regla vigente fue modificada
> después, con autorización expresa, para exigir primero un anticipo académico de
> $50.000 COP. Este cambio no altera ni fusiona HU-PG-12.

La interfaz permite activar «Simular cliente nuevo». Esta opción es únicamente una
demostración académica: el proyecto no tiene registro de usuarios, autenticación ni
historial real de compradores. Al activarla aparece «Pago contra entrega» y se muestra
el total, el anticipo obligatorio y el saldo al recibir. El anticipo se simula con PSE
o Código QR usando la misma política de $50.000 COP de HU-PG-12.

La solicitud utiliza el mismo `POST /api/payments`, conserva `Idempotency-Key` y exige
`advanceMethodId` con `pse` o `qr`. PSE registra una sola fila con `amount = 50000`,
estado `PENDING_COD`, total de 149900 y saldo de 99900. El método persistido
`cod:pse` distingue la modalidad y el medio del anticipo. Código QR registra el intento
como `REJECTED`, con importe recibido cero, saldo completo y contra entrega no
habilitado. Nunca se guardan 149900 como dinero recibido.

La respuesta pública conserva `methodId = 'cod'` y añade `advanceMethodId`,
`receivedAmount`, total, saldo y estado de habilitación. La consulta posterior usa
`GET /api/payments/transactions/:transactionId` y no crea registros adicionales.

No se necesitó una migración adicional: se reutilizan los campos opcionales de total,
saldo y producto existentes. La obligación pendiente y el anticipo forman una sola
transacción, evitando contabilizar dos veces el mismo abono.

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
- `backend/src/adapters/http/jwt-authentication.js`: valida JWT ES256 mediante JWKS.
- `backend/src/adapters/http/request-authorization.js`: exige propiedad del pedido o
  bloquea de forma segura cuando Órdenes aún no puede comprobarla.
- `backend/src/adapters/http/openapi.js`: contrato OpenAPI servido en `/docs`.
- `backend/src/adapters/http/accounting-escrow-client.js` y
  `notifications-client.js`: adaptadores preparados, todavía no conectados a los casos
  de uso para evitar efectos externos sin contrato autorizado.
- `backend/src/ports/order-ownership-port.js`: contrato pendiente con Órdenes.
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
  para contra entrega exige el marcador académico de cliente nuevo y delega el
  anticipo obligatorio al procesamiento compartido.
- `backend/src/application/get-reservation-quote.js`: prepara producto, total, anticipo
  y saldo usando datos del backend.
- `backend/src/application/process-reservation.js`: procesa anticipos para la reserva
  independiente o para contra entrega, diferenciando el propósito y reutilizando la
  misma política, simulador e idempotencia.
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
- `frontend/js/auth-bridge.js`: recibe el token desde el Login central sin inventarlo
  ni guardarlo como credencial propia.
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

### Supabase opcional

PostgreSQL local sigue disponible. Para Supabase se usan variables `SUPABASE_PG*`,
TLS con certificado verificado y roles restringidos. Copia
`backend/.env.supabase.example` a un archivo local ignorado y completa allí las
credenciales; nunca las escribas en el repositorio.

Las migraciones versionadas en `supabase/migrations` preparan:

- `public.payment_transactions` con restricciones e idempotencia.
- Rol de backend `pagos_backend`, sin permiso de eliminación.
- Esquema aislado `pagos_test` y rol limitado para pruebas de escritura.

Los scripts `db:check:supabase:main`, `db:verify:supabase` y
`test:supabase:test` comprueban conexión, integridad y aislamiento. No deben ejecutarse
sin sus archivos privados de entorno.

## Preparación de Render

`render.yaml` define el servicio Node.js, `/health`, JWT obligatorio y variables
privadas para PostgreSQL, TLS, audiencia JWT y CORS. El archivo prepara el despliegue,
pero este repositorio no confirma que exista una instancia activa en Render.

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

Última verificación antes de actualizar GitHub:

- `npm test`: 76/76 PASS para HU-PG-01 a HU-PG-12 e integración preparada.
- `npm run test:supabase:test`: 76/76 PASS usando únicamente `pagos_test`.
- `npm audit --omit=dev`: 0 vulnerabilidades conocidas.
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
La copia portátil se distribuye por separado y no forma parte del repositorio. La
integración real con Login, Órdenes, Contabilidad y Notificaciones permanece pendiente;
los adaptadores presentes no realizan llamadas automáticas.
