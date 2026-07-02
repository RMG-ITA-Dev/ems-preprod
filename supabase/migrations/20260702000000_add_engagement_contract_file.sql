-- FEAT 0625-151: Contrato Escaneado obligatorio al crear un encargo de cliente
-- Agrega una columna nullable (no reventar encargos existentes ni internos) y un bucket
-- privado con RLS restringida a Admin + Socio/Gerente asignados al encargo.

ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS contract_file_path text;

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
