-- Integración online: outbox durable para eventos hacia otros microservicios.
-- Es aditiva: no modifica payment_transactions ni sus registros históricos.
BEGIN;

CREATE TABLE IF NOT EXISTS public.integration_outbox (
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
  ON public.integration_outbox (transaction_id);
CREATE INDEX IF NOT EXISTS integration_outbox_delivery_idx
  ON public.integration_outbox (delivery_status, created_at);

ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pagos_backend_outbox_select ON public.integration_outbox;
DROP POLICY IF EXISTS pagos_backend_outbox_insert ON public.integration_outbox;
DROP POLICY IF EXISTS pagos_backend_outbox_update ON public.integration_outbox;
CREATE POLICY pagos_backend_outbox_select ON public.integration_outbox
  FOR SELECT TO pagos_backend USING (true);
CREATE POLICY pagos_backend_outbox_insert ON public.integration_outbox
  FOR INSERT TO pagos_backend WITH CHECK (true);
CREATE POLICY pagos_backend_outbox_update ON public.integration_outbox
  FOR UPDATE TO pagos_backend USING (true) WITH CHECK (true);

REVOKE ALL ON public.integration_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.integration_outbox_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.integration_outbox TO pagos_backend;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.integration_outbox FROM pagos_backend;
GRANT USAGE, SELECT ON SEQUENCE public.integration_outbox_id_seq TO pagos_backend;

COMMIT;
