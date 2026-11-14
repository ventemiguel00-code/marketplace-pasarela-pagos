const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Marketplace USC - Pasarela de Pagos',
    version: '1.0.0',
    description: 'Los pagos son simulados. Las integraciones con Órdenes, Contabilidad y Notificaciones todavía no son operativas.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    parameters: {
      idempotencyKey: { in: 'header', name: 'Idempotency-Key', required: false, schema: { type: 'string' } },
    },
    schemas: {
      PaymentRequest: {
        type: 'object', required: ['orderId', 'methodId'],
        properties: {
          orderId: { type: 'string', example: 'ORD-00125' },
          methodId: { type: 'string', enum: ['pse', 'qr', 'cod'], example: 'pse' },
          advanceMethodId: { type: 'string', enum: ['pse', 'qr'] },
        },
      },
      PaymentResponse: {
        type: 'object', properties: {
          transactionId: { type: 'string', example: 'TX-000013' },
          orderId: { type: 'string', example: 'ORD-00125' },
          amount: { type: 'integer', example: 149900 },
          status: { type: 'string', enum: ['APPROVED', 'REJECTED', 'PENDING_COD'] },
        },
      },
    },
  },
  paths: {
    '/health': { get: { summary: 'Estado técnico', responses: { 200: { description: 'Disponible' } } } },
    '/api/payments/methods': { get: { summary: 'Métodos disponibles', responses: { 200: { description: 'PSE, QR y contra entrega de demostración' } } } },
    '/api/payments/summary/{orderId}': {
      get: { summary: 'Resumen de compra', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'orderId', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Resumen' }, 401: { description: 'No autenticado' }, 403: { description: 'No autorizado' } } },
    },
    '/api/payments': {
      post: { summary: 'Procesar pago simulado', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/idempotencyKey' }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentRequest' } } } }, responses: { 201: { description: 'Pago procesado', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentResponse' } } } }, 200: { description: 'Reintento idempotente' }, 400: { description: 'Solicitud inválida' }, 401: { description: 'JWT ausente, vencido o inválido' }, 403: { description: 'Pedido ajeno' }, 409: { description: 'Clave idempotente reutilizada con otra solicitud' }, 503: { description: 'Propiedad aún no verificable mediante Órdenes' } } },
    },
    '/api/payments/transactions/{transactionId}': {
      get: { summary: 'Consultar transacción', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'transactionId', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Transacción' }, 404: { description: 'No encontrada' } } },
    },
    '/api/pagos/procesar': { post: { summary: 'Ruta compatible de procesamiento', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/idempotencyKey' }], responses: { 201: { description: 'Pago procesado' } } } },
    '/api/pagos/{id}': { get: { summary: 'Ruta compatible de consulta', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Transacción' } } } },
    '/api/payments/reservations/quote/{orderId}': {
      get: { summary: 'Cotizar anticipo académico de reserva', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'orderId', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Valor de anticipo y saldo' }, 401: { description: 'JWT inválido' }, 503: { description: 'Propiedad no verificable' } } },
    },
    '/api/payments/reservations': {
      post: { summary: 'Registrar anticipo académico de reserva', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/idempotencyKey' }], responses: { 201: { description: 'Anticipo procesado' }, 200: { description: 'Reintento idempotente' }, 400: { description: 'Solicitud inválida' }, 409: { description: 'Conflicto de idempotencia' }, 503: { description: 'Propiedad no verificable' } } },
    },
  },
};

module.exports = { openApiDocument };
