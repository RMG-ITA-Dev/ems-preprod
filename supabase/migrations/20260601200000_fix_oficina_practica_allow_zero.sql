-- Allow oficina=0 (Ambos) and practica=0 (Firmwide) in table constraints.
-- The RPC (20260601100000) already validates these values; the table constraints
-- were not updated in that migration, causing INSERT to fail with oficina=0 or practica=0.

ALTER TABLE public.engagements
  DROP CONSTRAINT IF EXISTS chk_engagements_oficina;

ALTER TABLE public.engagements
  ADD CONSTRAINT chk_engagements_oficina CHECK (oficina IN (0, 1, 2));

ALTER TABLE public.engagements
  DROP CONSTRAINT IF EXISTS chk_engagements_practica;

ALTER TABLE public.engagements
  ADD CONSTRAINT chk_engagements_practica CHECK (practica IN (0, 1, 2, 3, 4));
