-- Fase 7: rol mínimo para el backend principal. No concede permisos a roles públicos.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pagos_backend') THEN
    CREATE ROLE pagos_backend NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;

GRANT CONNECT ON DATABASE postgres TO pagos_backend;
GRANT USAGE ON SCHEMA public TO pagos_backend;
GRANT SELECT, INSERT, UPDATE ON public.payment_transactions TO pagos_backend;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.payment_transactions FROM pagos_backend;
GRANT USAGE, SELECT ON SEQUENCE public.payment_transactions_id_seq TO pagos_backend;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pagos_backend_select ON public.payment_transactions;
DROP POLICY IF EXISTS pagos_backend_insert ON public.payment_transactions;
DROP POLICY IF EXISTS pagos_backend_update ON public.payment_transactions;
CREATE POLICY pagos_backend_select ON public.payment_transactions
  FOR SELECT TO pagos_backend USING (true);
CREATE POLICY pagos_backend_insert ON public.payment_transactions
  FOR INSERT TO pagos_backend WITH CHECK (true);
CREATE POLICY pagos_backend_update ON public.payment_transactions
  FOR UPDATE TO pagos_backend USING (true) WITH CHECK (true);

REVOKE ALL ON SCHEMA pagos_test FROM pagos_backend;
REVOKE ALL ON pagos_test.payment_transactions FROM pagos_backend;
REVOKE ALL ON SEQUENCE pagos_test.payment_transactions_id_seq FROM pagos_backend;
COMMIT;
