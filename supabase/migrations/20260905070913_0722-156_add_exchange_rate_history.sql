-- Bug 0722-156 (Fase 1): tipo de cambio BCB — histórico + setting de URL del microservicio.
-- Ver bugs/0722-156/plan_v2.md para el detalle completo (Proposed Fix §1/§2, Amendment
-- 2026-09-04 parte 2). No incluye pg_cron/pg_net: el scheduling queda diferido a un cron
-- externo en Railway; el único disparador de esta fase es el flujo manual "Probar → Guardar"
-- en Configuración (supabase/functions/exchange-rate-sync).
--
-- Nombres de columna alineados 1:1 con los campos de la respuesta del microservicio
-- (fuente, regimen, versionMetodologia, moneda, compra, venta, fechaVigencia, fechaPublicacion,
-- canal, actualizadoEn, estado) salvo snake_case; fecha_vigencia es la clave natural.

CREATE TABLE public.exchange_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_vigencia date NOT NULL UNIQUE,
  compra numeric NOT NULL CHECK (compra > 0),
  venta  numeric NOT NULL CHECK (venta  > 0),
  moneda text NOT NULL DEFAULT 'USD/BOB',
  fuente text NOT NULL,
  regimen text,
  version_metodologia text,
  canal text NOT NULL CHECK (canal IN ('bcb-web','bcb-soap')),
  fecha_publicacion date,
  actualizado_en timestamptz NOT NULL,
  estado text NOT NULL CHECK (estado IN ('vigente','stale')),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exchange_rate_history ENABLE ROW LEVEL SECURITY;

-- Read-only for the browser: writes go through exchange-rate-sync with the service role,
-- which bypasses RLS. No INSERT/UPDATE/DELETE policy is defined for any browser-facing role
-- — RLS denies those commands outright even though the table-level GRANT below (matching the
-- repo's existing per-table convention, e.g. holidays) is broad.
CREATE POLICY "Authenticated users can read exchange rates"
  ON public.exchange_rate_history FOR SELECT TO authenticated USING (true);

GRANT ALL ON TABLE public.exchange_rate_history TO anon;
GRANT ALL ON TABLE public.exchange_rate_history TO authenticated;
GRANT ALL ON TABLE public.exchange_rate_history TO service_role;

-- Seed literal (public service endpoint, not a secret) — editable afterwards from
-- Configuración without a redeploy. The edge function always reads this from
-- global_settings, never from an env var (plan_v2 Open Question 2).
INSERT INTO public.global_settings (setting_key, setting_value, description) VALUES
  ('EXCHANGE_RATE_API_URL',
   'https://tc-ruizmier-production.up.railway.app/api/v1/ruizmier-tc/tipo-cambio/oficial',
   'TC Ruizmier microservice endpoint (USD/BOB oficial BCB) — editable without redeploy')
ON CONFLICT (setting_key) DO NOTHING;
