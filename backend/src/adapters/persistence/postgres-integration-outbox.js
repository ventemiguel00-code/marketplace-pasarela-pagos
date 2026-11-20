function mapRow(row) {
  return row ? {
    eventId: row.event_id,
    transactionId: row.transaction_id,
    orderId: row.order_id,
    eventType: row.event_type,
    targetService: row.target_service,
    payload: row.payload,
    deliveryStatus: row.delivery_status,
    httpStatus: row.http_status,
    lastErrorCode: row.last_error_code,
    lastAttemptAt: row.last_attempt_at,
  } : null;
}

function createPostgresIntegrationOutbox(pool) {
  return {
    async enqueue(events) {
      const inserted = [];
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const event of events) {
          const result = await client.query(
            `INSERT INTO integration_outbox
               (event_id, transaction_id, order_id, event_type, target_service, payload)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)
             ON CONFLICT (event_id) DO NOTHING
             RETURNING event_id, transaction_id, order_id, event_type, target_service,
                       payload, delivery_status, http_status, last_error_code, last_attempt_at`,
            [event.eventId, event.transactionId, event.orderId, event.eventType,
              event.targetService, JSON.stringify(event.payload)],
          );
          if (result.rows[0]) inserted.push(mapRow(result.rows[0]));
        }
        await client.query('COMMIT');
        return inserted;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async markResult(eventId, { deliveryStatus, httpStatus = null, errorCode = null }) {
      const result = await pool.query(
        `UPDATE integration_outbox
         SET delivery_status = $2, http_status = $3, last_error_code = $4,
             last_attempt_at = NOW(), updated_at = NOW()
         WHERE event_id = $1
         RETURNING event_id, transaction_id, order_id, event_type, target_service,
                   payload, delivery_status, http_status, last_error_code, last_attempt_at`,
        [eventId, deliveryStatus, httpStatus, errorCode],
      );
      return mapRow(result.rows[0]);
    },
  };
}

module.exports = createPostgresIntegrationOutbox;
