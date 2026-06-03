// unlock-account
//
// BUG 0601-132: Admin manual unlock for blocked accounts.
//
// Called by the IT admin from Administración → Personal when they flip
// the is_blocked switch from ON to OFF on a staff member's detail page.
//
// Contract (requires valid admin JWT):
//   Input:  { staffId: string }
//   Output (success):
//     { ok: true }
//   Output (not admin):
//     { ok: false, code: "NOT_ADMIN" }
//   Output (staff not found):
//     { ok: false, code: "STAFF_NOT_FOUND" }
//   Output (anything else):
//     { ok: false, code: "INTERNAL_ERROR", message: string }
//
// Flow:
//   1. Verify caller JWT → resolve user → check admin role.
//   2. Call admin_unblock_account(p_staff_id) RPC — atomically clears
//      staff.is_blocked and deletes the auth_login_attempts row.
//   3. Call GoTrue resetPasswordForEmail so the user receives the same
//      reset-password email as "Forgot password", prompting them to set
//      a new password. The redirectTo includes reason=admin_unlock so the
//      /reset-password page can show a contextual banner.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return jsonResponse({ ok: false, code: "INTERNAL_ERROR", message: "Server not configured" }, 500);
  }

  // 1. Resolve and verify caller JWT.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ ok: false, code: "UNAUTHORIZED" }, 401);
  }
  const token = authHeader.replace("Bearer ", "");

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !caller) {
    return jsonResponse({ ok: false, code: "UNAUTHORIZED" }, 401);
  }

  // 2. Verify admin role.
  const { data: roleData } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .single();

  if (!roleData || roleData.role !== "admin") {
    return jsonResponse({ ok: false, code: "NOT_ADMIN" }, 403);
  }

  // 3. Parse body.
  let body: { staffId?: unknown; redirectTo?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, code: "INVALID_REQUEST", message: "Body must be JSON" }, 400);
  }

  const staffId = typeof body.staffId === "string" ? body.staffId : "";
  if (!staffId) {
    return jsonResponse({ ok: false, code: "INVALID_REQUEST", message: "staffId is required" }, 400);
  }

  // 4. Atomically unblock: clears staff.is_blocked + auth_login_attempts row.
  const { data: unblockResult, error: unblockError } = await supabaseAdmin.rpc(
    "admin_unblock_account",
    { p_staff_id: staffId },
  );

  if (unblockError) {
    console.error("[unlock-account] admin_unblock_account failed:", unblockError);
    return jsonResponse({ ok: false, code: "INTERNAL_ERROR", message: unblockError.message }, 500);
  }

  const result = unblockResult as { ok: boolean; email?: string; error?: string } | null;

  if (!result?.ok) {
    const code = result?.error ?? "INTERNAL_ERROR";
    return jsonResponse({ ok: false, code }, code === "STAFF_NOT_FOUND" ? 404 : 500);
  }

  const email = result.email!;

  // 5. Send the same reset-password email as "Forgot password".
  //    redirectTo comes from the frontend (window.location.origin) so it
  //    always matches the app URL the admin is using, avoiding Supabase
  //    Site URL override issues.
  const redirectTo = typeof body.redirectTo === "string" && body.redirectTo
    ? body.redirectTo
    : `${req.headers.get("origin") ?? SUPABASE_URL}/reset-password?reason=admin_unlock`;

  const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY);
  const { error: resetError } = await supabaseAnon.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (resetError) {
    // Non-fatal: the account is already unblocked; log and continue.
    console.error("[unlock-account] resetPasswordForEmail failed:", resetError);
  }

  return jsonResponse({ ok: true });
});
