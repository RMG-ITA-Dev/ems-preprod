// Adaptador SQL de Fase 2. Todas las escrituras usan psql -1, lock transaccional y
// payload JSON UTF-8 codificado en base64; así no se pasan nombres/accentos por -v en Windows.
import { randomUUID } from "node:crypto";
import { Fase1Error, classifySqlFailure, runPsql } from "./fase1-db.mjs";

const LOCK = "ems:etl:fase2";
export const toPayloadB64 = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");
export function classifyF2SqlFailure(result) {
  const marker = String(result.stderr ?? "").match(/ETL_F2_(?:FOREIGN|CONFLICT|CATALOG|ROLE|LINK)[^\n]*/);
  return marker ? { kind: "blocked", reason: marker[0] } : classifySqlFailure(result);
}
const lastJson = (stdout) => {
  try { return JSON.parse(String(stdout).trim()); } catch { throw new Fase1Error("SQL", "la lectura SQL de fase 2 no devolvió JSON interpretable"); }
};

export function createFase2DbAdapter({ env = process.env, execFileImpl } = {}) {
  const query = async (sql, vars = {}) => {
    const result = await runPsql(sql, vars, { env, execFileImpl, extraSecretNames: ["ETL_F2_PROBE_PASSWORD"] });
    if (!result.ok) throw new Fase1Error("SQL", `lectura SQL fase 2 fallida: ${classifyF2SqlFailure(result).reason}`);
    return lastJson(result.stdout);
  };
  const write = async (sql, payload) => {
    const result = await runPsql(sql, { payload_b64: toPayloadB64(payload), lock_key: LOCK }, { env, execFileImpl, singleTransaction: true, extraSecretNames: ["ETL_F2_PROBE_PASSWORD"] });
    if (result.ok) return result.stdout;
    const failure = classifyF2SqlFailure(result);
    if (failure.kind === "blocked") throw new Fase1Error("BLOQUEADO", failure.reason);
    if (failure.kind === "tool") throw new Fase1Error("SQL", failure.reason);
    throw new Fase1Error("SQL_INCIERTO", `resultado SQL fase 2 incierto: ${failure.reason}`);
  };
  return {
    async readTargetState() {
      return query(`SELECT json_build_object(
        'bootstrap', (SELECT json_agg(x) FROM (SELECT s.staff_id, s.auth_user_id, lower(s.email) email, s.is_schedulable, ur.role, ur.role_key FROM public.staff s LEFT JOIN public.user_roles ur ON ur.user_id=s.auth_user_id) x),
        'counts', json_build_object('clients',(SELECT count(*) FROM public.clients),'contacts',(SELECT count(*) FROM public.client_contacts),'staff',(SELECT count(*) FROM public.staff),'roles',(SELECT count(*) FROM public.user_roles),'auth_users',(SELECT count(*) FROM auth.users)),
        'phase3', json_build_object('engagements',(SELECT count(*) FROM public.engagements),'work_orders',(SELECT count(*) FROM public.work_orders),'time_entries',(SELECT count(*) FROM public.time_entries),'skills',(SELECT count(*) FROM public.skills))
      )::text;`);
    },
    async readCatalogs() {
      return query(`SELECT json_build_object(
        'industries',(SELECT COALESCE(json_agg(json_build_object('industry_id',industry_id,'industry_name',industry_name,'fiscal_year_end',fiscal_year_end,'status',status)),'[]'::json) FROM public.industries),
        'societies',(SELECT COALESCE(json_agg(json_build_object('society_id',society_id,'name',name)),'[]'::json) FROM public.society),
        'categories',(SELECT COALESCE(json_agg(json_build_object('category_id',c.category_id,'category_name',c.category_name,'practica_id',p.practica_id,'practica_abbreviation',p.abbreviation,'default_role_key',c.default_role_key,'default_app_role',c.default_app_role)),'[]'::json) FROM public.categories c JOIN public.practicas p ON p.practica_id=c.practica_id),
        'services',(SELECT COALESCE(json_agg(json_build_object('taxonomy_id',taxonomy_id,'name',name,'is_active',is_active,'practica_id',practica_id)),'[]'::json) FROM public.servicios)
      )::text;`);
    },
    async insertClientUnit({ client, contact, clientId, parentClientId, industryId }) {
      await write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        INSERT INTO public.clients (client_id,client_legal_name,operating_name,tax_id,client_type,parent_client_id,parent_relationship,client_origin,billing_tax_treatment,industry_id,address,is_active)
        SELECT (x->>'clientId')::uuid,x->'client'->>'client_legal_name',NULLIF(x->'client'->>'operating_name',''),x->'client'->>'tax_id',x->'client'->>'client_type',NULLIF(x->>'parentClientId','')::uuid,NULLIF(x->'client'->>'parent_relationship',''),x->'client'->>'client_origin',x->'client'->>'billing_tax_treatment',NULLIF(x->>'industryId','')::uuid,NULLIF(x->'client'->>'address',''),true FROM p
        ON CONFLICT (client_id) DO NOTHING;
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        INSERT INTO public.client_contacts (contact_id,client_id,contact_type,full_name,email,phone,is_active)
        SELECT (x->>'contactId')::uuid,(x->>'clientId')::uuid,'general',x->'contact'->>'full_name',x->'contact'->>'email',x->'contact'->>'phone',true FROM p WHERE jsonb_typeof(x->'contact') = 'object'
        ON CONFLICT (contact_id) DO NOTHING;`, { client, contact, clientId, contactId: contact ? randomUUID() : null, parentClientId, industryId });
    },
    async insertStaff({ staff, staffId, societyId, practicaId, categoryId }) {
      await write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        INSERT INTO public.staff (staff_id,first_name,last_name,id_number,email,short_name,initials,hire_date,termination_date,city,society_id,practica_id,category_id,is_active,is_schedulable,is_blocked,weekly_capacity_hours,target_utilization_percent)
        SELECT (x->>'staffId')::uuid,x->'staff'->>'first_name',x->'staff'->>'last_name',x->'staff'->>'id_number',lower(x->'staff'->>'email'),x->'staff'->>'short_name',NULLIF(x->'staff'->>'initials',''),(x->'staff'->>'hire_date')::date,NULLIF(x->'staff'->>'termination_date','')::date,x->'staff'->>'city',(x->>'societyId')::uuid,(x->>'practicaId')::uuid,(x->>'categoryId')::uuid,true,(x->'staff'->>'is_schedulable')::boolean,false,40,85 FROM p
        ON CONFLICT (staff_id) DO NOTHING;`, { staff, staffId, societyId, practicaId, categoryId });
    },
    async linkAndRole({ staffId, authUserId, expectedRoleKey, expectedLegacyRole, bootstrapUserId, installationId }) {
      await write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        SELECT set_config('request.jwt.claims', json_build_object('sub',x->>'bootstrapUserId','role','authenticated')::text,true) FROM p;
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        SELECT public.sync_user_role_from_category((x->>'staffId')::uuid,x->>'expectedRoleKey','ETL fase 2 ' || (x->>'installationId')) FROM p;`, { staffId, authUserId, expectedRoleKey, expectedLegacyRole, bootstrapUserId, installationId });
    },
    async readClientsByIds(ids) { return query(`SELECT COALESCE(json_agg(row_to_json(x)),'[]'::json)::text FROM (SELECT client_id,client_legal_name,tax_id,parent_client_id,industry_id,is_active FROM public.clients WHERE client_id = ANY(string_to_array(:'ids',',')::uuid[])) x;`, { ids: ids.join(",") }); },
    async readStaffByIds(ids) { return query(`SELECT COALESCE(json_agg(row_to_json(x)),'[]'::json)::text FROM (SELECT s.staff_id,s.auth_user_id,s.termination_date,s.is_active,s.is_schedulable,ur.role,ur.role_key FROM public.staff s LEFT JOIN public.user_roles ur ON ur.user_id=s.auth_user_id WHERE s.staff_id = ANY(string_to_array(:'ids',',')::uuid[])) x;`, { ids: ids.join(",") }); },
    async masterFingerprint() { return query(`SELECT json_build_object('fingerprint',md5(concat_ws('|',(SELECT string_agg(client_id::text||updated_at::text,';' ORDER BY client_id) FROM public.clients),(SELECT string_agg(staff_id::text||auth_user_id::text||termination_date::text,';' ORDER BY staff_id) FROM public.staff))) )::text;`); },
    async countPhase3Tables() { return query(`SELECT json_build_object('engagements',(SELECT count(*) FROM public.engagements),'work_orders',(SELECT count(*) FROM public.work_orders),'time_entries',(SELECT count(*) FROM public.time_entries),'skills',(SELECT count(*) FROM public.skills))::text;`); },
  };
}
