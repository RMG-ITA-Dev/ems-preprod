-- Servicio: normaliza los códigos secuenciales S01..S29.
--
-- Los UUID taxonomy_id no cambian: encargos existentes conservan sus referencias. El cambio es
-- de presentación y hace que ORDER BY code coincida con el orden numérico del catálogo.

UPDATE public.servicios
SET code = upper(
  's' || lpad(
    substring(lower(btrim(code)) from '^s([1-9]|1[0-9]|2[0-9])$')::integer::text,
    2,
    '0'
  )
)
WHERE lower(btrim(code)) ~ '^s([1-9]|1[0-9]|2[0-9])$'
  AND code IS DISTINCT FROM upper(
    's' || lpad(
      substring(lower(btrim(code)) from '^s([1-9]|1[0-9]|2[0-9])$')::integer::text,
      2,
      '0'
    )
  );
