// Adaptador SQL F3. Admite el stack local y Test (guardas de `connectionGuardProblems`); cada escritura entra por psql -1.
import { Fase1Error, classifySqlFailure, connectionGuardProblems, runPsql } from "./fase1-db.mjs";

const LOCK = "ems:etl:fase3";
const payload64 = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");
// En Windows, un lote F3 completo supera el límite de argv de CreateProcess.
// Base64 sólo contiene caracteres seguros para un literal SQL, y se transmite por
// stdin de psql (no por shell ni por `-v`); así se conserva el payload opaco.
const sqlWithPayload = (sql, payload) => sql.replaceAll(":'payload_b64'", `'${payload64(payload)}'`);
const lastJson = (stdout) => { const line = String(stdout).trim().split("\n").filter(Boolean).at(-1); try { return JSON.parse(line); } catch { throw new Fase1Error("SQL", "F3 no recibió JSON SQL interpretable"); } };

export function createFase3DbAdapter({ env = process.env, execFileImpl } = {}) {
  const query = async (sql, vars = {}) => {
    const result = await runPsql(sql, vars, { env, execFileImpl });
    if (!result.ok) throw new Fase1Error("SQL", `lectura F3 fallida: ${classifySqlFailure(result).reason}`);
    return lastJson(result.stdout);
  };
  const write = async (sql, payload) => {
    const result = await runPsql(sqlWithPayload(sql, payload), { lock_key: LOCK }, { env, execFileImpl, singleTransaction: true });
    if (result.ok) return lastJson(result.stdout);
    const failure = classifySqlFailure(result);
    if (failure.kind === "blocked" || /ETL_F3_(?:ROLE|CONFLICT|FOREIGN|CATALOG)/.test(result.stderr ?? "")) throw new Fase1Error("BLOQUEADO", failure.reason);
    throw new Fase1Error(failure.kind === "tool" ? "SQL" : "RECONCILIACION_REQUERIDA", failure.reason);
  };
  return {
    async preflight(config) {
      const issues = connectionGuardProblems(config, env); if (issues.length) throw new Fase1Error("BLOQUEADO", issues.join("; "));
      return query(`SELECT json_build_object(
        'current_user', current_user,
        -- El actor técnico de F3 debe ser el administrador bootstrap de F1 (ficha enlazada, rol admin/admin).
        'technical_admin_ok', EXISTS (SELECT 1 FROM public.staff s JOIN public.user_roles ur ON ur.user_id=s.auth_user_id WHERE s.auth_user_id=:'tech_admin'::uuid AND ur.role='admin' AND ur.role_key='admin'),
        'engagement_rpc', to_regprocedure('public.create_engagement_with_code(text,uuid,uuid,uuid,date,date,text,smallint,smallint,smallint,integer,boolean,boolean,boolean,boolean,date,boolean,uuid,uuid,uuid,uuid,uuid,text,uuid)') IS NOT NULL,
        'sync_rpc', to_regprocedure('public.sync_worksheet_to_wo_budget(uuid,uuid)') IS NOT NULL,
        'note_rpc', to_regprocedure('public.add_installment_note(uuid,uuid,text)') IS NOT NULL,
        'phase3', json_build_object('engagements',(SELECT count(*) FROM public.engagements),'work_orders',(SELECT count(*) FROM public.work_orders),'time_entries',(SELECT count(*) FROM public.time_entries))
      )::text;`, { tech_admin: config.technicalAdminId });
    },
    async inventory() {
      return query(`SELECT json_build_object(
        'periods',(SELECT count(*) FROM public.timesheet_periods),
        'line_approvals',(SELECT count(*) FROM public.timesheet_line_approvals),
        'email_ids',(SELECT COALESCE(json_agg(email_id::text),'[]'::json) FROM public.notification_emails)
      )::text;`);
    },
    async containOwnEmails({ engagementIds }) {
      if (!Array.isArray(engagementIds) || engagementIds.length !== 134) throw new Fase1Error("BLOQUEADO", "contención F3 requiere exactamente 134 encargos propios");
      return write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x), ids AS (SELECT jsonb_array_elements_text(x->'engagementIds') entity_id FROM p), updated AS (
          UPDATE public.notification_emails n SET status='failed',attempts=0,sent_at=NULL,last_error='ETL_F3_NO_DELIVERY',claimed_at=NULL
          WHERE n.status='pending' AND n.entity_id IN (SELECT entity_id FROM ids) RETURNING n.email_id
        ) SELECT json_build_object('contained',(SELECT count(*) FROM updated),'remaining',(SELECT count(*) FROM public.notification_emails n WHERE n.entity_id IN (SELECT entity_id FROM ids) AND n.status <> 'failed' AND n.email_id NOT IN (SELECT email_id FROM updated)),'sent',(SELECT count(*) FROM public.notification_emails n WHERE n.entity_id IN (SELECT entity_id FROM ids) AND n.sent_at IS NOT NULL))::text;`, { engagementIds });
    },
    async engagementCatalog() {
      return query(`SELECT json_build_object(
        'clients',(SELECT COALESCE(json_agg(json_build_object('id',client_id,'name',client_legal_name)),'[]'::json) FROM public.clients WHERE is_active),
        -- Los responsables históricos pueden estar inactivos hoy; F3 conserva esas
        -- referencias, por lo que el catálogo de personal no se filtra por activo.
        'staff',(SELECT COALESCE(json_agg(json_build_object('id',staff_id,'city',city)),'[]'::json) FROM public.staff),
        'societies',(SELECT COALESCE(json_agg(json_build_object('id',society_id,'name',name)),'[]'::json) FROM public.society WHERE is_active),
        'services',(SELECT COALESCE(json_agg(json_build_object('id',taxonomy_id,'name',name)),'[]'::json) FROM public.servicios WHERE is_active)
      )::text;`);
    },
    async matrixCatalog() {
      return query(`SELECT json_build_object(
        'categories',(SELECT COALESCE(json_agg(json_build_object('id',c.category_id,'name',c.category_name,'practice',p.code)),'[]'::json) FROM public.categories c JOIN public.practicas p ON p.practica_id=c.practica_id WHERE p.is_active),
        'activities',(SELECT COALESCE(json_agg(json_build_object('id',a.activity_id,'code',a.activity_code,'practice',p.code)),'[]'::json) FROM public.activity_codes a LEFT JOIN public.practicas p ON p.practica_id=a.practica_id WHERE a.is_active)
      )::text;`);
    },
    // Fase 4 §7: agregados de solo lectura para conciliar contra el legacy. El journal aporta únicamente
    // identidades (UUID por COT); ningún valor esperado sale de la base ni del journal.
    async legacySnapshot({ engagementIds, adminEngagementIds, worksheetIds, woIds }) {
      for (const [name, ids] of Object.entries({ engagementIds, adminEngagementIds, worksheetIds, woIds })) if (!Array.isArray(ids) || !ids.length) throw new Fase1Error("BLOQUEADO", `conciliación legacy requiere ${name}`);
      return query(sqlWithPayload(`WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x),
        eng AS (SELECT v::uuid id FROM p, jsonb_array_elements_text(p.x->'engagementIds') v),
        adm AS (SELECT v::uuid id FROM p, jsonb_array_elements_text(p.x->'adminEngagementIds') v),
        ws AS (SELECT v::uuid id FROM p, jsonb_array_elements_text(p.x->'worksheetIds') v),
        wo AS (SELECT v::uuid id FROM p, jsonb_array_elements_text(p.x->'woIds') v),
        te AS (SELECT t.time_id,t.engagement_id,t.staff_id,t.date_worked,t.hours_logged,t.period_id,t.is_forecast,s.city FROM public.time_entries t JOIN eng ON eng.id=t.engagement_id LEFT JOIN public.staff s ON s.staff_id=t.staff_id)
        SELECT json_build_object(
          'clientEngagements',(SELECT count(*) FROM public.engagements e JOIN eng ON eng.id=e.engagement_id),
          'administrativeEngagements',(SELECT count(*) FROM public.engagements e JOIN adm ON adm.id=e.engagement_id),
          'matrixHours',(SELECT COALESCE(sum(c.budget_hours),0)::text FROM public.activity_worksheet_cells c JOIN ws ON ws.id=c.worksheet_id),
          'expensesCount',(SELECT count(*) FROM public.wo_expense_budget b JOIN wo ON wo.id=b.wo_id),
          'expensesAmount',(SELECT COALESCE(sum(b.budgeted_amount),0)::text FROM public.wo_expense_budget b JOIN wo ON wo.id=b.wo_id),
          'expenseByWo',(SELECT COALESCE(json_agg(json_build_array(q.wo_id::text,q.amount::text)),'[]'::json) FROM (SELECT b.wo_id,sum(b.budgeted_amount) amount FROM public.wo_expense_budget b JOIN wo ON wo.id=b.wo_id GROUP BY b.wo_id) q),
          'plans',(SELECT count(*) FROM public.wo_payment_plan z JOIN wo ON wo.id=z.wo_id),
          'installments',(SELECT count(*) FROM public.wo_payment_installments z JOIN wo ON wo.id=z.wo_id WHERE z.installment_type='fee'),
          'notes',(SELECT count(*) FROM public.wo_installment_notes z JOIN wo ON wo.id=z.wo_id WHERE z.deleted_at IS NULL),
          'installmentSumByWo',(SELECT COALESCE(json_agg(json_build_array(q.wo_id::text,q.amount::text)),'[]'::json) FROM (SELECT z.wo_id,sum(z.amount) amount FROM public.wo_payment_installments z JOIN wo ON wo.id=z.wo_id WHERE z.installment_type='fee' GROUP BY z.wo_id) q),
          'riskLevelByWo',(SELECT COALESCE(json_agg(json_build_array(w.wo_id::text,COALESCE(w.risk_level,'(nulo)'))),'[]'::json) FROM public.work_orders w JOIN wo ON wo.id=w.wo_id),
          'hoursTotal',(SELECT COALESCE(sum(hours_logged),0)::text FROM te),
          'hoursByEngagement',(SELECT COALESCE(json_agg(json_build_array(q.engagement_id::text,q.hours::text)),'[]'::json) FROM (SELECT engagement_id,sum(hours_logged) hours FROM te GROUP BY engagement_id) q),
          'hoursByStaff',(SELECT COALESCE(json_agg(json_build_array(q.staff_id::text,q.hours::text)),'[]'::json) FROM (SELECT staff_id,sum(hours_logged) hours FROM te GROUP BY staff_id) q),
          'holidayEntries',(SELECT count(*) FROM te JOIN public.holidays h ON h.holiday_date=te.date_worked AND (h.oficina=0 OR h.oficina=CASE btrim(te.city) WHEN 'La Paz' THEN 1 WHEN 'Santa Cruz' THEN 2 END)),
          'holidayHours',(SELECT COALESCE(sum(te.hours_logged),0)::text FROM te JOIN public.holidays h ON h.holiday_date=te.date_worked AND (h.oficina=0 OR h.oficina=CASE btrim(te.city) WHEN 'La Paz' THEN 1 WHEN 'Santa Cruz' THEN 2 END)),
          'periods',(SELECT count(*) FROM public.timesheet_periods),
          'lineApprovals',(SELECT count(*) FROM public.timesheet_line_approvals),
          'historicWithPeriodOrForecast',(SELECT count(*) FROM te WHERE period_id IS NOT NULL OR is_forecast IS DISTINCT FROM false),
          'emailsSent',(SELECT count(*) FROM public.notification_emails n WHERE n.status='sent' AND n.entity_id IN (SELECT id::text FROM eng UNION SELECT id::text FROM adm)),
          'emailsClaimable',(SELECT count(*) FROM public.notification_emails n WHERE n.status IN ('pending','sending') AND n.entity_id IN (SELECT id::text FROM eng UNION SELECT id::text FROM adm))
        )::text;`, { engagementIds, adminEngagementIds, worksheetIds, woIds }));
    },
    // L9 (Fase 4 §7): hashes por clave natural, sin UUID ni marcas de tiempo, para comparar Test con el ensayo local.
    // El TC de los planes BOB es el DEFAULT del ambiente (depende de su historial de TC): solo se compara que sea positivo.
    async fingerprintSnapshot({ engagements }) {
      if (!Array.isArray(engagements) || engagements.length !== 134) throw new Fase1Error("BLOQUEADO", "huella L9 requiere los 134 encargos del journal");
      return query(sqlWithPayload(`WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x),
        cot AS (SELECT e->>'sourceKey' AS cot, (e->>'engagementId')::uuid AS eid, e->>'kind' AS kind FROM p, jsonb_array_elements(p.x->'engagements') e),
        sh AS (SELECT staff_id, md5(lower(btrim(email))) AS h FROM public.staff),
        ck AS (SELECT client_id, md5(coalesce(tax_id,'') || '|' || client_legal_name) AS k FROM public.clients),
        eng AS (SELECT eid FROM cot)
        SELECT json_build_object(
          'clients',(SELECT COALESCE(json_agg(json_build_array(ck.k, md5(row(c.client_type,c.operating_name,c.address,pk.k,c.parent_relationship,c.client_origin,c.billing_tax_treatment,i.industry_name,c.is_active)::text))),'[]'::json)
            FROM public.clients c JOIN ck ON ck.client_id=c.client_id LEFT JOIN ck pk ON pk.client_id=c.parent_client_id LEFT JOIN public.industries i ON i.industry_id=c.industry_id),
          'contacts',(SELECT COALESCE(json_agg(json_build_array(ck.k || ':' || cc.contact_type, md5(row(cc.full_name,cc.email,cc.phone,cc.is_active)::text))),'[]'::json)
            FROM public.client_contacts cc JOIN ck ON ck.client_id=cc.client_id),
          'staff',(SELECT COALESCE(json_agg(json_build_array(sh.h, md5(row(s.first_name,s.last_name,s.id_number,s.short_name,s.initials,s.hire_date,s.termination_date,s.city,so.name,pr.code,ca.category_name,s.is_active,s.is_schedulable,s.is_blocked,s.weekly_capacity_hours,s.target_utilization_percent,ur.role_key,ur.role,(s.auth_user_id IS NOT NULL))::text))),'[]'::json)
            FROM public.staff s JOIN sh ON sh.staff_id=s.staff_id LEFT JOIN public.society so ON so.society_id=s.society_id LEFT JOIN public.practicas pr ON pr.practica_id=s.practica_id LEFT JOIN public.categories ca ON ca.category_id=s.category_id LEFT JOIN public.user_roles ur ON ur.user_id=s.auth_user_id),
          'engagements',(SELECT COALESCE(json_agg(json_build_array(cot.cot, md5(row(
              e.engagement_code,e.engagement_name,e.practica,e.oficina,e.anio_fiscal,e.funcion,e.start_date,e.end_date,e.status,e.is_internal,e.work_order_required,e.activity_required,e.approval_required,e.fecha_cierre,
              ck.k,so.name,sv.code,hp.h,hm.h,hs.h,he.h,hit.h,htx.h,
              ws.status,wsum.hours,wo.currency,wo.season_mode,wo.tax_rate,wo.adjustment_amount,wo.approval_status,wo.risk_status,to_char(wo.approved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI'),
              bl.hours,bl.n,ex.amount,ex.n,pl.payment_days,pl.exchange_rate_mode,CASE WHEN wo.currency='USD' THEN pl.exchange_rate::text ELSE (pl.exchange_rate>0)::text END,
              ins.h,ins.n,nt.n,nt.h,th.hours,th.n,th.h)::text))),'[]'::json)
            FROM cot JOIN public.engagements e ON e.engagement_id=cot.eid AND cot.kind='client'
            LEFT JOIN ck ON ck.client_id=e.client_id LEFT JOIN public.society so ON so.society_id=e.society_id LEFT JOIN public.servicios sv ON sv.taxonomy_id=e.taxonomy_id
            LEFT JOIN sh hp ON hp.staff_id=e.partner_id LEFT JOIN sh hm ON hm.staff_id=e.manager_id LEFT JOIN sh hs ON hs.staff_id=e.sqr_id LEFT JOIN sh he ON he.staff_id=e.encargado_id LEFT JOIN sh hit ON hit.staff_id=e.specialist_it_id LEFT JOIN sh htx ON htx.staff_id=e.specialist_tax_id
            LEFT JOIN LATERAL (SELECT w.id, w.status FROM public.activity_worksheets w WHERE w.engagement_id=e.engagement_id ORDER BY w.version DESC LIMIT 1) ws ON true
            LEFT JOIN LATERAL (SELECT sum(c.budget_hours) AS hours FROM public.activity_worksheet_cells c WHERE c.worksheet_id=ws.id) wsum ON true
            LEFT JOIN public.work_orders wo ON wo.engagement_id=e.engagement_id
            LEFT JOIN LATERAL (SELECT sum(l.budgeted_hours) AS hours, count(*) AS n FROM public.wo_budget_lines l WHERE l.wo_id=wo.wo_id) bl ON true
            LEFT JOIN LATERAL (SELECT sum(b.budgeted_amount) AS amount, count(*) AS n FROM public.wo_expense_budget b WHERE b.wo_id=wo.wo_id) ex ON true
            LEFT JOIN public.wo_payment_plan pl ON pl.wo_id=wo.wo_id
            LEFT JOIN LATERAL (SELECT md5(string_agg(row(i.installment_number,i.percentage,i.amount,i.currency,i.status,i.installment_type,i.agreed_invoice_date,i.agreed_payment_date,CASE WHEN wo.currency='USD' THEN i.invoice_exchange_rate::text ELSE (i.invoice_exchange_rate>0)::text END)::text,'|' ORDER BY i.installment_number)) AS h, count(*) AS n FROM public.wo_payment_installments i WHERE i.wo_id=wo.wo_id) ins ON true
            LEFT JOIN LATERAL (SELECT count(*) AS n, md5(COALESCE(string_agg(nn.body,'|' ORDER BY nn.body),'')) AS h FROM public.wo_installment_notes nn WHERE nn.wo_id=wo.wo_id AND nn.deleted_at IS NULL) nt ON true
            LEFT JOIN LATERAL (SELECT sum(t.hours_logged) AS hours, count(*) AS n, md5(COALESCE(string_agg(row(t.date_worked,s2.h,ac.activity_code,t.hours_logged,t.is_forecast,t.etl_split_index)::text,'|' ORDER BY t.date_worked,s2.h,ac.activity_code,t.etl_split_index),'')) AS h FROM public.time_entries t JOIN sh s2 ON s2.staff_id=t.staff_id LEFT JOIN public.activity_codes ac ON ac.activity_id=t.activity_id WHERE t.engagement_id=e.engagement_id) th ON true),
          'administrative',(SELECT COALESCE(json_agg(json_build_array(cot.cot, md5(row(e.engagement_code,e.engagement_name,e.practica,e.oficina,e.anio_fiscal,e.funcion,e.start_date,e.end_date,e.status,e.is_internal,e.work_order_required,e.activity_required,e.approval_required,ck.k,so.name,hp.h,hm.h,
              (SELECT count(*) FROM public.activity_worksheets w WHERE w.engagement_id=e.engagement_id),(SELECT count(*) FROM public.work_orders w2 WHERE w2.engagement_id=e.engagement_id),(SELECT count(*) FROM public.time_entries t WHERE t.engagement_id=e.engagement_id))::text))),'[]'::json)
            FROM cot JOIN public.engagements e ON e.engagement_id=cot.eid AND cot.kind='administrative' LEFT JOIN ck ON ck.client_id=e.client_id LEFT JOIN public.society so ON so.society_id=e.society_id LEFT JOIN sh hp ON hp.staff_id=e.partner_id LEFT JOIN sh hm ON hm.staff_id=e.manager_id),
          'hoursByStaff',(SELECT COALESCE(json_agg(json_build_array(q.h, md5(q.hours::text))),'[]'::json) FROM (SELECT s2.h, sum(t.hours_logged) AS hours FROM public.time_entries t JOIN sh s2 ON s2.staff_id=t.staff_id WHERE t.engagement_id IN (SELECT eid FROM eng) GROUP BY s2.h) q),
          'emailQueue',(SELECT COALESCE(json_agg(json_build_array(q.k, md5(q.n::text))),'[]'::json) FROM (SELECT n.type_key || '|' || n.status || '|' || COALESCE(n.last_error,'-') AS k, count(*) AS n FROM public.notification_emails n WHERE n.entity_id IN (SELECT eid::text FROM eng) GROUP BY 1) q)
        )::text;`, { engagements }));
    },
    async holidayCatalog() {
      return query(`SELECT json_build_object(
        'holidays',(SELECT COALESCE(json_agg(json_build_object('date',holiday_date,'office',oficina,'name',holiday_name) ORDER BY holiday_date,oficina),'[]'::json) FROM public.holidays)
      )::text;`);
    },
    async workOrderCatalog() {
      return query(`SELECT json_build_object(
        'clients',(SELECT COALESCE(json_agg(json_build_object('id',c.client_id,'industryEnd',i.fiscal_year_end,'industryStatus',i.status)),'[]'::json) FROM public.clients c LEFT JOIN public.industries i ON i.industry_id=c.industry_id)
      )::text;`);
    },
    async expenseCatalog() {
      return query(`SELECT json_build_object(
        'expenseTypes',(SELECT COALESCE(json_agg(json_build_object('id',expense_type_id,'name',expense_name) ORDER BY expense_name),'[]'::json) FROM public.expense_types WHERE is_active)
      )::text;`);
    },
    async createEngagements({ technicalAdminId, engagements }) {
      if (!technicalAdminId || !Array.isArray(engagements) || !engagements.length) throw new Fase1Error("BLOQUEADO", "lote de encargos F3 inválido");
      return write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        SET LOCAL ROLE authenticated;
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x),
        claims AS (
          SELECT set_config('request.jwt.claims', json_build_object('sub',p.x->>'technicalAdminId','role','authenticated')::text,true) FROM p
        ), created AS (
          SELECT src->>'sourceKey' source_key, e.engagement_id, e.engagement_code
          FROM p CROSS JOIN claims
          CROSS JOIN LATERAL jsonb_array_elements(p.x->'engagements') src
          CROSS JOIN LATERAL public.create_engagement_with_code(
            src->>'name', (src->>'clientId')::uuid, (src->>'partnerId')::uuid, (src->>'managerId')::uuid,
            (src->>'startDate')::date, (src->>'endDate')::date, src->>'status', (src->>'office')::smallint,
            (src->>'practice')::smallint, (src->>'function')::smallint, (src->>'fiscalYear')::integer,
            (src->>'workOrderRequired')::boolean, (src->>'activityRequired')::boolean, (src->>'internal')::boolean,
            (src->>'approvalRequired')::boolean, (src->>'closingDate')::date, (src->>'fiscalOverride')::boolean,
            (src->>'societyId')::uuid, NULLIF(src->>'sqrId','')::uuid, NULLIF(src->>'encargadoId','')::uuid,
            NULLIF(src->>'itSpecialistId','')::uuid, NULLIF(src->>'taxSpecialistId','')::uuid,
            NULLIF(src->>'contractFilePath',''), NULLIF(src->>'taxonomyId','')::uuid
          ) e
        ) SELECT COALESCE(json_agg(json_build_object('sourceKey',source_key,'engagementId',engagement_id,'engagementCode',engagement_code) ORDER BY source_key),'[]'::json)::text FROM created;`, { technicalAdminId, engagements });
    },
    // Relectura por tupla completa y autor técnico. Una coincidencia por fuente es
    // recuperable; cero permite reintento y más de una nunca se "adopta".
    async findEngagementMatches({ technicalAdminId, engagements }) {
      if (!technicalAdminId || !Array.isArray(engagements) || !engagements.length) throw new Fase1Error("BLOQUEADO", "relectura de encargos F3 inválida");
      return query(sqlWithPayload(`WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x),
        actor AS (SELECT staff_id FROM public.staff WHERE auth_user_id = (SELECT x->>'technicalAdminId' FROM p)::uuid),
        expected AS (SELECT src FROM p CROSS JOIN LATERAL jsonb_array_elements(p.x->'engagements') src),
        matched AS (
          SELECT src->>'sourceKey' source_key, COALESCE(json_agg(json_build_object('engagementId',e.engagement_id,'engagementCode',e.engagement_code) ORDER BY e.engagement_code) FILTER (WHERE e.engagement_id IS NOT NULL),'[]'::json) engagements
          FROM expected CROSS JOIN actor
          LEFT JOIN public.engagements e ON e.engagement_name = src->>'name'
            AND e.client_id = (src->>'clientId')::uuid AND e.partner_id = (src->>'partnerId')::uuid
            AND e.manager_id IS NOT DISTINCT FROM NULLIF(src->>'managerId','')::uuid
            AND e.start_date = (src->>'startDate')::date AND e.end_date = (src->>'endDate')::date AND e.status = src->>'status'
            AND e.oficina = (src->>'office')::smallint AND e.practica = (src->>'practice')::smallint AND e.funcion = (src->>'function')::smallint
            AND e.anio_fiscal = (src->>'fiscalYear')::integer AND e.work_order_required = (src->>'workOrderRequired')::boolean
            AND e.activity_required = (src->>'activityRequired')::boolean AND e.is_internal = (src->>'internal')::boolean
            AND e.approval_required = (src->>'approvalRequired')::boolean AND e.fecha_cierre = (src->>'closingDate')::date
            AND e.anio_fiscal_override = (src->>'fiscalOverride')::boolean AND e.society_id = (src->>'societyId')::uuid
            AND e.sqr_id IS NOT DISTINCT FROM NULLIF(src->>'sqrId','')::uuid AND e.encargado_id IS NOT DISTINCT FROM NULLIF(src->>'encargadoId','')::uuid
            AND e.specialist_it_id IS NOT DISTINCT FROM NULLIF(src->>'itSpecialistId','')::uuid AND e.specialist_tax_id IS NOT DISTINCT FROM NULLIF(src->>'taxSpecialistId','')::uuid
            AND e.contract_file_path IS NOT DISTINCT FROM NULLIF(src->>'contractFilePath','') AND e.taxonomy_id IS NOT DISTINCT FROM NULLIF(src->>'taxonomyId','')::uuid
            AND e.created_by_staff_id = actor.staff_id
          GROUP BY src
        ) SELECT json_build_object('actorStaffId',(SELECT staff_id FROM actor),'matches',COALESCE((SELECT json_agg(json_build_object('sourceKey',source_key,'engagements',engagements) ORDER BY source_key) FROM matched),'[]'::json))::text;`, { technicalAdminId, engagements }));
    },
    async createMatrices({ technicalAdminId, matrices }) {
      if (!technicalAdminId || !Array.isArray(matrices) || !matrices.length) throw new Fase1Error("BLOQUEADO", "lote de matrices F3 inválido");
      return write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        SELECT set_config('request.jwt.claims', json_build_object('sub',p.x->>'technicalAdminId','role','authenticated')::text,true) FROM p;
        SET LOCAL ROLE authenticated;
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x),
        actor AS (SELECT s.staff_id FROM public.staff s WHERE s.auth_user_id=(SELECT x->>'technicalAdminId' FROM p)::uuid),
        inserted_worksheets AS (
          INSERT INTO public.activity_worksheets (id,engagement_id,wo_id,version,status,notes,created_by_staff_id)
          SELECT (src->>'worksheetId')::uuid,(src->>'engagementId')::uuid,NULL,1,'draft',NULL,actor.staff_id
          FROM p CROSS JOIN actor CROSS JOIN LATERAL jsonb_array_elements(p.x->'matrices') src
          RETURNING id
        ), inserted_cells AS (
          INSERT INTO public.activity_worksheet_cells (id,worksheet_id,category_id,activity_id,budget_hours)
          SELECT (cell->>'cellId')::uuid,(src->>'worksheetId')::uuid,(cell->>'categoryId')::uuid,(cell->>'activityId')::uuid,(cell->>'budgetHours')::numeric(10,2)
          FROM p CROSS JOIN LATERAL jsonb_array_elements(p.x->'matrices') src CROSS JOIN LATERAL jsonb_array_elements(src->'cells') cell
          RETURNING id
        ) SELECT json_build_object('worksheets',(SELECT count(*) FROM inserted_worksheets),'cells',(SELECT count(*) FROM inserted_cells))::text;`, { technicalAdminId, matrices });
    },
    // Recuperación acotada del primer ensayo: activity_worksheets no tiene trigger
    // de autor. Sólo completa el autor técnico cuando la fila reservada coincide y
    // su creador sigue NULL; nunca reemplaza una autoría existente.
    async repairMatrixCreators({ technicalAdminId, matrices }) {
      return write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        SELECT set_config('request.jwt.claims', json_build_object('sub',p.x->>'technicalAdminId','role','authenticated')::text,true) FROM p;
        SET LOCAL ROLE authenticated;
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x),
        actor AS (SELECT s.staff_id FROM public.staff s WHERE s.auth_user_id=(SELECT x->>'technicalAdminId' FROM p)::uuid),
        updated AS (
          UPDATE public.activity_worksheets w SET created_by_staff_id=actor.staff_id
          FROM p CROSS JOIN actor CROSS JOIN LATERAL jsonb_array_elements(p.x->'matrices') src
          WHERE w.id=(src->>'worksheetId')::uuid AND w.engagement_id=(src->>'engagementId')::uuid
            AND w.wo_id IS NULL AND w.version=1 AND w.status='draft' AND w.notes IS NULL AND w.created_by_staff_id IS NULL
          RETURNING w.id
        ) SELECT json_build_object('updated',(SELECT count(*) FROM updated))::text;`, { technicalAdminId, matrices });
    },
    async findMatrixMatches({ technicalAdminId, matrices }) {
      if (!technicalAdminId || !Array.isArray(matrices) || !matrices.length) throw new Fase1Error("BLOQUEADO", "relectura de matrices F3 inválida");
      return query(sqlWithPayload(`WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x),
        actor AS (SELECT staff_id FROM public.staff WHERE auth_user_id=(SELECT x->>'technicalAdminId' FROM p)::uuid),
        expected AS (SELECT src FROM p CROSS JOIN LATERAL jsonb_array_elements(p.x->'matrices') src),
        per_matrix AS (
          SELECT src->>'sourceKey' source_key,
            (SELECT count(*) FROM public.activity_worksheets w WHERE w.id=(src->>'worksheetId')::uuid AND w.engagement_id=(src->>'engagementId')::uuid AND w.wo_id IS NULL AND w.version=1 AND w.status='draft' AND w.notes IS NULL AND w.created_by_staff_id=(SELECT staff_id FROM actor)) worksheet_matches,
            (SELECT count(*) FROM public.activity_worksheets w WHERE w.engagement_id=(src->>'engagementId')::uuid) engagement_worksheets,
            (SELECT count(*) FROM public.activity_worksheet_cells c WHERE c.worksheet_id=(src->>'worksheetId')::uuid) actual_cells,
            (SELECT count(*) FROM jsonb_array_elements(src->'cells') cell JOIN public.activity_worksheet_cells c ON c.id=(cell->>'cellId')::uuid AND c.worksheet_id=(src->>'worksheetId')::uuid AND c.category_id=(cell->>'categoryId')::uuid AND c.activity_id=(cell->>'activityId')::uuid AND c.budget_hours=(cell->>'budgetHours')::numeric) matching_cells,
            jsonb_array_length(src->'cells') expected_cells
          FROM expected
        ) SELECT json_build_object('actorStaffId',(SELECT staff_id FROM actor),'matches',COALESCE((SELECT json_agg(json_build_object('sourceKey',source_key,'worksheetMatches',worksheet_matches,'engagementWorksheets',engagement_worksheets,'actualCells',actual_cells,'matchingCells',matching_cells,'expectedCells',expected_cells) ORDER BY source_key) FROM per_matrix),'[]'::json))::text;`, { technicalAdminId, matrices }));
    },
    async createWorkOrder({ technicalAdminId, workOrder }) {
      if (!technicalAdminId || !workOrder?.woId || !workOrder?.engagementId) throw new Fase1Error("BLOQUEADO", "OT F3 inválida");
      return write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        SELECT set_config('request.jwt.claims', json_build_object('sub',p.x->>'technicalAdminId','role','authenticated')::text,true) FROM p;
        SET LOCAL ROLE authenticated;
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        INSERT INTO public.work_orders (wo_id,engagement_id,currency,season_mode,tax_rate,adjustment_amount,notes,approval_status,risk_status)
        SELECT (x->'workOrder'->>'woId')::uuid,(x->'workOrder'->>'engagementId')::uuid,x->'workOrder'->>'currency',x->'workOrder'->>'seasonMode',(x->'workOrder'->>'taxRate')::numeric,(x->'workOrder'->>'adjustmentAmount')::numeric,NULL,'Draft','Pending' FROM p
        RETURNING json_build_object('woId',wo_id,'engagementId',engagement_id)::text;`, { technicalAdminId, workOrder });
    },
    async findWorkOrder({ workOrder }) {
      if (!workOrder?.woId || !workOrder?.engagementId) throw new Fase1Error("BLOQUEADO", "relectura OT F3 inválida");
      return query(sqlWithPayload(`WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x), w AS (SELECT x->'workOrder' row FROM p)
        SELECT json_build_object('exact',(SELECT count(*) FROM public.work_orders o CROSS JOIN w WHERE o.wo_id=(w.row->>'woId')::uuid AND o.engagement_id=(w.row->>'engagementId')::uuid AND o.currency=w.row->>'currency' AND o.season_mode=w.row->>'seasonMode' AND o.tax_rate=(w.row->>'taxRate')::numeric AND o.adjustment_amount=(w.row->>'adjustmentAmount')::numeric AND o.notes IS NULL AND o.approval_status='Draft' AND o.risk_status='Pending'),'forEngagement',(SELECT count(*) FROM public.work_orders o CROSS JOIN w WHERE o.engagement_id=(w.row->>'engagementId')::uuid))::text;`, { workOrder }));
    },
    async syncWorksheetToWorkOrder({ technicalAdminId, worksheetId, woId }) {
      if (!technicalAdminId || !worksheetId || !woId) throw new Fase1Error("BLOQUEADO", "sincronización F3 inválida");
      return write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        SELECT set_config('request.jwt.claims', json_build_object('sub',p.x->>'technicalAdminId','role','authenticated')::text,true) FROM p;
        SET LOCAL ROLE authenticated;
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        SELECT public.sync_worksheet_to_wo_budget((x->>'worksheetId')::uuid,(x->>'woId')::uuid) FROM p;
        SELECT json_build_object('synced',true)::text;`, { technicalAdminId, worksheetId, woId });
    },
    async findWorkOrderSync({ worksheetId, woId }) {
      if (!worksheetId || !woId) throw new Fase1Error("BLOQUEADO", "relectura de sincronización F3 inválida");
      return query(sqlWithPayload(`WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x),
        m AS (SELECT c.category_id,sum(c.budget_hours) hours FROM public.activity_worksheet_cells c WHERE c.worksheet_id=(SELECT (x->>'worksheetId')::uuid FROM p) GROUP BY c.category_id),
        b AS (SELECT l.category_id,sum(l.budgeted_hours) hours, min(l.standard_rate) rate FROM public.wo_budget_lines l WHERE l.wo_id=(SELECT (x->>'woId')::uuid FROM p) GROUP BY l.category_id),
        differences AS (SELECT 1 FROM m FULL JOIN b USING(category_id) WHERE m.hours IS DISTINCT FROM b.hours OR b.rate IS NULL OR b.rate <= 0)
        SELECT json_build_object('linked',(SELECT count(*) FROM public.activity_worksheets w WHERE w.id=(SELECT (x->>'worksheetId')::uuid FROM p) AND w.wo_id=(SELECT (x->>'woId')::uuid FROM p)),'matrixCategories',(SELECT count(*) FROM m),'budgetCategories',(SELECT count(*) FROM b),'matrixHours',(SELECT COALESCE(sum(hours),0) FROM m),'budgetHours',(SELECT COALESCE(sum(hours),0) FROM b),'differences',(SELECT count(*) FROM differences))::text FROM p;`, { worksheetId, woId }));
    },
    async createExpenses({ technicalAdminId, expenses }) {
      if (!technicalAdminId || !Array.isArray(expenses) || !expenses.length || expenses.some((row) => !row.expenseId || !row.woId || !row.expenseTypeId || !row.amount)) throw new Fase1Error("BLOQUEADO", "gastos F3 inválidos");
      return write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        SELECT set_config('request.jwt.claims', json_build_object('sub',p.x->>'technicalAdminId','role','authenticated')::text,true) FROM p;
        SET LOCAL ROLE authenticated;
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x),
        inserted AS (
          INSERT INTO public.wo_expense_budget (wo_exp_id,wo_id,expense_type_id,budgeted_amount)
          SELECT (src->>'expenseId')::uuid,(src->>'woId')::uuid,(src->>'expenseTypeId')::uuid,(src->>'amount')::numeric(15,2)
          FROM p CROSS JOIN LATERAL jsonb_array_elements(p.x->'expenses') src
          RETURNING wo_exp_id
        ) SELECT json_build_object('inserted',(SELECT count(*) FROM inserted))::text;`, { technicalAdminId, expenses });
    },
    async findExpenseMatches({ expenses }) {
      if (!Array.isArray(expenses) || !expenses.length) throw new Fase1Error("BLOQUEADO", "relectura de gastos F3 inválida");
      return query(sqlWithPayload(`WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x),
        expected AS (SELECT src FROM p CROSS JOIN LATERAL jsonb_array_elements(p.x->'expenses') src),
        matches AS (
          SELECT src->>'sourceKey' source_key,
            (SELECT count(*) FROM public.wo_expense_budget e WHERE e.wo_exp_id=(src->>'expenseId')::uuid) id_matches,
            (SELECT count(*) FROM public.wo_expense_budget e WHERE e.wo_exp_id=(src->>'expenseId')::uuid AND e.wo_id=(src->>'woId')::uuid AND e.expense_type_id=(src->>'expenseTypeId')::uuid AND e.budgeted_amount=(src->>'amount')::numeric) exact_matches,
            (SELECT count(*) FROM public.wo_expense_budget e WHERE e.wo_id=(src->>'woId')::uuid) work_order_expenses
          FROM expected
        ) SELECT json_build_object('matches',COALESCE((SELECT json_agg(json_build_object('sourceKey',source_key,'idMatches',id_matches,'exactMatches',exact_matches,'workOrderExpenses',work_order_expenses) ORDER BY source_key) FROM matches),'[]'::json))::text;`, { expenses }));
    },
    async paymentFinancials({ workOrders }) {
      if (!Array.isArray(workOrders) || !workOrders.length) throw new Fase1Error("BLOQUEADO", "finanzas de pagos F3 inválidas");
      return query(sqlWithPayload(`WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x), expected AS (
        SELECT src FROM p CROSS JOIN LATERAL jsonb_array_elements(p.x->'workOrders') src
      ), financial_rows AS (
        SELECT src->>'sourceKey' source_key,w.wo_id,w.currency,COALESCE(round(sum(l.budgeted_hours*l.standard_rate),2),0) standard_fee,w.adjustment_amount,round(COALESCE(sum(l.budgeted_hours*l.standard_rate),0)+w.adjustment_amount,2) adjusted_fee
        FROM expected JOIN public.work_orders w ON w.wo_id=(src->>'woId')::uuid LEFT JOIN public.wo_budget_lines l ON l.wo_id=w.wo_id GROUP BY src,w.wo_id,w.currency,w.adjustment_amount
      ) SELECT json_build_object('financials',COALESCE((SELECT json_agg(json_build_object('sourceKey',source_key,'woId',wo_id,'currency',currency,'standardFee',standard_fee,'adjustmentAmount',adjustment_amount,'adjustedFee',adjusted_fee) ORDER BY source_key) FROM financial_rows),'[]'::json))::text;`, { workOrders }));
    },
    async findPaymentMatches({ payment }) {
      if (!payment?.planId || !payment?.woId || !Array.isArray(payment?.installments) || !payment.installments.length) throw new Fase1Error("BLOQUEADO", "relectura de pagos F3 inválida");
      return query(sqlWithPayload(`WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x), q AS (SELECT x->'payment' row FROM p),
        expected_installments AS (SELECT src FROM q CROSS JOIN LATERAL jsonb_array_elements(q.row->'installments') src),
        expected_notes AS (SELECT src FROM q CROSS JOIN LATERAL jsonb_array_elements(COALESCE(q.row->'notes','[]'::jsonb)) src)
        SELECT json_build_object(
          'workOrderCount',(SELECT count(*) FROM public.work_orders w,q WHERE w.wo_id=(q.row->>'woId')::uuid),
          'adjustmentExact',(SELECT count(*) FROM public.work_orders w,q WHERE w.wo_id=(q.row->>'woId')::uuid AND w.adjustment_amount=(q.row->>'adjustmentAmount')::numeric),
          'planIdMatches',(SELECT count(*) FROM public.wo_payment_plan z,q WHERE z.plan_id=(q.row->>'planId')::uuid),
          'planExact',(SELECT count(*) FROM public.wo_payment_plan z,q WHERE z.plan_id=(q.row->>'planId')::uuid AND z.wo_id=(q.row->>'woId')::uuid AND z.payment_days=30 AND z.exchange_rate>0 AND (NULLIF(q.row->>'exchangeRate','') IS NULL OR z.exchange_rate=(q.row->>'exchangeRate')::numeric) AND z.exchange_rate_mode=COALESCE(NULLIF(q.row->>'exchangeRateMode',''),'fijo')),
          'plansForWorkOrder',(SELECT count(*) FROM public.wo_payment_plan z,q WHERE z.wo_id=(q.row->>'woId')::uuid),
          'installmentsForWorkOrder',(SELECT count(*) FROM public.wo_payment_installments z,q WHERE z.wo_id=(q.row->>'woId')::uuid),
          'installmentMatches',(SELECT COALESCE(json_agg(json_build_object('sourceKey',src->>'sourceKey','idMatches',(SELECT count(*) FROM public.wo_payment_installments z WHERE z.installment_id=(src->>'installmentId')::uuid),'exactMatches',(SELECT count(*) FROM public.wo_payment_installments z WHERE z.installment_id=(src->>'installmentId')::uuid AND z.plan_id=(src->>'planId')::uuid AND z.wo_id=(src->>'woId')::uuid AND z.installment_number=(src->>'installmentNumber')::integer AND z.agreed_invoice_date=(src->>'agreedInvoiceDate')::date AND z.agreed_payment_date=(src->>'agreedPaymentDate')::date AND z.percentage=(src->>'percentage')::numeric AND z.amount=(src->>'amount')::numeric AND z.status='Pending' AND z.installment_type='fee' AND z.currency=src->>'currency' AND z.invoice_exchange_rate IS NOT DISTINCT FROM COALESCE(NULLIF(src->>'invoiceExchangeRate','')::numeric,(SELECT pl.exchange_rate FROM public.wo_payment_plan pl WHERE pl.plan_id=(src->>'planId')::uuid)) AND z.payment_exchange_rate IS NOT DISTINCT FROM COALESCE(NULLIF(src->>'paymentExchangeRate','')::numeric,(SELECT pl.exchange_rate FROM public.wo_payment_plan pl WHERE pl.plan_id=(src->>'planId')::uuid))) ORDER BY src->>'sourceKey'),'[]'::json) FROM expected_installments),
          'notesForWorkOrder',(SELECT count(*) FROM public.wo_installment_notes z,q WHERE z.wo_id=(q.row->>'woId')::uuid AND z.deleted_at IS NULL),
          'noteMatches',(SELECT COALESCE(json_agg(json_build_object('sourceKey',src->>'sourceKey','matches',(SELECT count(*) FROM public.wo_installment_notes z WHERE z.wo_id=(src->>'woId')::uuid AND z.installment_id IS NULL AND z.deleted_at IS NULL AND z.body=src->>'body'),'noteIds',(SELECT COALESCE(json_agg(z.note_id ORDER BY z.note_id),'[]'::json) FROM public.wo_installment_notes z WHERE z.wo_id=(src->>'woId')::uuid AND z.installment_id IS NULL AND z.deleted_at IS NULL AND z.body=src->>'body)) ORDER BY src->>'sourceKey'),'[]'::json) FROM expected_notes)
        )::text;`, { payment }));
    },
    async createPayments({ technicalAdminId, payment }) {
      if (!technicalAdminId || !payment?.planId || !payment?.woId || !Array.isArray(payment?.installments) || !payment.installments.length) throw new Fase1Error("BLOQUEADO", "pagos F3 inválidos");
      return write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        SELECT set_config('request.jwt.claims', json_build_object('sub',p.x->>'technicalAdminId','role','authenticated')::text,true) FROM p;
        SET LOCAL ROLE authenticated;
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x), q AS (SELECT x->'payment' row FROM p),
        actor AS (SELECT s.staff_id FROM public.staff s,q WHERE s.auth_user_id=(SELECT x->>'technicalAdminId' FROM p)::uuid),
        adjusted AS (UPDATE public.work_orders w SET adjustment_amount=(q.row->>'adjustmentAmount')::numeric FROM q CROSS JOIN actor WHERE w.wo_id=(q.row->>'woId')::uuid AND w.approval_status='Draft' AND w.adjustment_amount=(q.row->>'previousAdjustmentAmount')::numeric RETURNING w.wo_id),
        plan AS (INSERT INTO public.wo_payment_plan (plan_id,wo_id,exchange_rate,payment_days,exchange_rate_mode) SELECT (q.row->>'planId')::uuid,(q.row->>'woId')::uuid,COALESCE(NULLIF(q.row->>'exchangeRate','')::numeric,public.latest_exchange_rate()),30,COALESCE(NULLIF(q.row->>'exchangeRateMode',''),'fijo') FROM q JOIN adjusted ON true RETURNING plan_id,exchange_rate),
        installments AS (INSERT INTO public.wo_payment_installments (installment_id,plan_id,wo_id,installment_number,agreed_invoice_date,agreed_payment_date,percentage,amount,status,installment_type,currency,invoice_exchange_rate,payment_exchange_rate)
          SELECT (src->>'installmentId')::uuid,(q.row->>'planId')::uuid,(q.row->>'woId')::uuid,(src->>'installmentNumber')::integer,(src->>'agreedInvoiceDate')::date,(src->>'agreedPaymentDate')::date,(src->>'percentage')::numeric,(src->>'amount')::numeric,'Pending','fee',src->>'currency',COALESCE(NULLIF(src->>'invoiceExchangeRate','')::numeric,plan.exchange_rate),COALESCE(NULLIF(src->>'paymentExchangeRate','')::numeric,plan.exchange_rate) FROM q CROSS JOIN LATERAL jsonb_array_elements(q.row->'installments') src JOIN plan ON true RETURNING installment_id),
        notes AS (SELECT src->>'sourceKey' source_key,(public.add_installment_note((src->>'woId')::uuid,NULL,src->>'body')).note_id FROM q CROSS JOIN LATERAL jsonb_array_elements(COALESCE(q.row->'notes','[]'::jsonb)) src JOIN plan ON true)
        SELECT json_build_object('adjusted',(SELECT count(*) FROM adjusted),'plans',(SELECT count(*) FROM plan),'installments',(SELECT count(*) FROM installments),'notes',COALESCE((SELECT json_agg(json_build_object('sourceKey',source_key,'noteId',note_id) ORDER BY source_key) FROM notes),'[]'::json))::text;`, { technicalAdminId, payment });
    },
    // El lote entero se escribe en una sola transacción local: cada COT conserva
    // su árbol atómico y una falla revierte los 124, evitando una recuperación
    // parcial provocada por el límite de procesos de Windows.
    async findPaymentMatchesBatch({ payments }) {
      if (!Array.isArray(payments) || !payments.length) throw new Fase1Error("BLOQUEADO", "relectura de lote de pagos F3 inválida");
      return query(sqlWithPayload(`WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x), expected AS (SELECT src FROM p CROSS JOIN LATERAL jsonb_array_elements(p.x->'payments') src)
        SELECT json_build_object('matches',COALESCE((SELECT json_agg(json_build_object(
          'sourceKey',src->>'sourceKey',
          'workOrderCount',(SELECT count(*) FROM public.work_orders w WHERE w.wo_id=(src->>'woId')::uuid),
          'adjustmentExact',(SELECT count(*) FROM public.work_orders w WHERE w.wo_id=(src->>'woId')::uuid AND w.adjustment_amount=(src->>'adjustmentAmount')::numeric),
          'planIdMatches',(SELECT count(*) FROM public.wo_payment_plan z WHERE z.plan_id=(src->>'planId')::uuid),
          'planExact',(SELECT count(*) FROM public.wo_payment_plan z WHERE z.plan_id=(src->>'planId')::uuid AND z.wo_id=(src->>'woId')::uuid AND z.payment_days=30 AND z.exchange_rate>0 AND (NULLIF(src->>'exchangeRate','') IS NULL OR z.exchange_rate=(src->>'exchangeRate')::numeric) AND z.exchange_rate_mode=COALESCE(NULLIF(src->>'exchangeRateMode',''),'fijo')),
          'plansForWorkOrder',(SELECT count(*) FROM public.wo_payment_plan z WHERE z.wo_id=(src->>'woId')::uuid),
          'installmentsForWorkOrder',(SELECT count(*) FROM public.wo_payment_installments z WHERE z.wo_id=(src->>'woId')::uuid),
          'installmentMatches',(SELECT COALESCE(json_agg(json_build_object('sourceKey',i->>'sourceKey','idMatches',(SELECT count(*) FROM public.wo_payment_installments z WHERE z.installment_id=(i->>'installmentId')::uuid),'exactMatches',(SELECT count(*) FROM public.wo_payment_installments z WHERE z.installment_id=(i->>'installmentId')::uuid AND z.plan_id=(src->>'planId')::uuid AND z.wo_id=(src->>'woId')::uuid AND z.installment_number=(i->>'installmentNumber')::integer AND z.agreed_invoice_date=(i->>'agreedInvoiceDate')::date AND z.agreed_payment_date=(i->>'agreedPaymentDate')::date AND z.percentage=(i->>'percentage')::numeric AND z.amount=(i->>'amount')::numeric AND z.status='Pending' AND z.installment_type='fee' AND z.currency=i->>'currency' AND z.invoice_exchange_rate IS NOT DISTINCT FROM COALESCE(NULLIF(i->>'invoiceExchangeRate','')::numeric,(SELECT pl.exchange_rate FROM public.wo_payment_plan pl WHERE pl.plan_id=(src->>'planId')::uuid)) AND z.payment_exchange_rate IS NOT DISTINCT FROM COALESCE(NULLIF(i->>'paymentExchangeRate','')::numeric,(SELECT pl.exchange_rate FROM public.wo_payment_plan pl WHERE pl.plan_id=(src->>'planId')::uuid)))) ORDER BY i->>'sourceKey'),'[]'::json) FROM jsonb_array_elements(src->'installments') i),
          'notesForWorkOrder',(SELECT count(*) FROM public.wo_installment_notes z WHERE z.wo_id=(src->>'woId')::uuid AND z.deleted_at IS NULL),
          'noteMatches',(SELECT COALESCE(json_agg(json_build_object('sourceKey',n->>'sourceKey','matches',(SELECT count(*) FROM public.wo_installment_notes z WHERE z.wo_id=(n->>'woId')::uuid AND z.installment_id IS NULL AND z.deleted_at IS NULL AND z.body=n->>'body'),'noteIds',(SELECT COALESCE(json_agg(z.note_id ORDER BY z.note_id),'[]'::json) FROM public.wo_installment_notes z WHERE z.wo_id=(n->>'woId')::uuid AND z.installment_id IS NULL AND z.deleted_at IS NULL AND z.body=n->>'body))) ORDER BY n->>'sourceKey'),'[]'::json) FROM jsonb_array_elements(COALESCE(src->'notes','[]'::jsonb)) n)
        ) ORDER BY src->>'sourceKey'),'[]'::json) FROM expected))::text;`, { payments }));
    },
    async createPaymentsBatch({ technicalAdminId, payments }) {
      if (!technicalAdminId || !Array.isArray(payments) || !payments.length) throw new Fase1Error("BLOQUEADO", "lote de pagos F3 inválido");
      return write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        SELECT set_config('request.jwt.claims', json_build_object('sub',p.x->>'technicalAdminId','role','authenticated')::text,true) FROM p;
        SET LOCAL ROLE authenticated;
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x), expected AS (SELECT src FROM p CROSS JOIN LATERAL jsonb_array_elements(p.x->'payments') src), actor AS (SELECT s.staff_id FROM public.staff s,p WHERE s.auth_user_id=(p.x->>'technicalAdminId')::uuid),
        guard AS (SELECT (SELECT count(*) FROM expected)=(SELECT count(*) FROM expected src JOIN public.work_orders w ON w.wo_id=(src->>'woId')::uuid WHERE w.approval_status='Draft' AND w.adjustment_amount=(src->>'previousAdjustmentAmount')::numeric) AND NOT EXISTS (SELECT 1 FROM expected src LEFT JOIN public.wo_payment_plan z ON z.wo_id=(src->>'woId')::uuid LEFT JOIN public.wo_installment_notes n ON n.wo_id=(src->>'woId')::uuid AND n.deleted_at IS NULL WHERE z.plan_id IS NOT NULL OR n.note_id IS NOT NULL) ok),
        adjusted AS (UPDATE public.work_orders w SET adjustment_amount=(src->>'adjustmentAmount')::numeric FROM expected CROSS JOIN actor CROSS JOIN guard WHERE guard.ok AND w.wo_id=(src->>'woId')::uuid RETURNING w.wo_id),
        plans AS (INSERT INTO public.wo_payment_plan (plan_id,wo_id,exchange_rate,payment_days,exchange_rate_mode) SELECT (src->>'planId')::uuid,(src->>'woId')::uuid,COALESCE(NULLIF(src->>'exchangeRate','')::numeric,public.latest_exchange_rate()),30,COALESCE(NULLIF(src->>'exchangeRateMode',''),'fijo') FROM expected JOIN adjusted a ON a.wo_id=(src->>'woId')::uuid RETURNING plan_id,exchange_rate),
        installments AS (INSERT INTO public.wo_payment_installments (installment_id,plan_id,wo_id,installment_number,agreed_invoice_date,agreed_payment_date,percentage,amount,status,installment_type,currency,invoice_exchange_rate,payment_exchange_rate) SELECT (i->>'installmentId')::uuid,(src->>'planId')::uuid,(src->>'woId')::uuid,(i->>'installmentNumber')::integer,(i->>'agreedInvoiceDate')::date,(i->>'agreedPaymentDate')::date,(i->>'percentage')::numeric,(i->>'amount')::numeric,'Pending','fee',i->>'currency',COALESCE(NULLIF(i->>'invoiceExchangeRate','')::numeric,p2.exchange_rate),COALESCE(NULLIF(i->>'paymentExchangeRate','')::numeric,p2.exchange_rate) FROM expected src CROSS JOIN LATERAL jsonb_array_elements(src->'installments') i JOIN plans p2 ON p2.plan_id=(src->>'planId')::uuid RETURNING installment_id),
        notes AS (SELECT n->>'sourceKey' source_key,(public.add_installment_note((n->>'woId')::uuid,NULL,n->>'body')).note_id FROM expected src CROSS JOIN LATERAL jsonb_array_elements(COALESCE(src->'notes','[]'::jsonb)) n JOIN plans p2 ON p2.plan_id=(src->>'planId')::uuid)
        SELECT json_build_object('adjusted',(SELECT count(*) FROM adjusted),'plans',(SELECT count(*) FROM plans),'installments',(SELECT count(*) FROM installments),'notes',(SELECT count(*) FROM notes))::text;`, { technicalAdminId, payments });
    },
    async paymentSnapshotBatch({ payments }) {
      if (!Array.isArray(payments) || !payments.length) throw new Fase1Error("BLOQUEADO", "snapshot de pagos F3 inválido");
      return query(sqlWithPayload(`WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x), expected AS (SELECT src FROM p CROSS JOIN LATERAL jsonb_array_elements(p.x->'payments') src), scope AS (SELECT (src->>'woId')::uuid wo_id FROM expected)
        SELECT json_build_object(
          'workOrders',(SELECT COALESCE(json_agg(json_build_object('woId',w.wo_id,'adjustmentAmount',w.adjustment_amount) ORDER BY w.wo_id),'[]'::json) FROM public.work_orders w WHERE w.wo_id IN (SELECT wo_id FROM scope)),
          'plans',(SELECT COALESCE(json_agg(json_build_object('planId',z.plan_id,'woId',z.wo_id,'exchangeRate',z.exchange_rate,'paymentDays',z.payment_days,'exchangeRateMode',z.exchange_rate_mode) ORDER BY z.plan_id),'[]'::json) FROM public.wo_payment_plan z WHERE z.wo_id IN (SELECT wo_id FROM scope)),
          'installments',(SELECT COALESCE(json_agg(json_build_object('installmentId',z.installment_id,'planId',z.plan_id,'woId',z.wo_id,'installmentNumber',z.installment_number,'agreedInvoiceDate',z.agreed_invoice_date,'agreedPaymentDate',z.agreed_payment_date,'percentage',z.percentage,'amount',z.amount,'status',z.status,'installmentType',z.installment_type,'currency',z.currency,'invoiceExchangeRate',z.invoice_exchange_rate,'paymentExchangeRate',z.payment_exchange_rate) ORDER BY z.installment_id),'[]'::json) FROM public.wo_payment_installments z WHERE z.wo_id IN (SELECT wo_id FROM scope)),
          'notes',(SELECT COALESCE(json_agg(json_build_object('noteId',z.note_id,'woId',z.wo_id,'installmentId',z.installment_id,'body',z.body) ORDER BY z.note_id),'[]'::json) FROM public.wo_installment_notes z WHERE z.wo_id IN (SELECT wo_id FROM scope) AND z.deleted_at IS NULL)
        )::text;`, { payments }));
    },
    async findRiskMatches({ risks }) {
      if (!Array.isArray(risks) || !risks.length) throw new Fase1Error("BLOQUEADO", "relectura de riesgos F3 inválida");
      return query(sqlWithPayload(`WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x), expected AS (SELECT src FROM p CROSS JOIN LATERAL jsonb_array_elements(p.x->'risks') src), matched AS (
        SELECT src->>'sourceKey' source_key,count(w.wo_id) for_work_order,count(w.wo_id) FILTER (WHERE w.risk_level IS NOT DISTINCT FROM src->>'riskLevel' AND w.risk_notes=src->>'riskNotes' AND w.ceac_number IS NOT DISTINCT FROM NULLIF(src->>'ceacNumber','') AND w.ceac_completed_at IS NOT DISTINCT FROM NULLIF(src->>'ceacCompletedAt','')::date AND w.san_approval_id IS NOT DISTINCT FROM NULLIF(src->>'sanApprovalId','') AND w.san_completed_at IS NOT DISTINCT FROM NULLIF(src->>'sanCompletedAt','')::date AND w.risk_status='Approved' AND w.risk_approved_by IS NULL AND w.risk_approved_at IS NULL AND w.approval_status='Approved' AND w.approved_by=e.partner_id AND w.approved_at=(src->>'approvedAt')::timestamptz) exact
        FROM expected LEFT JOIN public.work_orders w ON w.wo_id=(src->>'woId')::uuid LEFT JOIN public.engagements e ON e.engagement_id=w.engagement_id GROUP BY src
      ) SELECT json_build_object('matches',COALESCE((SELECT json_agg(json_build_object('sourceKey',source_key,'exact',exact,'forWorkOrder',for_work_order) ORDER BY source_key) FROM matched),'[]'::json))::text;`, { risks }));
    },
    async createRisks({ technicalAdminId, risks }) {
      if (!technicalAdminId || !Array.isArray(risks) || !risks.length) throw new Fase1Error("BLOQUEADO", "riesgos F3 inválidos");
      return write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        SELECT set_config('request.jwt.claims', json_build_object('sub',p.x->>'technicalAdminId','role','authenticated')::text,true) FROM p;
        SET LOCAL ROLE authenticated;
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x), expected AS (SELECT src FROM p CROSS JOIN LATERAL jsonb_array_elements(p.x->'risks') src), actor AS (SELECT staff_id FROM public.staff s,p WHERE s.auth_user_id=(p.x->>'technicalAdminId')::uuid),
        updated AS (UPDATE public.work_orders w SET risk_level=src->>'riskLevel',risk_notes=src->>'riskNotes',ceac_number=NULLIF(src->>'ceacNumber',''),ceac_completed_at=NULLIF(src->>'ceacCompletedAt','')::date,san_approval_id=NULLIF(src->>'sanApprovalId',''),san_completed_at=NULLIF(src->>'sanCompletedAt','')::date,risk_status='Approved',risk_approved_by=NULL,risk_approved_at=NULL,approved_by=e.partner_id,approved_at=(src->>'approvedAt')::timestamptz,approval_status='Approved' FROM expected src CROSS JOIN actor CROSS JOIN public.engagements e WHERE w.wo_id=(src->>'woId')::uuid AND e.engagement_id=w.engagement_id AND w.approval_status='Draft' AND w.risk_status='Pending' RETURNING w.wo_id)
        SELECT json_build_object('updated',(SELECT count(*) FROM updated))::text;`, { technicalAdminId, risks });
    },
    async hourSnapshot({ entries }) {
      if (!Array.isArray(entries) || !entries.length) throw new Fase1Error("BLOQUEADO", "snapshot de horas F3 inválido");
      return query(sqlWithPayload(`WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x), expected AS (SELECT src FROM p CROSS JOIN LATERAL jsonb_array_elements(p.x->'entries') src)
        SELECT json_build_object('entries',COALESCE((SELECT json_agg(json_build_object('timeId',t.time_id,'dateWorked',t.date_worked,'hours',t.hours_logged,'staffId',t.staff_id,'engagementId',t.engagement_id,'activityId',t.activity_id,'etlSplitIndex',t.etl_split_index,'periodId',t.period_id,'isForecast',t.is_forecast) ORDER BY t.time_id) FROM public.time_entries t WHERE t.time_id IN (SELECT (src->>'timeId')::uuid FROM expected)),'[]'::json))::text;`, { entries }));
    },
    async createHours({ technicalAdminId, entries }) {
      if (!technicalAdminId || !Array.isArray(entries) || !entries.length) throw new Fase1Error("BLOQUEADO", "horas F3 inválidas");
      return write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        SELECT set_config('request.jwt.claims', json_build_object('sub',p.x->>'technicalAdminId','role','authenticated')::text,true) FROM p;
        -- Marca de la carga histórica: enforce_holiday_blocking admite SOLO este INSERT en un feriado (y solo desde la sesión propietaria).
        SELECT set_config('etl.f3_historical_hours','on',true);
        -- La carga histórica local usa la conexión PostgreSQL administradora autorizada.
        -- No se cambia a authenticated: esa policy sólo permite al propio empleado
        -- y no existe una RPC aprobada para actuar por los demás colaboradores.
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x), expected AS (SELECT src FROM p CROSS JOIN LATERAL jsonb_array_elements(p.x->'entries') src), actor AS (SELECT staff_id FROM public.staff s,p WHERE s.auth_user_id=(p.x->>'technicalAdminId')::uuid), inserted AS (
          INSERT INTO public.time_entries (time_id,date_worked,hours_logged,staff_id,engagement_id,activity_id,description,period_id,is_forecast,etl_split_index)
          SELECT (src->>'timeId')::uuid,(src->>'dateWorked')::date,(src->>'hours')::numeric,(src->>'staffId')::uuid,(src->>'engagementId')::uuid,(src->>'activityId')::uuid,NULL,NULL,false,COALESCE((src->>'etlSplitIndex')::smallint,1) FROM expected CROSS JOIN actor
          RETURNING time_id
        ) SELECT json_build_object('inserted',(SELECT count(*) FROM inserted))::text;`, { technicalAdminId, entries });
    },
    // El payload ya fue calculado/validado por los módulos puros. El SQL fija el rol autenticado
    // y toma el advisory lock; la aplicación concreta de cada contrato queda deliberadamente en
    // unidades separadas para no reintentar una RPC mutante después de una respuesta incierta.
    async executeBlock({ block, payload, technicalAdminId }) {
      if (!technicalAdminId) throw new Fase1Error("BLOQUEADO", "falta actor técnico F3");
      return write(`SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key',0));
        WITH p AS (SELECT convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb x)
        SELECT set_config('request.jwt.claims', json_build_object('sub',p.x->>'technicalAdminId','role','authenticated')::text,true) FROM p;
        SET LOCAL ROLE authenticated;
        DO $etl$ BEGIN
          IF current_setting('request.jwt.claims', true) IS NULL THEN RAISE EXCEPTION 'ETL_F3_ROLE: claims ausentes'; END IF;
          IF current_setting('etl.f3_block', true) IS NOT NULL THEN RAISE EXCEPTION 'ETL_F3_CONFLICT: bloque duplicado'; END IF;
          PERFORM set_config('etl.f3_block', current_setting('request.jwt.claims')::text, true);
        END $etl$;
        SELECT json_build_object('ok',true,'block',(convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb)->>'block')::text;`, { block, payload: { ...payload, technicalAdminId }, technicalAdminId });
    },
  };
}
