-- =====================================================================
-- Roles & Permisos — FASE 7/#12: endurecer Storage (recibos de gastos)
--
-- Hallazgo: el bucket 'expense-receipts' es PRIVADO (public=false) pero su policy
-- SELECT era `USING (bucket_id = 'expense-receipts')` → CUALQUIER usuario autenticado
-- podía listar/descargar TODOS los recibos por la API de storage (enumeración directa).
--
-- Contexto de acceso real: la app sube a 'receipts/...' y guarda una URL FIRMADA
-- (createSignedUrl, 1 año) en fund_request_expenses.attachment_url. La visualización
-- se hace por esa signed URL, que NO pasa por esta RLS. Por eso restringir el SELECT
-- directo a admin + uploader NO rompe la visualización (sigue por signed URL) y cierra
-- la enumeración. El uploader necesita SELECT para firmar su archivo recién subido
-- (createSignedUrl exige SELECT), de ahí `owner = auth.uid()`.
--
-- Idempotente. Reemplaza SOLO la policy SELECT abierta conocida.
-- NOTA (drift): confirmar antes que no exista OTRA policy SELECT permisiva sobre
-- 'expense-receipts' (query de preflight abajo); si la hay, quitarla también.
-- =====================================================================

drop policy if exists "Authenticated users can view expense receipts" on storage.objects;
drop policy if exists "Expense receipts: admin or uploader" on storage.objects;

create policy "Expense receipts: admin or uploader"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (public.is_admin() or owner = auth.uid())
  );

-- =====================================================================
-- PREFLIGHT / VALIDACIÓN (SQL Editor)
-- 1) Antes: ver todas las policies SELECT sobre el bucket (por drift):
--   select policyname, cmd, qual from pg_policies
--     where schemaname='storage' and tablename='objects'
--       and (qual ilike '%expense-receipts%' or with_check ilike '%expense-receipts%');
-- 2) Después: la única SELECT de 'expense-receipts' debe ser "Expense receipts: admin or uploader".
-- 3) Probar en la app: subir un recibo (uploader firma OK) y abrir un recibo existente
--    (signed URL almacenada sigue funcionando). Un usuario ajeno ya no puede listar el bucket.
-- =====================================================================
