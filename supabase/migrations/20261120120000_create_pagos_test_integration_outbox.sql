-- Fase 17: outbox aditiva validada primero en el esquema aislado pagos_test.
-- No modifica public.payment_transactions ni los 16 registros históricos.
BEGIN;

CREATE TABLE IF NOT EXISTS pagos_test.integration_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(180) NOT NULL UNIQUE,
  transaction_id VARCHAR(20) NOT NULL,
  order_id VARCHAR(50) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  target_service VARCHAR(30) NOT NULL,
  payload JSONB NOT NULL,
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (delivery_status IN ('PENDING', 'DELIVERED', 'FAILED', 'UNCERTAIN')),
  http_status INTEGER,
  last_error_code VARCHAR(80),
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integration_outbox_transaction_idx
  ON pagos_test.integration_outbox (transaction_id);
CREATE INDEX IF NOT EXISTS integration_outbox_delivery_idx
  ON pagos_test.integration_outbox (delivery_status, created_at);

ALTER TABLE pagos_test.integration_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pagos_test_runner_outbox_access ON pagos_test.integration_outbox;
CREATE POLICY pagos_test_runner_outbox_access ON pagos_test.integration_outbox
  FOR ALL TO pagos_test_runner USING (true) WITH CHECK (true);

REVOKE ALL ON pagos_test.integration_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE pagos_test.integration_outbox_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pagos_test.integration_outbox TO pagos_test_runner;
GRANT USAGE, SELECT ON SEQUENCE pagos_test.integration_outbox_id_seq TO pagos_test_runner;

COMMIT;
