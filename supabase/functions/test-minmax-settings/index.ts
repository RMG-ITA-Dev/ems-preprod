import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const tests = [
      // 1. Settings Feasibility: DAILY_MIN > DAILY_MAX
      async () => {
        const { data } = await supabase.rpc("update_timesheet_minmax_settings", {
          p_daily_min: 10,
          p_daily_max: 5,
          p_weekly_min: 20,
          p_weekly_max: 40
        });
        return data?.success === false && data?.error_code === "DAILY_MIN_EXCEEDS_MAX";
      },
      // 2. Settings Feasibility: WEEKLY_MIN > WEEKLY_MAX
      async () => {
        const { data } = await supabase.rpc("update_timesheet_minmax_settings", {
          p_daily_min: 5,
          p_daily_max: 10,
          p_weekly_min: 50,
          p_weekly_max: 40
        });
        return data?.success === false && data?.error_code === "WEEKLY_MIN_EXCEEDS_MAX";
      },
      // 3. Settings Feasibility: WEEKLY_MIN > DAILY_MAX * 5
      async () => {
        const { data } = await supabase.rpc("update_timesheet_minmax_settings", {
          p_daily_min: 5,
          p_daily_max: 8,
          p_weekly_min: 45, // 8*5 = 40
          p_weekly_max: 50
        });
        return data?.success === false && data?.error_code === "WEEKLY_MIN_EXCEEDS_DAILY_MAX";
      },
      // 4. Valid Update
      async () => {
        const { data } = await supabase.rpc("update_timesheet_minmax_settings", {
          p_daily_min: 8,
          p_daily_max: 8,
          p_weekly_min: 40,
          p_weekly_max: 40
        });
        return data?.success === true;
      }
    ];

    const results = await Promise.all(tests.map((test, i) => test().then(pass => ({ id: i + 1, pass }))));
    const passed = results.every(r => r.pass);

    return new Response(JSON.stringify({ passed, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: passed ? 200 : 400
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});
