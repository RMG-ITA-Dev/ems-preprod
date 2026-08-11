-- =====================================================================
-- FIX: restaurar las policies de storage.objects (contratos y recibos)
--
-- Síntoma: al crear un encargo, subir el contrato falla con
-- "No se pudo subir el contrato" (toast genérico de EngagementForm).
--
-- Causa: en este proyecto el bucket 'engagement-contracts' existe con su
-- file_size_limit y allowed_mime_types correctos, pero con CERO policies. Las
-- tablas/columnas/buckets llegaron; las policies de `storage.objects` no. Sin
-- policy de INSERT, RLS deniega por defecto y la subida falla.
--
-- Mismo cuadro en 'expense-receipts': de sus 4 policies originales
-- (20260130231039) solo sobrevive la SELECT endurecida por Fase 7
-- (20260724140000), es decir la única creada después del drift. Las de
-- INSERT/UPDATE/DELETE faltan, así que subir un recibo también está roto.
--
-- Es el mismo tipo de pérdida ya visto con los triggers de auth.users: los
-- objetos de esquemas gestionados (storage, auth) no sobreviven un
-- dump/restore de mirror. Se restauran por SQL, no por Studio.
--
-- IMPORTANTE: para 'expense-receipts' se recrea la SELECT de Fase 7 (admin o
-- uploader), NO la permisiva original — esa era el hallazgo de seguridad #12.
--
-- Idempotente: DROP POLICY IF EXISTS de cada nombre que crea.
-- Aplicar en Lovable ("Apply pending Supabase migrations") o pegando este
-- archivo en el SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) engagement-contracts (origen: 20260702000001, FEAT 0625-151)
-- ---------------------------------------------------------------------

-- El archivo se sube ANTES de que exista el encargo (upload-on-select, para
-- poder cancelar y elegir otro antes de guardar): no hay fila con la que
-- validar todavía, de ahí que el WITH CHECK solo acote el bucket.
drop policy if exists "Authenticated users can upload engagement contracts" on storage.objects;
create policy "Authenticated users can upload engagement contracts"
on storage.objects for insert
to authenticated
with check (bucket_id = 'engagement-contracts');

-- Solo Admin o el Socio/Gerente asignado al encargo que referencia el archivo
-- pueden verlo/descargarlo (createSignedUrl exige SELECT).
drop policy if exists "Engagement team can view their contract" on storage.objects;
create policy "Engagement team can view their contract"
on storage.objects for select
to authenticated
using (
  bucket_id = 'engagement-contracts'
  and exists (
    select 1 from public.engagements e
    where e.contract_file_path = storage.objects.name
      and (is_engagement_team_member(e.engagement_id) or is_admin())
  )
);

-- remove() necesita SELECT además de DELETE: sin esto, un archivo recién
-- subido y aún no vinculado no se puede encontrar para borrarlo y queda
-- huérfano en Storage mientras la UI limpia su estado como si hubiera salido bien.
drop policy if exists "Uploader can view their unlinked engagement contract" on storage.objects;
create policy "Uploader can view their unlinked engagement contract"
on storage.objects for select
to authenticated
using (
  bucket_id = 'engagement-contracts'
  and (owner = auth.uid() or owner_id = (auth.uid())::text)
  and not exists (
    select 1 from public.engagements e where e.contract_file_path = storage.objects.name
  )
);

-- Quien subió puede borrar SOLO mientras el archivo no esté vinculado a ningún
-- encargo. Una vez guardado el encargo con su contrato, ya no se puede quitar.
-- Se comparan `owner` (uuid, legado) y `owner_id` (text, vigente) para no
-- depender de cuál puebla el upload real en este proyecto.
drop policy if exists "Uploader can remove unlinked engagement contract" on storage.objects;
create policy "Uploader can remove unlinked engagement contract"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'engagement-contracts'
  and (owner = auth.uid() or owner_id = (auth.uid())::text)
  and not exists (
    select 1 from public.engagements e where e.contract_file_path = storage.objects.name
  )
);

-- ---------------------------------------------------------------------
-- 2) expense-receipts (origen: 20260130231039 + endurecido en 20260724140000)
-- ---------------------------------------------------------------------

drop policy if exists "Authenticated users can upload expense receipts" on storage.objects;
create policy "Authenticated users can upload expense receipts"
on storage.objects for insert
to authenticated
with check (bucket_id = 'expense-receipts');

drop policy if exists "Authenticated users can update their expense receipts" on storage.objects;
create policy "Authenticated users can update their expense receipts"
on storage.objects for update
to authenticated
using (bucket_id = 'expense-receipts');

drop policy if exists "Authenticated users can delete expense receipts" on storage.objects;
create policy "Authenticated users can delete expense receipts"
on storage.objects for delete
to authenticated
using (bucket_id = 'expense-receipts');

-- SELECT: se reafirma la versión de Fase 7 (admin o uploader). NO se recrea
-- "Authenticated users can view expense receipts", que permitía a cualquier
-- autenticado enumerar y descargar TODOS los recibos (hallazgo #12).
drop policy if exists "Authenticated users can view expense receipts" on storage.objects;
drop policy if exists "Expense receipts: admin or uploader" on storage.objects;
create policy "Expense receipts: admin or uploader"
on storage.objects for select
to authenticated
using (
  bucket_id = 'expense-receipts'
  and (public.is_admin() or owner = auth.uid())
);

-- =====================================================================
-- VALIDACIÓN (SQL Editor)
--
--   -- Debe devolver 4 filas de 'engagement-contracts' y 4 de 'expense-receipts'
--   select policyname, cmd
--   from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and (qual ilike '%engagement-contracts%' or with_check ilike '%engagement-contracts%'
--       or qual ilike '%expense-receipts%'     or with_check ilike '%expense-receipts%')
--   order by policyname;
--
--   -- No debe existir ninguna SELECT permisiva sobre recibos (esperado: 0 filas)
--   select policyname from pg_policies
--   where schemaname='storage' and tablename='objects'
--     and policyname = 'Authenticated users can view expense receipts';
--
--   -- En la app: crear un encargo de cliente y subir un PDF; luego la "X" para
--   -- quitarlo (ejercita INSERT, SELECT-unlinked y DELETE), y subir un recibo.
-- =====================================================================
