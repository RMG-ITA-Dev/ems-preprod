SET check_function_bodies = false;
SET row_security = off;

-- Migración cero — set consolidado (bugs/migracion_cero/plan_v2.md Fase 2).
-- 07: estado neto de auth.*/storage.* (informe §3.3.1, plan §2.1-b).
--
-- Fuente de autoría: diff entre un stack local SIN ninguna migración de la app
-- (bugs/migracion_cero/autoria/vanilla_platform_no_migrations.sql) y el mismo stack
-- con las 184 migraciones + preseed aplicadas
-- (bugs/migracion_cero/autoria/baseline184_platform_schemas.sql), filtrado a
-- auth/storage/realtime/cron/extensions. El diff resultante
-- (bugs/migracion_cero/autoria/auth-storage-delta.diff) es exactamente esto: 3 triggers
-- sobre auth.users, 7 policies sobre storage.objects, y un ALTER DEFAULT PRIVILEGES sobre
-- el esquema cron que Postgres registra automáticamente al instalar la extensión pg_cron
-- (cero_01) — ese tercer efecto no requiere ninguna sentencia explícita aquí, se reproduce
-- solo. No se recrea nada del resto de auth/storage/realtime/cron: esos esquemas ya vienen
-- provistos por la plataforma antes de que corra cualquier migración de la app.
--
-- Excepción deliberada del plan (§2.1): las 2 filas de storage.buckets. Son datos, no DDL —
-- un dump schema-only nunca las ve — pero el frontend depende de ellas para subir
-- comprobantes de gastos y contratos de encargo. Viven aquí, no en un seed de Fase 4,
-- porque están acopladas a las policies de storage.objects de este mismo archivo.

--
-- storage.buckets (datos de infraestructura, no seed de negocio)
--

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('expense-receipts', 'expense-receipts', false, 5242880, ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('engagement-contracts', 'engagement-contracts', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

--
-- auth.users: triggers que la app agrega sobre la tabla gestionada por GoTrue
--

CREATE TRIGGER validate_email_domain_trigger BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.validate_email_domain();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_created_link_staff AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.link_auth_user_to_staff();

--
-- storage.objects: policies para los 2 buckets de la app (RLS de storage.objects ya viene
-- habilitado por la plataforma; solo agregamos las policies).
--

CREATE POLICY "Authenticated users can upload expense receipts" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'expense-receipts'::text));

CREATE POLICY "Authenticated users can update their expense receipts" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'expense-receipts'::text));

CREATE POLICY "Authenticated users can delete expense receipts" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'expense-receipts'::text));

CREATE POLICY "Expense receipts: admin or uploader" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'expense-receipts'::text) AND (public.is_admin() OR (owner = auth.uid()))));

CREATE POLICY "Authenticated users can upload engagement contracts" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'engagement-contracts'::text));

CREATE POLICY "Engagement team can view their contract" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'engagement-contracts'::text) AND (EXISTS ( SELECT 1
   FROM public.engagements e
  WHERE ((e.contract_file_path = objects.name) AND (public.is_engagement_team_member(e.engagement_id) OR public.is_admin()))))));

CREATE POLICY "Uploader can view their unlinked engagement contract" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'engagement-contracts'::text) AND ((owner = auth.uid()) OR (owner_id = (auth.uid())::text)) AND (NOT (EXISTS ( SELECT 1
   FROM public.engagements e
  WHERE (e.contract_file_path = objects.name))))));

CREATE POLICY "Uploader can remove unlinked engagement contract" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'engagement-contracts'::text) AND ((owner = auth.uid()) OR (owner_id = (auth.uid())::text)) AND (NOT (EXISTS ( SELECT 1
   FROM public.engagements e
  WHERE (e.contract_file_path = objects.name))))));
