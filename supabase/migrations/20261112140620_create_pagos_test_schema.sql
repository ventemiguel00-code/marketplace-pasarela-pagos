-- Fase 6: espacio aislado para pruebas de escritura dentro del mismo proyecto.
-- No modifica public.payment_transactions ni otorga privilegios sobre ella.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pagos_test_runner') THEN
    CREATE ROLE pagos_test_runner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS pagos_test;
REVOKE ALL ON SCHEMA pagos_test FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA pagos_test TO pagos_test_runner;

CREATE TABLE IF NOT EXISTS pagos_test.payment_transactions (
  id BIGSERIAL PRIMARY KEY,
  transaction_id VARCHAR(20) UNIQUE,
  order_id VARCHAR(50) NOT NULL,
  method_id VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('APPROVED', 'REJECTED', 'PENDING_COD')),
  idempotency_key VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  product_name VARCHAR(200),
  total_amount INTEGER CHECK (total_amount IS NULL OR total_amount > 0),
  balance_amount INTEGER CHECK (balance_amount IS NULL OR balance_amount >= 0),
  reservation_status VARCHAR(30) CHECK (reservation_status IS NULL OR reservation_status IN ('CONFIRMED', 'NOT_CONFIRMED')),
  operation_type VARCHAR(30) GENERATED ALWAYS AS (
    CASE
      WHEN method_id LIKE 'cod:%' OR status = 'PENDING_COD' THEN 'COD_ADVANCE'
      WHEN reservation_status IS NOT NULL THEN 'RESERVATION_ADVANCE'
      ELSE 'PAYMENT'
    END
  ) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_idempotency_key_unique
  ON pagos_test.payment_transactions (idempotency_key);

ALTER TABLE pagos_test.payment_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pagos_test_runner_access ON pagos_test.payment_transactions;
CREATE POLICY pagos_test_runner_access ON pagos_test.payment_transactions
  FOR ALL TO pagos_test_runner
  USING (true) WITH CHECK (true);

REVOKE ALL ON pagos_test.payment_transactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE pagos_test.payment_transactions_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pagos_test.payment_transactions TO pagos_test_runner;
GRANT USAGE, SELECT ON SEQUENCE pagos_test.payment_transactions_id_seq TO pagos_test_runner;
REVOKE ALL ON public.payment_transactions FROM pagos_test_runner;

COMMIT;
