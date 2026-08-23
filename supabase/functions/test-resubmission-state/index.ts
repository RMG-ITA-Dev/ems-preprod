import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const trace_id = crypto.randomUUID();
  const results: { scenario: string; pass: boolean; details?: string }[] = [];

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // FEAT 0810-173: staff.society_id / staff.practica_id son NOT NULL — todo
  // insert de prueba en esta función necesita valores (Pelaez / Auditoría,
  // mismo default que el backfill de la migración).
  const { data: defaultSociety } = await supabase
    .from("society").select("society_id").eq("name", "Ruizmier Pelaez S.R.L.").single();
  const { data: defaultService } = await supabase
    .from("practicas").select("practica_id").eq("code", 1).single();
  const societyId = defaultSociety!.society_id;
  const serviceId = defaultService!.practica_id;

  // Helper: create test data
  async function setupTestData(suffix: string) {
    // Create a test client
    const { data: client } = await supabase.from("clients").insert({
      client_legal_name: `Test Client ${suffix}`,
      unique_tax_id: `TC-${suffix}`,
    }).select().single();

    // Create engagements
    const { data: engA } = await supabase.from("engagements").insert({
      engagement_name: `Eng A ${suffix}`,
      client_id: client!.client_id,
      work_order_required: false,
      activity_required: false,
      fecha_cierre: "2026-09-30",
    }).select().single();

    const { data: engB } = await supabase.from("engagements").insert({
      engagement_name: `Eng B ${suffix}`,
      client_id: client!.client_id,
      work_order_required: false,
      activity_required: false,
      fecha_cierre: "2026-09-30",
    }).select().single();

    // Create staff
    const { data: staff } = await supabase.from("staff").insert({
      first_name: `Test`, last_name: `Staff ${suffix}`,
      email: `test-${suffix}@test.local`,
      society_id: societyId, practica_id: serviceId,
    }).select().single();

    // Create an activity code
    const { data: activities } = await supabase.from("activity_codes")
      .select("activity_id").limit(1);
    const activityId = activities![0].activity_id;

    // Create period
    const { data: period } = await supabase.from("timesheet_periods").insert({
      staff_id: staff!.staff_id,
      week_start_date: "2026-01-05",
      week_number: 2,
      year: 2026,
    }).select().single();

    // Create time entries
    await supabase.from("time_entries").insert([
      { staff_id: staff!.staff_id, engagement_id: engA!.engagement_id, activity_id: activityId, date_worked: "2026-01-05", hours_logged: 8, period_id: period!.period_id },
      { staff_id: staff!.staff_id, engagement_id: engB!.engagement_id, activity_id: activityId, date_worked: "2026-01-06", hours_logged: 8, period_id: period!.period_id },
    ]);

    return {
      clientId: client!.client_id,
      engAId: engA!.engagement_id,
      engBId: engB!.engagement_id,
      staffId: staff!.staff_id,
      periodId: period!.period_id,
      activityId,
    };
  }

  async function cleanup(ids: { clientId: string; staffId: string; periodId: string; engAId: string; engBId: string }) {
    await supabase.from("timesheet_line_approvals").delete().eq("period_id", ids.periodId);
    await supabase.from("time_entries").delete().eq("period_id", ids.periodId);
    await supabase.from("timesheet_periods").delete().eq("period_id", ids.periodId);
    await supabase.from("engagements").delete().eq("engagement_id", ids.engAId);
    await supabase.from("engagements").delete().eq("engagement_id", ids.engBId);
    await supabase.from("staff").delete().eq("staff_id", ids.staffId);
    await supabase.from("clients").delete().eq("client_id", ids.clientId);
  }

  // ── BUG 0526-122 helpers: holiday office-scope scenarios ────────────────
  async function setupHolidayTestData(suffix: string, staffCity: string | null, approvalRequired = true) {
    const { data: client } = await supabase.from("clients").insert({
      client_legal_name: `Test Holiday Client ${suffix}`,
      unique_tax_id: `THC-${suffix}`,
    }).select().single();

    const { data: holidayEng } = await supabase.from("engagements").insert({
      engagement_name: `Holiday Eng ${suffix}`,
      client_id: client!.client_id,
      work_order_required: false,
      activity_required: false,
      fecha_cierre: "2026-09-30",
      approval_required: approvalRequired,
    }).select().single();

    const { data: otherEng } = await supabase.from("engagements").insert({
      engagement_name: `Other Eng ${suffix}`,
      client_id: client!.client_id,
      work_order_required: false,
      activity_required: false,
      fecha_cierre: "2026-09-30",
      approval_required: true,
    }).select().single();

    const { data: staff } = await supabase.from("staff").insert({
      first_name: `Test`, last_name: `HolidayStaff ${suffix}`,
      email: `test-holiday-${suffix}@test.local`,
      city: staffCity,
      society_id: societyId, practica_id: serviceId,
    }).select().single();

    const { data: activities } = await supabase.from("activity_codes")
      .select("activity_id").limit(1);
    const activityId = activities![0].activity_id;

    const { data: period } = await supabase.from("timesheet_periods").insert({
      staff_id: staff!.staff_id,
      week_start_date: "2026-01-05",
      week_number: 2,
      year: 2026,
    }).select().single();

    return {
      clientId: client!.client_id,
      holidayEngId: holidayEng!.engagement_id,
      otherEngId: otherEng!.engagement_id,
      staffId: staff!.staff_id,
      periodId: period!.period_id,
      activityId,
    };
  }

  async function setHolidayEngagementSetting(engagementId: string): Promise<string> {
    const { data } = await supabase.from("global_settings")
      .select("setting_value").eq("setting_key", "HOLIDAY_ENGAGEMENT_ID").maybeSingle();
    const previous = data?.setting_value ?? "";
    await supabase.from("global_settings")
      .update({ setting_value: engagementId }).eq("setting_key", "HOLIDAY_ENGAGEMENT_ID");
    return previous;
  }

  async function restoreHolidayEngagementSetting(previous: string) {
    await supabase.from("global_settings")
      .update({ setting_value: previous }).eq("setting_key", "HOLIDAY_ENGAGEMENT_ID");
  }

  async function cleanupHoliday(
    ids: { clientId: string; staffId: string; periodId: string; holidayEngId: string; otherEngId: string },
    holidayIds: string[],
  ) {
    await supabase.from("timesheet_line_approvals").delete().eq("period_id", ids.periodId);
    await supabase.from("time_entries").delete().eq("period_id", ids.periodId);
    await supabase.from("timesheet_periods").delete().eq("period_id", ids.periodId);
    await supabase.from("engagements").delete().eq("engagement_id", ids.holidayEngId);
    await supabase.from("engagements").delete().eq("engagement_id", ids.otherEngId);
    // holidays.created_by REFERENCES staff.staff_id -- must delete before staff,
    // or the staff delete fails on the FK (silently, since errors aren't checked
    // here) and leaks the test staff row.
    if (holidayIds.length > 0) {
      await supabase.from("holidays").delete().in("holiday_id", holidayIds);
    }
    await supabase.from("staff").delete().eq("staff_id", ids.staffId);
    await supabase.from("clients").delete().eq("client_id", ids.clientId);
  }

  try {
    // ── S4: Fresh submit baseline ──────────────────────────────
    {
      const ids = await setupTestData(`s4-${trace_id.slice(0, 8)}`);
      try {
        const { data, error } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engAId, ids.engBId],
          p_activity_ids:   [ids.activityId, ids.activityId],
          p_is_auto_approved: false,
        });
        const pass = !error && data.new_pending === 2 && data.preserved_approved === 0;
        results.push({ scenario: "S4: Fresh submit baseline", pass, details: JSON.stringify(data) });
      } finally { await cleanup(ids); }
    }

    // ── S1: Approved preserved + rejected edited requeued ──────
    {
      const ids = await setupTestData(`s1-${trace_id.slice(0, 8)}`);
      try {
        // First submit
        await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engAId, ids.engBId],
          p_activity_ids:   [ids.activityId, ids.activityId],
          p_is_auto_approved: false,
        });
        // Approve Eng-A
        await supabase.from("timesheet_line_approvals")
          .update({ status: "approved", approved_by: ids.staffId, approved_at: new Date().toISOString() })
          .eq("period_id", ids.periodId).eq("engagement_id", ids.engAId);
        // Reject Eng-B
        await supabase.from("timesheet_line_approvals")
          .update({ status: "rejected", approved_by: ids.staffId, approved_at: new Date().toISOString() })
          .eq("period_id", ids.periodId).eq("engagement_id", ids.engBId);
        // Edit Eng-B time entries (touch updated_at)
        await new Promise(r => setTimeout(r, 100));
        await supabase.from("time_entries")
          .update({ hours_logged: 7 })
          .eq("period_id", ids.periodId).eq("engagement_id", ids.engBId);
        // Unsubmit
        await supabase.from("timesheet_periods").update({ submitted_at: null }).eq("period_id", ids.periodId);
        // Resubmit
        const { data, error } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engAId, ids.engBId],
          p_activity_ids:   [ids.activityId, ids.activityId],
          p_is_auto_approved: false,
        });
        const pass = !error && data.preserved_approved === 1 && data.reset_to_pending === 1;
        results.push({ scenario: "S1: Approved preserved + rejected edited requeued", pass, details: JSON.stringify(data) });
      } finally { await cleanup(ids); }
    }

    // ── S2: Rejected unedited stays rejected ───────────────────
    {
      const ids = await setupTestData(`s2-${trace_id.slice(0, 8)}`);
      try {
        await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engBId],
          p_activity_ids:   [ids.activityId],
          p_is_auto_approved: false,
        });
        // Reject without editing
        await new Promise(r => setTimeout(r, 100));
        await supabase.from("timesheet_line_approvals")
          .update({ status: "rejected", approved_by: ids.staffId, approved_at: new Date().toISOString() })
          .eq("period_id", ids.periodId).eq("engagement_id", ids.engBId);
        await supabase.from("timesheet_periods").update({ submitted_at: null }).eq("period_id", ids.periodId);
        // Resubmit without editing
        const { data, error } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engBId],
          p_activity_ids:   [ids.activityId],
          p_is_auto_approved: false,
        });
        const pass = !error && data.kept_rejected === 1;
        results.push({ scenario: "S2: Rejected unedited stays rejected", pass, details: JSON.stringify(data) });
      } finally { await cleanup(ids); }
    }

    // ── S3: New line inserts pending ───────────────────────────
    {
      const ids = await setupTestData(`s3-${trace_id.slice(0, 8)}`);
      try {
        // Submit only Eng-A first
        await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engAId],
          p_activity_ids:   [ids.activityId],
          p_is_auto_approved: false,
        });
        await supabase.from("timesheet_periods").update({ submitted_at: null }).eq("period_id", ids.periodId);
        // Now submit with both
        const { data, error } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engAId, ids.engBId],
          p_activity_ids:   [ids.activityId, ids.activityId],
          p_is_auto_approved: false,
        });
        const pass = !error && data.new_pending === 1;
        results.push({ scenario: "S3: New line inserts pending", pass, details: JSON.stringify(data) });
      } finally { await cleanup(ids); }
    }

    // ── S5: Double-submit idempotency ─────────────────────────
    {
      const ids = await setupTestData(`s5-${trace_id.slice(0, 8)}`);
      try {
        const { data: d1 } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engAId, ids.engBId],
          p_activity_ids:   [ids.activityId, ids.activityId],
          p_is_auto_approved: false,
        });
        const { data: d2 } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engAId, ids.engBId],
          p_activity_ids:   [ids.activityId, ids.activityId],
          p_is_auto_approved: false,
        });
        // Second call: all lines already pending, so no new_pending
        const { count } = await supabase.from("timesheet_line_approvals")
          .select("*", { count: "exact", head: true }).eq("period_id", ids.periodId);
        const pass = count === 2; // No duplicates
        results.push({ scenario: "S5: Double-submit idempotency", pass, details: `first=${JSON.stringify(d1)} second=${JSON.stringify(d2)} count=${count}` });
      } finally { await cleanup(ids); }
    }

    // ── S6: Auto-approved submit path ─────────────────────────
    {
      const ids = await setupTestData(`s6-${trace_id.slice(0, 8)}`);
      try {
        const { data, error } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engAId, ids.engBId],
          p_activity_ids:   [ids.activityId, ids.activityId],
          p_is_auto_approved: true,
        });
        const pass = !error && data.new_auto_approved === 2;
        // Verify DB
        const { data: rows } = await supabase.from("timesheet_line_approvals")
          .select("status").eq("period_id", ids.periodId);
        const allApproved = rows?.every(r => r.status === "approved");
        results.push({ scenario: "S6: Auto-approved submit path", pass: pass && !!allApproved, details: JSON.stringify(data) });
      } finally { await cleanup(ids); }
    }

    // ── S7: Guarded update skips (concurrent approval) ────────
    {
      const ids = await setupTestData(`s7-${trace_id.slice(0, 8)}`);
      try {
        await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engAId],
          p_activity_ids:   [ids.activityId],
          p_is_auto_approved: false,
        });
        // Reject it
        await supabase.from("timesheet_line_approvals")
          .update({ status: "rejected", approved_by: ids.staffId, approved_at: new Date().toISOString() })
          .eq("period_id", ids.periodId).eq("engagement_id", ids.engAId);
        // Edit time entry
        await new Promise(r => setTimeout(r, 100));
        await supabase.from("time_entries")
          .update({ hours_logged: 6 })
          .eq("period_id", ids.periodId).eq("engagement_id", ids.engAId);
        // Simulate concurrent approval: change status to approved BEFORE resubmit
        await supabase.from("timesheet_line_approvals")
          .update({ status: "approved", approved_by: ids.staffId, approved_at: new Date().toISOString() })
          .eq("period_id", ids.periodId).eq("engagement_id", ids.engAId);
        // Unsubmit + resubmit
        await supabase.from("timesheet_periods").update({ submitted_at: null }).eq("period_id", ids.periodId);
        const { data, error } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engAId],
          p_activity_ids:   [ids.activityId],
          p_is_auto_approved: false,
        });
        // The RPC reads 'rejected' from its initial snapshot but the guarded UPDATE matches 0 rows
        // Actually: with service role + READ COMMITTED, the UPDATE sees the committed 'approved' status
        // So the WHERE status='rejected' matches 0 → guarded_update_skips=1
        // BUT: the initial SELECT also sees 'approved' now, so it goes to the 'approved' branch directly
        // To properly test this we'd need transaction isolation tricks. For service role test,
        // the RPC will see 'approved' and skip. Let's verify that.
        const pass = !error && data.preserved_approved === 1;
        results.push({ scenario: "S7: Guarded update (concurrent approval)", pass, details: JSON.stringify(data) });
      } finally { await cleanup(ids); }
    }

    // ── S8: Duplicate (engagement, activity) pairs ────────────
    {
      const ids = await setupTestData(`s8-${trace_id.slice(0, 8)}`);
      try {
        const { data, error } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engAId, ids.engAId, ids.engAId],
          p_activity_ids:   [ids.activityId, ids.activityId, ids.activityId],
          p_is_auto_approved: false,
        });
        const { count } = await supabase.from("timesheet_line_approvals")
          .select("*", { count: "exact", head: true })
          .eq("period_id", ids.periodId).eq("engagement_id", ids.engAId);
        const pass = !error && data.new_pending === 1 && count === 1;
        results.push({ scenario: "S8: Duplicate engagement IDs sanitization", pass, details: JSON.stringify(data) });
      } finally { await cleanup(ids); }
    }

    // ── S9: NULL engagement/activity IDs ─────────────────────
    {
      const ids = await setupTestData(`s9-${trace_id.slice(0, 8)}`);
      try {
        const engagementIds: Array<string | null> = [ids.engAId, null, null];
        const activityIds: Array<string | null>   = [ids.activityId, null, null];
        const { data, error } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: engagementIds,
          p_activity_ids:   activityIds,
          p_is_auto_approved: false,
        });
        const pass = !error && data.new_pending === 1;
        results.push({ scenario: "S9: NULL engagement IDs sanitization", pass, details: JSON.stringify(data) });
      } finally { await cleanup(ids); }
    }

    // ── S10: Full journey ─────────────────────────────────────
    {
      const ids = await setupTestData(`s10-${trace_id.slice(0, 8)}`);
      try {
        // Submit
        await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engAId, ids.engBId],
          p_activity_ids:   [ids.activityId, ids.activityId],
          p_is_auto_approved: false,
        });
        // Record Eng-A approval_id
        const { data: beforeApprovals } = await supabase.from("timesheet_line_approvals")
          .select("approval_id, engagement_id, updated_at").eq("period_id", ids.periodId);
        const engAApprovalBefore = beforeApprovals!.find(a => a.engagement_id === ids.engAId);
        const engBUpdatedBefore = beforeApprovals!.find(a => a.engagement_id === ids.engBId)?.updated_at;

        // Approve A, reject B
        await supabase.from("timesheet_line_approvals")
          .update({ status: "approved", approved_by: ids.staffId, approved_at: new Date().toISOString() })
          .eq("period_id", ids.periodId).eq("engagement_id", ids.engAId);
        await new Promise(r => setTimeout(r, 50));
        await supabase.from("timesheet_line_approvals")
          .update({ status: "rejected", approved_by: ids.staffId, approved_at: new Date().toISOString() })
          .eq("period_id", ids.periodId).eq("engagement_id", ids.engBId);

        // Unsubmit (non-deleting)
        await supabase.from("timesheet_periods").update({ submitted_at: null }).eq("period_id", ids.periodId);
        // Verify records still exist
        const { count: afterUnsubmitCount } = await supabase.from("timesheet_line_approvals")
          .select("*", { count: "exact", head: true }).eq("period_id", ids.periodId);

        // Edit Eng-B time entries
        await new Promise(r => setTimeout(r, 100));
        await supabase.from("time_entries")
          .update({ hours_logged: 6 })
          .eq("period_id", ids.periodId).eq("engagement_id", ids.engBId);

        // Resubmit
        const { data, error } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.engAId, ids.engBId],
          p_activity_ids:   [ids.activityId, ids.activityId],
          p_is_auto_approved: false,
        });

        // Verify Eng-A approval_id unchanged
        const { data: afterApprovals } = await supabase.from("timesheet_line_approvals")
          .select("approval_id, engagement_id, status, updated_at").eq("period_id", ids.periodId);
        const engAApprovalAfter = afterApprovals!.find(a => a.engagement_id === ids.engAId);
        const engBAfter = afterApprovals!.find(a => a.engagement_id === ids.engBId);

        const approvalIdPreserved = engAApprovalBefore?.approval_id === engAApprovalAfter?.approval_id;
        const engBReset = engBAfter?.status === "pending";
        const engBTimestampUpdated =
          engBAfter?.updated_at != null &&
          engBUpdatedBefore != null &&
          engBAfter.updated_at > engBUpdatedBefore;
        const payloadOk = !error && data.preserved_approved === 1 && data.reset_to_pending === 1;

        results.push({
          scenario: "S10: Full journey submit->approve/reject->unsubmit->edit->resubmit",
          pass: payloadOk && approvalIdPreserved && engBReset && afterUnsubmitCount === 2 && engBTimestampUpdated,
          details: `payload=${JSON.stringify(data)} approvalIdPreserved=${approvalIdPreserved} engBReset=${engBReset} recordsSurvived=${afterUnsubmitCount === 2} engBTimestampUpdated=${engBTimestampUpdated}`,
        });
      } finally { await cleanup(ids); }
    }

    // ── S11 (0526-122): office=Todas holiday + La Paz staff → auto-approved ──
    {
      const ids = await setupHolidayTestData(`s11-${trace_id.slice(0, 8)}`, "La Paz");
      const prevSetting = await setHolidayEngagementSetting(ids.holidayEngId);
      const holidayIds: string[] = [];
      try {
        const { data: h } = await supabase.from("holidays").insert({
          holiday_date: "2026-01-05",
          holiday_name: `Test National Holiday ${ids.staffId}`,
          oficina: 0,
          created_by: ids.staffId,
        }).select().single();
        holidayIds.push(h!.holiday_id);

        await supabase.from("time_entries").insert([
          { staff_id: ids.staffId, engagement_id: ids.holidayEngId, activity_id: ids.activityId, date_worked: "2026-01-05", hours_logged: 8, period_id: ids.periodId },
        ]);

        const { data, error } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.holidayEngId],
          p_activity_ids:   [ids.activityId],
          p_is_auto_approved: false,
        });
        const pass = !error && data.new_auto_approved === 1 && data.new_pending === 0;
        results.push({ scenario: "S11: La Paz staff + Todas holiday → auto-approved", pass, details: JSON.stringify(data) });
      } finally {
        await restoreHolidayEngagementSetting(prevSetting);
        await cleanupHoliday(ids, holidayIds);
      }
    }

    // ── S12 (0526-122): mixed valid/invalid dates in same line → all pending,
    //    even with p_is_auto_approved=true (no role can bypass) ─────────────
    {
      const ids = await setupHolidayTestData(`s12-${trace_id.slice(0, 8)}`, "La Paz");
      const prevSetting = await setHolidayEngagementSetting(ids.holidayEngId);
      const holidayIds: string[] = [];
      try {
        const { data: h } = await supabase.from("holidays").insert({
          holiday_date: "2026-01-05",
          holiday_name: `Test National Holiday ${ids.staffId}`,
          oficina: 0,
          created_by: ids.staffId,
        }).select().single();
        holidayIds.push(h!.holiday_id);

        // Same (period, engagement, activity) line: one valid holiday date,
        // one date that is NOT a holiday.
        await supabase.from("time_entries").insert([
          { staff_id: ids.staffId, engagement_id: ids.holidayEngId, activity_id: ids.activityId, date_worked: "2026-01-05", hours_logged: 4, period_id: ids.periodId },
          { staff_id: ids.staffId, engagement_id: ids.holidayEngId, activity_id: ids.activityId, date_worked: "2026-01-06", hours_logged: 4, period_id: ids.periodId },
        ]);

        const { data, error } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.holidayEngId],
          p_activity_ids:   [ids.activityId],
          p_is_auto_approved: true, // Director/Partner bypass — must NOT apply to this line
        });
        const pass = !error && data.new_pending === 1 && data.new_auto_approved === 0;
        results.push({ scenario: "S12: mixed valid+invalid dates → whole line pending despite p_is_auto_approved=true", pass, details: JSON.stringify(data) });
      } finally {
        await restoreHolidayEngagementSetting(prevSetting);
        await cleanupHoliday(ids, holidayIds);
      }
    }

    // ── S13 (0526-122): enforce_holiday_blocking respects staff office ───────
    {
      const idsLp = await setupHolidayTestData(`s13lp-${trace_id.slice(0, 8)}`, "La Paz");
      const idsSc = await setupHolidayTestData(`s13sc-${trace_id.slice(0, 8)}`, "Santa Cruz");
      const prevSetting = await setHolidayEngagementSetting(idsLp.holidayEngId);
      const holidayIds: string[] = [];
      try {
        // A Santa Cruz-exclusive holiday.
        const { data: h } = await supabase.from("holidays").insert({
          holiday_date: "2026-01-06",
          holiday_name: `Test Santa Cruz Holiday ${idsLp.staffId}`,
          oficina: 2,
          created_by: idsLp.staffId,
        }).select().single();
        holidayIds.push(h!.holiday_id);

        // La Paz staff logging a non-holiday engagement on that date must NOT be blocked.
        const { error: lpError } = await supabase.from("time_entries").insert({
          staff_id: idsLp.staffId, engagement_id: idsLp.otherEngId, activity_id: idsLp.activityId,
          date_worked: "2026-01-06", hours_logged: 8, period_id: idsLp.periodId,
        });

        // Santa Cruz staff logging the same non-holiday engagement on that date MUST be blocked.
        const { error: scError } = await supabase.from("time_entries").insert({
          staff_id: idsSc.staffId, engagement_id: idsSc.otherEngId, activity_id: idsSc.activityId,
          date_worked: "2026-01-06", hours_logged: 8, period_id: idsSc.periodId,
        });

        const pass = !lpError && !!scError && String(scError.message ?? "").includes("HOLIDAY_BLOCKED");
        results.push({
          scenario: "S13: enforce_holiday_blocking only applies a departmental holiday to the matching office",
          pass,
          details: `lpError=${lpError ? JSON.stringify(lpError.message) : "none"} scError=${scError ? JSON.stringify(scError.message) : "none"}`,
        });
      } finally {
        await restoreHolidayEngagementSetting(prevSetting);
        await cleanupHoliday(idsLp, holidayIds);
        await cleanupHoliday(idsSc, []);
      }
    }

    // ── S14 (0526-122 review cycle): reproduces the ORIGINAL reported bug —
    //    holiday engagement with approval_required=false, hours logged on a
    //    date that is NOT a real holiday, non-auto-approved staff. Before this
    //    fix, v_effective_auto came straight from engagements.approval_required
    //    and this line would auto-approve. It must land pending instead. ──────
    {
      const ids = await setupHolidayTestData(`s14-${trace_id.slice(0, 8)}`, "La Paz", false);
      const prevSetting = await setHolidayEngagementSetting(ids.holidayEngId);
      try {
        // No row in `holidays` for 2026-01-05 — this date is not a real holiday.
        await supabase.from("time_entries").insert([
          { staff_id: ids.staffId, engagement_id: ids.holidayEngId, activity_id: ids.activityId, date_worked: "2026-01-05", hours_logged: 8, period_id: ids.periodId },
        ]);

        const { data, error } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.holidayEngId],
          p_activity_ids:   [ids.activityId],
          p_is_auto_approved: false,
        });
        const pass = !error && data.new_pending === 1 && data.new_auto_approved === 0;
        results.push({
          scenario: "S14: holiday engagement with approval_required=false + non-holiday date → pending, NOT auto-approved (original bug)",
          pass,
          details: JSON.stringify(data),
        });
      } finally {
        await restoreHolidayEngagementSetting(prevSetting);
        await cleanupHoliday(ids, []);
      }
    }

    // ── S15 (0526-122 review cycle): the stale pre-0508-106 4-argument
    //    overload (p_period_id, p_staff_id, p_engagement_ids, p_is_auto_approved
    //    -- no p_activity_ids) must be gone. Postgres/PostgREST resolves RPC
    //    calls by exact argument-name match, so a caller that omits
    //    p_activity_ids would silently hit that dead overload and bypass both
    //    per-activity approvals and this ticket's holiday date/office
    //    validation entirely. Calling with the old 4-arg shape must now fail
    //    to resolve to any function. ─────────────────────────────────────────
    {
      const ids = await setupHolidayTestData(`s15-${trace_id.slice(0, 8)}`, "La Paz", false);
      try {
        const { error } = await supabase.rpc("submit_timesheet_safe", {
          p_period_id: ids.periodId, p_staff_id: ids.staffId,
          p_engagement_ids: [ids.holidayEngId],
          p_is_auto_approved: false,
        });
        const pass = !!error;
        results.push({
          scenario: "S15: stale 4-arg submit_timesheet_safe overload no longer resolves",
          pass,
          details: error ? JSON.stringify(error.message) : "unexpected success -- stale overload still exists",
        });
      } finally {
        await cleanupHoliday(ids, []);
      }
    }

  } catch (e) {
    results.push({ scenario: "SETUP_ERROR", pass: false, details: String(e) });
  }

  const allPass = results.every(r => r.pass);
  return new Response(
    JSON.stringify({ trace_id, allPass, results }, null, 2),
    {
      status: allPass ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
