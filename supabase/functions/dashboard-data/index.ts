import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed origins for CORS
const allowedOrigins = [
  Deno.env.get("FRONTEND_URL") || "",
  "https://ugqxfnrxvksiltwxzist.lovableproject.com",
  "http://localhost:5173",
  "http://localhost:8080",
].filter(Boolean);

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

type SupabaseClient = ReturnType<typeof createClient>;

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Validate JWT and get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create anon client for JWT verification
    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAnon.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error("JWT validation failed:", claimsError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log(`Authenticated user ID: ${userId}`);

    // Create service client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get verified staff by auth_user_id (cryptographically verified from JWT sub claim)
    // This is more secure than using email since auth_user_id is the primary identity link
    const { data: staffData } = await supabase
      .from("staff")
      .select("staff_id")
      .eq("auth_user_id", userId)
      .single();

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    const verifiedStaffId = staffData?.staff_id;
    const verifiedRole = roleData?.role || "staff";

    console.log(`Verified staff: ${verifiedStaffId}, role: ${verifiedRole}`);

    // Parse request body with error handling
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { action, startDate, endDate } = body;

    // Validate action parameter against whitelist
    const validActions = [
      "time-value", "engagement-kpis", "staff-utilization",
      "portfolio-risk", "partner-leaderboard", "my-week",
      "timesheet-status", "practice-pulse"
    ];

    if (!action || !validActions.includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing action parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate dates for actions that require them
    const actionsRequiringDates = [
      "time-value", "engagement-kpis", "staff-utilization",
      "portfolio-risk", "partner-leaderboard", "practice-pulse"
    ];

    if (actionsRequiringDates.includes(action)) {
      if (!startDate || !endDate) {
        return new Response(
          JSON.stringify({ error: "Missing required startDate or endDate parameter" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return new Response(
          JSON.stringify({ error: "Invalid date format. Use YYYY-MM-DD" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate dates are real
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return new Response(
          JSON.stringify({ error: "Invalid date values" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate start <= end
      if (start > end) {
        return new Response(
          JSON.stringify({ error: "startDate must be before or equal to endDate" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Limit range to 2 years for performance
      const maxDays = 730;
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > maxDays) {
        return new Response(
          JSON.stringify({ error: `Date range exceeds maximum of ${maxDays} days` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Use verified staffId and role from database, not from request body
    const staffId = verifiedStaffId;
    const role = verifiedRole;

    console.log(`Dashboard data request: action=${action}, startDate=${startDate}, endDate=${endDate}, staffId=${staffId}, role=${role}`);

    let result: unknown;

    switch (action) {
      case "time-value":
        result = await getTimeValue(supabase, startDate, endDate, staffId, role);
        break;
      case "engagement-kpis":
        result = await getEngagementKpis(supabase, startDate, endDate, staffId, role);
        break;
      case "staff-utilization":
        result = await getStaffUtilization(supabase, startDate, endDate, staffId, role);
        break;
      case "portfolio-risk":
        result = await getPortfolioRisk(supabase, startDate, endDate, staffId, role);
        break;
      case "partner-leaderboard":
        result = await getPartnerLeaderboard(supabase, startDate, endDate);
        break;
      case "my-week":
        result = await getMyWeek(supabase, staffId);
        break;
      case "timesheet-status":
        result = await getTimesheetStatus(supabase, staffId);
        break;
      case "practice-pulse":
        result = await getPracticePulse(supabase, startDate, endDate);
        break;
      default:
        // This shouldn't happen due to whitelist check above, but keep as safety
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Dashboard data error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper: Get locked rate from wo_budget_lines (handles quarterly rate changes)
async function getLockedRate(
  supabase: SupabaseClient,
  woId: string,
  staffId: string
): Promise<number> {
  // Get staff's category
  const { data: staff } = await supabase
    .from("staff")
    .select("category_id")
    .eq("staff_id", staffId)
    .single();

  if (!staff?.category_id) return 0;

  // Get locked rate from budget lines
  const { data: budgetLine } = await supabase
    .from("wo_budget_lines")
    .select("standard_rate")
    .eq("wo_id", woId)
    .eq("category_id", staff.category_id)
    .single();

  return budgetLine?.standard_rate ?? 0;
}

// Helper: Get current week boundaries (Monday to Sunday)
function getCurrentWeekBounds(): { weekStart: string; weekEnd: string } {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  
  return {
    weekStart: weekStart.toISOString().split("T")[0],
    weekEnd: weekEnd.toISOString().split("T")[0],
  };
}

// Helper: Get week start (Monday) for a date
function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(date.setDate(diff));
  return weekStart.toISOString().split("T")[0];
}

// Define types for internal use
interface TimeEntry {
  time_id: string;
  date_worked: string;
  hours_logged: number;
  staff_id: string;
  engagement_id: string;
  engagements?: {
    engagement_id: string;
    partner_id: string;
    manager_id: string;
    work_orders?: { wo_id: string; currency: string } | { wo_id: string; currency: string }[];
  };
}

interface Engagement {
  engagement_id: string;
  engagement_name: string;
  engagement_code: string;
  client_id: string;
  partner_id: string;
  manager_id: string;
  status: string;
  clients?: { client_legal_name: string };
  work_orders?: { wo_id: string; currency: string; adjustment_amount: number } | { wo_id: string; currency: string; adjustment_amount: number }[];
  work_order_summary?: { wo_id: string; total_standard_fee: number; realization_percent: number } | { wo_id: string; total_standard_fee: number; realization_percent: number }[];
}

interface BudgetLine {
  wo_id: string;
  budgeted_hours: number;
}

interface TimeEntryBasic {
  engagement_id: string;
  hours_logged: number;
  staff_id: string;
}

interface StaffMember {
  staff_id: string;
  first_name: string;
  last_name: string;
  short_name?: string;
  category_id?: string;
  categories?: { category_name: string; display_order: number };
}

// StaffCapacity interface removed — weekly_capacity_hours now lives on staff table

interface TimesheetPeriod {
  period_id: string;
  week_start_date: string;
  submitted_at?: string;
  is_period_locked: boolean;
  deadline?: string;
}

interface LineApproval {
  period_id: string;
  status: string;
}

interface WeekRow {
  week_start: string;
  week_end: string;
  status: string;
  is_submitted?: boolean;
  is_current_week?: boolean;
  is_overdue: boolean;
  [key: string]: unknown;
}

// ACTION: time-value - Calculate standard value of time entries using WO locked rates
async function getTimeValue(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
  staffId?: string,
  role?: string
) {
  // Get time entries with engagement and work order info
  let query = supabase
    .from("time_entries")
    .select(`
      time_id,
      date_worked,
      hours_logged,
      staff_id,
      engagement_id,
      engagements!inner(
        engagement_id,
        partner_id,
        manager_id,
        work_orders(wo_id, currency)
      )
    `)
    .eq("is_forecast", false)
    .gte("date_worked", startDate)
    .lte("date_worked", endDate);

  // Role-based filtering
  if (role === "manager" && staffId) {
    query = query.or(`engagements.manager_id.eq.${staffId},engagements.partner_id.eq.${staffId}`);
  }

  const { data: entries, error } = await query;
  if (error) throw error;

  const typedEntries = (entries || []) as TimeEntry[];

  // Calculate standard value for each entry using locked rates
  const valuedEntries = await Promise.all(
    typedEntries.map(async (entry) => {
      const workOrders = entry.engagements?.work_orders;
      const woId = Array.isArray(workOrders) ? workOrders[0]?.wo_id : workOrders?.wo_id;
      const currency = Array.isArray(workOrders) ? workOrders[0]?.currency : workOrders?.currency;
      
      const standardRate = woId ? await getLockedRate(supabase, woId, entry.staff_id) : 0;
      const standardValue = entry.hours_logged * standardRate;

      return {
        time_id: entry.time_id,
        date_worked: entry.date_worked,
        hours_logged: entry.hours_logged,
        staff_id: entry.staff_id,
        engagement_id: entry.engagement_id,
        wo_id: woId,
        currency,
        standard_rate: standardRate,
        standard_value: standardValue,
      };
    })
  );

  // Aggregate totals
  const totalHours = valuedEntries.reduce((sum, e) => sum + e.hours_logged, 0);
  const totalValue = valuedEntries.reduce((sum, e) => sum + e.standard_value, 0);

  return {
    entries: valuedEntries,
    summary: {
      totalHours,
      totalValue,
      entryCount: valuedEntries.length,
    },
  };
}

// ACTION: engagement-kpis - Aggregate engagement metrics
async function getEngagementKpis(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
  staffId?: string,
  role?: string
) {
  // Get engagements with work order summary
  let query = supabase
    .from("engagements")
    .select(`
      engagement_id,
      engagement_name,
      engagement_code,
      client_id,
      partner_id,
      manager_id,
      status,
      clients(client_legal_name),
      work_orders(
        wo_id,
        currency,
        adjustment_amount
      ),
      work_order_summary(
        wo_id,
        total_standard_fee,
        realization_percent
      )
    `)
    .eq("status", "active");

  // Role-based filtering
  if (role === "manager" && staffId) {
    query = query.or(`manager_id.eq.${staffId},partner_id.eq.${staffId}`);
  }

  const { data: engagements, error } = await query;
  if (error) throw error;

  const typedEngagements = (engagements || []) as Engagement[];

  // Get budget hours per engagement
  const { data: budgetData } = await supabase
    .from("wo_budget_lines")
    .select("wo_id, budgeted_hours");

  const typedBudgetData = (budgetData || []) as BudgetLine[];
  const budgetByWo = typedBudgetData.reduce((acc, b) => {
    acc[b.wo_id] = (acc[b.wo_id] || 0) + Number(b.budgeted_hours);
    return acc;
  }, {} as Record<string, number>);

  // Get actual hours and value per engagement (period filtered)
  const { data: timeEntries } = await supabase
    .from("time_entries")
    .select("engagement_id, hours_logged, staff_id")
    .eq("is_forecast", false)
    .gte("date_worked", startDate)
    .lte("date_worked", endDate);

  const typedTimeEntries = (timeEntries || []) as TimeEntryBasic[];

  // Group time entries by engagement
  const hoursByEngagement: Record<string, { hours: number; entries: { staff_id: string; hours: number }[] }> = {};
  for (const te of typedTimeEntries) {
    if (!hoursByEngagement[te.engagement_id]) {
      hoursByEngagement[te.engagement_id] = { hours: 0, entries: [] };
    }
    hoursByEngagement[te.engagement_id].hours += Number(te.hours_logged);
    hoursByEngagement[te.engagement_id].entries.push({ staff_id: te.staff_id, hours: Number(te.hours_logged) });
  }

  // Calculate KPIs for each engagement
  const kpis = await Promise.all(
    typedEngagements.map(async (eng) => {
      const workOrder = Array.isArray(eng.work_orders) ? eng.work_orders[0] : eng.work_orders;
      const summary = Array.isArray(eng.work_order_summary) ? eng.work_order_summary[0] : eng.work_order_summary;
      
      if (!workOrder || !summary) return null;

      const woId = workOrder.wo_id;
      const budgetHours = budgetByWo[woId] || 0;
      const actualData = hoursByEngagement[eng.engagement_id] || { hours: 0, entries: [] };
      const actualHours = actualData.hours;

      // Calculate actual standard value using locked rates
      let actualStandardValue = 0;
      for (const entry of actualData.entries) {
        const rate = await getLockedRate(supabase, woId, entry.staff_id);
        actualStandardValue += entry.hours * rate;
      }

      const agreedFee = Number(summary.total_standard_fee || 0) + Number(workOrder.adjustment_amount || 0);
      const marginEstimate = agreedFee - actualStandardValue;
      const marginPct = agreedFee > 0 ? (marginEstimate / agreedFee) * 100 : null;
      const budgetConsumedPct = budgetHours > 0 ? (actualHours / budgetHours) * 100 : 0;
      const varianceHours = budgetHours - actualHours;

      return {
        engagement_id: eng.engagement_id,
        engagement_name: eng.engagement_name,
        engagement_code: eng.engagement_code,
        client_name: eng.clients?.client_legal_name,
        partner_id: eng.partner_id,
        manager_id: eng.manager_id,
        currency: workOrder.currency,
        budget_hours: budgetHours,
        actual_hours: actualHours,
        variance_hours: varianceHours,
        agreed_fee: agreedFee,
        actual_standard_value: actualStandardValue,
        margin_estimate: marginEstimate,
        margin_pct: marginPct,
        realization_pct: summary.realization_percent,
        budget_consumed_pct: budgetConsumedPct,
      };
    })
  );

  const validKpis = kpis.filter((k): k is NonNullable<typeof k> => k !== null);

  // Calculate portfolio summary
  const portfolioSummary = {
    activeCount: validKpis.length,
    totalAgreedFees: validKpis.reduce((sum, k) => sum + (k.agreed_fee || 0), 0),
    totalActualHours: validKpis.reduce((sum, k) => sum + (k.actual_hours || 0), 0),
    totalBudgetHours: validKpis.reduce((sum, k) => sum + (k.budget_hours || 0), 0),
    totalMargin: validKpis.reduce((sum, k) => sum + (k.margin_estimate || 0), 0),
    avgRealization: validKpis.length > 0 
      ? validKpis.reduce((sum, k) => sum + (k.realization_pct || 0), 0) / validKpis.length 
      : 0,
  };

  return { engagements: validKpis, summary: portfolioSummary };
}

// ACTION: staff-utilization - Weekly utilization % per staff
async function getStaffUtilization(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
  staffId?: string,
  role?: string
) {
  // Get time entries grouped by staff and week
  const { data: entries } = await supabase
    .from("time_entries")
    .select("staff_id, date_worked, hours_logged")
    .eq("is_forecast", false)
    .gte("date_worked", startDate)
    .lte("date_worked", endDate);

  const typedEntries = (entries || []) as { staff_id: string; date_worked: string; hours_logged: number }[];

  // Get staff info (includes weekly_capacity_hours)
  let staffQuery = supabase
    .from("staff")
    .select("staff_id, first_name, last_name, short_name, category_id, weekly_capacity_hours, categories(category_name, display_order)")
    .eq("is_active", true);

  if (staffId && role !== "partner") {
    staffQuery = staffQuery.eq("staff_id", staffId);
  }

  const { data: staffList } = await staffQuery;
  const typedStaffList = (staffList || []) as (StaffMember & { weekly_capacity_hours?: number })[];

  // Build capacity map directly from staff records
  const capacityByStaff: Record<string, number> = {};
  for (const s of typedStaffList) {
    capacityByStaff[s.staff_id] = Number(s.weekly_capacity_hours ?? 40);
  }

  // Group hours by staff and week
  const hoursByStaffWeek: Record<string, Record<string, number>> = {};
  for (const entry of typedEntries) {
    const weekStart = getWeekStart(entry.date_worked);
    if (!hoursByStaffWeek[entry.staff_id]) {
      hoursByStaffWeek[entry.staff_id] = {};
    }
    hoursByStaffWeek[entry.staff_id][weekStart] = 
      (hoursByStaffWeek[entry.staff_id][weekStart] || 0) + Number(entry.hours_logged);
  }

  // Calculate utilization per staff
  const utilization = typedStaffList.map((staff) => {
    const capacity = capacityByStaff[staff.staff_id] || 40;
    const weeklyHours = hoursByStaffWeek[staff.staff_id] || {};
    const weeks = Object.keys(weeklyHours);
    
    const totalHours = Object.values(weeklyHours).reduce((sum, h) => sum + h, 0);
    const totalCapacity = weeks.length * capacity;
    const utilizationPct = totalCapacity > 0 ? (totalHours / totalCapacity) * 100 : 0;

    return {
      staff_id: staff.staff_id,
      staff_name: staff.short_name || `${staff.first_name} ${staff.last_name}`,
      category_name: staff.categories?.category_name,
      display_order: staff.categories?.display_order,
      weekly_capacity: capacity,
      weeks_worked: weeks.length,
      total_hours: totalHours,
      utilization_pct: utilizationPct,
      weekly_breakdown: weeklyHours,
    };
  });

  // Group by category for summary
  const byCategory: Record<string, { hours: number; capacity: number; count: number }> = {};
  for (const u of utilization) {
    const cat = u.category_name || "Sin Categoría";
    if (!byCategory[cat]) {
      byCategory[cat] = { hours: 0, capacity: 0, count: 0 };
    }
    byCategory[cat].hours += u.total_hours;
    byCategory[cat].capacity += u.weeks_worked * u.weekly_capacity;
    byCategory[cat].count += 1;
  }

  const categorySummary = Object.entries(byCategory).map(([category, data]) => ({
    category,
    total_hours: data.hours,
    total_capacity: data.capacity,
    staff_count: data.count,
    utilization_pct: data.capacity > 0 ? (data.hours / data.capacity) * 100 : 0,
  }));

  return { staff: utilization, byCategory: categorySummary };
}

// ACTION: portfolio-risk - Engagements at risk
async function getPortfolioRisk(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
  staffId?: string,
  role?: string
) {
  // Get engagement KPIs first
  const kpisResult = await getEngagementKpis(supabase, startDate, endDate, staffId, role);
  
  // Filter for at-risk engagements
  const riskThreshold = 10; // Margin % threshold
  const budgetThreshold = 80; // Budget consumed % threshold

  const atRisk = kpisResult.engagements.filter((eng) => {
    const isOverBudget = eng.budget_consumed_pct > budgetThreshold;
    const isLowMargin = eng.margin_pct !== null && eng.margin_pct < riskThreshold;
    const isNegativeVariance = eng.variance_hours < 0;
    return isOverBudget || isLowMargin || isNegativeVariance;
  }).map((eng) => ({
    ...eng,
    risk_factors: {
      over_budget: eng.budget_consumed_pct > budgetThreshold,
      low_margin: eng.margin_pct !== null && eng.margin_pct < riskThreshold,
      negative_variance: eng.variance_hours < 0,
    },
  }));

  return {
    atRisk,
    riskCount: atRisk.length,
    totalEngagements: kpisResult.engagements.length,
    riskPercentage: kpisResult.engagements.length > 0 
      ? (atRisk.length / kpisResult.engagements.length) * 100 
      : 0,
  };
}

// ACTION: partner-leaderboard - Rank partners by margin/realization
async function getPartnerLeaderboard(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
) {
  // Get engagement KPIs for all
  const kpisResult = await getEngagementKpis(supabase, startDate, endDate);
  
  // Get partner staff info
  const { data: partners } = await supabase
    .from("staff")
    .select("staff_id, first_name, last_name, short_name, categories!inner(display_order)")
    .lte("categories.display_order", 2);

  const typedPartners = (partners || []) as (StaffMember & { categories: { display_order: number } })[];

  // Group engagements by partner
  const partnerMetrics: Record<string, {
    engagements: number;
    totalMargin: number;
    totalAgreedFee: number;
    totalHours: number;
    realizationSum: number;
  }> = {};

  for (const eng of kpisResult.engagements) {
    if (!eng.partner_id) continue;
    if (!partnerMetrics[eng.partner_id]) {
      partnerMetrics[eng.partner_id] = {
        engagements: 0,
        totalMargin: 0,
        totalAgreedFee: 0,
        totalHours: 0,
        realizationSum: 0,
      };
    }
    partnerMetrics[eng.partner_id].engagements += 1;
    partnerMetrics[eng.partner_id].totalMargin += eng.margin_estimate || 0;
    partnerMetrics[eng.partner_id].totalAgreedFee += eng.agreed_fee || 0;
    partnerMetrics[eng.partner_id].totalHours += eng.actual_hours || 0;
    partnerMetrics[eng.partner_id].realizationSum += eng.realization_pct || 0;
  }

  // Build leaderboard
  const leaderboard = typedPartners.map((partner) => {
    const metrics = partnerMetrics[partner.staff_id] || {
      engagements: 0,
      totalMargin: 0,
      totalAgreedFee: 0,
      totalHours: 0,
      realizationSum: 0,
    };

    return {
      staff_id: partner.staff_id,
      partner_name: partner.short_name || `${partner.first_name} ${partner.last_name}`,
      engagement_count: metrics.engagements,
      total_margin: metrics.totalMargin,
      total_agreed_fee: metrics.totalAgreedFee,
      total_hours: metrics.totalHours,
      avg_realization: metrics.engagements > 0 
        ? metrics.realizationSum / metrics.engagements 
        : 0,
      margin_pct: metrics.totalAgreedFee > 0 
        ? (metrics.totalMargin / metrics.totalAgreedFee) * 100 
        : 0,
    };
  });

  // Sort by margin (primary), then by realization (secondary)
  leaderboard.sort((a, b) => {
    if (b.total_margin !== a.total_margin) {
      return b.total_margin - a.total_margin;
    }
    return b.avg_realization - a.avg_realization;
  });

  // Add rank
  const rankedLeaderboard = leaderboard.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));

  return { leaderboard: rankedLeaderboard };
}

// ACTION: my-week - Current week hours/utilization for individual
async function getMyWeek(
  supabase: SupabaseClient,
  staffId: string
) {
  const { weekStart, weekEnd } = getCurrentWeekBounds();

  // Get this week's time entries
  const { data: entries } = await supabase
    .from("time_entries")
    .select("hours_logged, engagement_id")
    .eq("staff_id", staffId)
    .eq("is_forecast", false)
    .gte("date_worked", weekStart)
    .lte("date_worked", weekEnd);

  const typedEntries = (entries || []) as { hours_logged: number; engagement_id: string }[];

  // Get staff capacity from staff table
  const { data: staffRecord } = await supabase
    .from("staff")
    .select("weekly_capacity_hours")
    .eq("staff_id", staffId)
    .maybeSingle();

  const weeklyCapacity = staffRecord?.weekly_capacity_hours || 40;
  const hoursLogged = typedEntries.reduce((sum, e) => sum + Number(e.hours_logged), 0);
  const uniqueEngagements = new Set(typedEntries.map((e) => e.engagement_id)).size;

  // Get WEEKLY_MAX from global settings
  const { data: settings } = await supabase
    .from("global_settings")
    .select("setting_value")
    .eq("setting_key", "WEEKLY_MAX")
    .maybeSingle();

  const weeklyLimit = settings?.setting_value ? Number(settings.setting_value) : 40;

  return {
    week_start: weekStart,
    week_end: weekEnd,
    hours_logged: hoursLogged,
    weekly_capacity: weeklyCapacity,
    weekly_limit: weeklyLimit,
    utilization_pct: weeklyCapacity > 0 ? (hoursLogged / weeklyCapacity) * 100 : 0,
    engagements_touched: uniqueEngagements,
    remaining_capacity: Math.max(0, weeklyCapacity - hoursLogged),
  };
}

// ACTION: timesheet-status - Week status grid (single source of truth via DB RPC)
// NOTE: timesheet_periods.status is vestigial; status is derived from
// submitted_at + timesheet_line_approvals (Amendment A4).
async function getTimesheetStatus(
  supabase: SupabaseClient,
  staffId: string
) {
  const today = new Date();
  // Last 12 weeks
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 12 * 7);
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = today.toISOString().split("T")[0];

  const { data, error } = await supabase.rpc('get_week_statuses', {
    p_staff_id: staffId,
    p_start_date: startStr,
    p_end_date: endStr,
  });

  if (error) throw error;

  const weeks = ((data as WeekRow[]) || []).map((w) => {
    // Map RPC statuses to legacy format for backward compatibility
    const statusMap: Record<string, string> = {
      'APPROVED': 'approved',
      'PENDING_APPROVAL': 'pending',
      'NOT_LOGGED': 'missing',
      'NOT_SUBMITTED': 'missing',
      'DRAFT': 'draft',
      'REJECTED': 'rejected',
      'CURRENT': 'draft',
      'FUTURE': 'draft',
    };

    return {
      week_start: w.week_start,
      week_end: w.week_end,
      status: statusMap[w.status] || 'missing',
      is_overdue: w.status === 'NOT_LOGGED' || w.status === 'NOT_SUBMITTED',
      submitted_at: w.is_submitted ? 'submitted' : null,
      is_current_week: w.is_current_week,
    };
  });

  // Summary counts
  const summary = {
    approved: weeks.filter((w) => w.status === "approved").length,
    pending: weeks.filter((w) => w.status === "pending").length,
    draft: weeks.filter((w) => w.status === "draft").length,
    rejected: weeks.filter((w) => w.status === "rejected").length,
    missing: weeks.filter((w) => w.status === "missing").length,
    overdue: weeks.filter((w) => w.is_overdue).length,
  };

  return { weeks, summary };
}

// ACTION: practice-pulse - Firm-wide KPIs
async function getPracticePulse(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
) {
  // Get all engagement KPIs
  const kpisResult = await getEngagementKpis(supabase, startDate, endDate);
  
  // Get time value summary
  const timeValueResult = await getTimeValue(supabase, startDate, endDate);

  // Calculate weighted realization
  const totalFees = kpisResult.summary.totalAgreedFees;
  let weightedRealization = 0;
  for (const eng of kpisResult.engagements) {
    if (eng.agreed_fee > 0 && eng.realization_pct) {
      weightedRealization += (eng.agreed_fee / totalFees) * eng.realization_pct;
    }
  }

  // Get submission health (% of staff with all weeks submitted)
  const { data: allStaff } = await supabase
    .from("staff")
    .select("staff_id")
    .eq("is_active", true);

  const typedStaff = (allStaff || []) as { staff_id: string }[];
  const staffCount = typedStaff.length;
  let submittedCount = 0;

  for (const staff of typedStaff) {
    const { data: periods } = await supabase
      .from("timesheet_periods")
      .select("submitted_at")
      .eq("staff_id", staff.staff_id)
      .gte("week_start_date", startDate)
      .lte("week_start_date", endDate);

    const typedPeriods = (periods || []) as { submitted_at: string | null }[];
    const allSubmitted = typedPeriods.every((p) => p.submitted_at !== null);
    if (allSubmitted && typedPeriods.length > 0) {
      submittedCount++;
    }
  }

  const submissionHealth = staffCount > 0 ? (submittedCount / staffCount) * 100 : 0;

  return {
    total_hours: timeValueResult.summary.totalHours,
    total_standard_value: timeValueResult.summary.totalValue,
    weighted_realization: weightedRealization,
    total_margin: kpisResult.summary.totalMargin,
    margin_pct: totalFees > 0 ? (kpisResult.summary.totalMargin / totalFees) * 100 : 0,
    active_engagements: kpisResult.summary.activeCount,
    submission_health: submissionHealth,
    staff_count: staffCount,
  };
}
