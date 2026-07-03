-- FEAT 0625-151: Contrato Escaneado obligatorio al crear un encargo de cliente
-- Agrega una columna nullable (no reventar encargos existentes ni internos) y un bucket
-- privado con RLS restringida a Admin + Socio/Gerente asignados al encargo.

ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS contract_file_path text;

-- Codex review (P1): the storage SELECT policy below grants access to any object whose path is
-- referenced by *some* engagements row the caller is a team member of — not necessarily the row
-- the file was originally uploaded for. "Authenticated users can read engagements" is USING (true),
-- so any user can read another engagement's contract_file_path and then set that same value on an
-- engagement of their own (direct REST update or via create_engagement_with_code), making the
-- SELECT policy's EXISTS check pass for a contract that was never theirs. A UNIQUE constraint closes
-- this at the source: no second row can ever claim a path already linked to another engagement.
-- (Multiple NULLs — internal/pending engagements — remain allowed; Postgres does not treat NULL as
-- equal to NULL for uniqueness.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'engagements_contract_file_path_unique'
  ) THEN
    ALTER TABLE public.engagements
      ADD CONSTRAINT engagements_contract_file_path_unique UNIQUE (contract_file_path);
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'engagement-contracts',
  'engagement-contracts',
  false,
  5242880, -- 5 MB, igual que expense-receipts
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Cualquier usuario autenticado puede subir: el archivo se sube antes de que exista el
-- encargo (0625-151: upload-on-select para permitir cancelar y elegir otro antes de guardar).
DROP POLICY IF EXISTS "Authenticated users can upload engagement contracts" ON storage.objects;
CREATE POLICY "Authenticated users can upload engagement contracts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'engagement-contracts');

-- Solo Admin o el Socio/Gerente asignado al encargo que referencia este archivo pueden
-- verlo/descargarlo (createSignedUrl exige esta política). El path es un string aleatorio
-- no adivinable; esta política es la protección real, no la columna de texto en engagements.
DROP POLICY IF EXISTS "Engagement team can view their contract" ON storage.objects;
CREATE POLICY "Engagement team can view their contract"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'engagement-contracts'
  AND EXISTS (
    SELECT 1 FROM public.engagements e
    WHERE e.contract_file_path = storage.objects.name
      AND (is_engagement_team_member(e.engagement_id) OR is_admin())
  )
);

-- Codex review (P2): Supabase Storage's remove() needs the object to be selectable, not just
-- deletable — the SELECT policy above only matches objects already linked to an engagement, so a
-- just-uploaded, not-yet-linked file could never be found/removed via the "X" cancel flow, leaving
-- it orphaned in Storage while the UI's local state cleared as if it succeeded. Mirrors the DELETE
-- policy's predicate exactly, scoped to the uploader's own unlinked objects only.
DROP POLICY IF EXISTS "Uploader can view their unlinked engagement contract" ON storage.objects;
CREATE POLICY "Uploader can view their unlinked engagement contract"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'engagement-contracts'
  AND (owner = auth.uid() OR owner_id = (auth.uid())::text)
  AND NOT EXISTS (
    SELECT 1 FROM public.engagements e WHERE e.contract_file_path = storage.objects.name
  )
);

-- El usuario que subió un archivo puede eliminarlo solo mientras no esté vinculado a ningún
-- encargo (permite cancelar y volver a seleccionar antes de guardar, 0625-151 punto 4). Una
-- vez el encargo queda guardado con este contrato, ya no se puede eliminar ni reemplazar.
-- Este proyecto de Supabase tiene tanto `owner` (uuid, legado) como `owner_id` (text, columna
-- vigente en storage-api). Se comparan ambas para no depender de cuál puebla el upload real.
DROP POLICY IF EXISTS "Uploader can remove unlinked engagement contract" ON storage.objects;
CREATE POLICY "Uploader can remove unlinked engagement contract"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'engagement-contracts'
  AND (owner = auth.uid() OR owner_id = (auth.uid())::text)
  AND NOT EXISTS (
    SELECT 1 FROM public.engagements e WHERE e.contract_file_path = storage.objects.name
  )
);
