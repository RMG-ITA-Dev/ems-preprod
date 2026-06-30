// secure-signin
//
// BUG 0514-115 (follow-up to Codex P1):
//   The account lockout RPCs (`check_login_allowed`, `record_failed_login`) used
//   to be callable directly by `anon`, which let any holder of the public anon
//   key DoS any account by POSTing `record_failed_login('victim@...')` five
//   times without ever attempting a real login. Codex flagged that vector.
//
//   This function is the only legitimate caller of those RPCs now. The migration
//   20260527000000_lockout_move_behind_edge_function.sql strips the anon grants
//   so direct curl-against-PostgREST is no longer possible. The counter only
//   moves when GoTrue itself confirms a credential failure inside this function.
//
// Contract (no JWT required — this IS the auth endpoint):
//   Input:  { email: string, password: string }
//   Output (success):
//     { ok: true, session: { access_token, refresh_token, expires_in, expires_at, token_type, user } }
//   Output (locked, either by pre-check or by tripping on this attempt):
//     { ok: false, code: "ACCOUNT_LOCKED", remaining_seconds: number }
//   Output (bad credentials, no lockout yet):
//     { ok: false, code: "INVALID_CREDENTIALS", message: string, remaining_attempts?: number }
//     (remaining_attempts is the count left before lockout, when record_failed_login
//      returns it; omitted if the RPC failed so the client falls back gracefully.)
//   Output (anything else):
//     { ok: false, code: "UNKNOWN_ERROR", message: string }

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
    return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED", message: "POST required" }, 405);
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, code: "INVALID_REQUEST", message: "Body must be JSON" }, 400);
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return jsonResponse(
      { ok: false, code: "INVALID_REQUEST", message: "email and password are required" },
      400,
    );
  }

  const emailNormalized = email.trim().toLowerCase();

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return jsonResponse(
      { ok: false, code: "INTERNAL_ERROR", message: "Server is not configured" },
      500,
    );
  }

  // Service-role client: bypasses RLS and the anon REVOKE we just shipped,
  // so it is the only path that can move the lockout counter.
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Anon-key client: used purely to call GoTrue's signInWithPassword. We never
  // forward its session cookies anywhere — we relay the tokens to the SPA so
  // the SPA can install them with supabase.auth.setSession().
  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY);

  // 1. Pre-check: if the account is locked, do not touch GoTrue at all.
  //    Fail-open on RPC error (a transient DB problem must not lock everyone
  //    out of logging in); surface the error in logs for monitoring.
  try {
    const { data: precheck, error: precheckErr } = await supabaseAdmin.rpc(
      "check_login_allowed",
      { p_email: emailNormalized },
    );
    if (precheckErr) {
      console.error("[secure-signin] check_login_allowed failed:", precheckErr);
    } else if (precheck && (precheck as { allowed?: boolean }).allowed === false) {
      const remaining = (precheck as { remaining_seconds?: number }).remaining_seconds ?? 0;
      return jsonResponse({ ok: false, code: "ACCOUNT_LOCKED", remaining_seconds: remaining });
    }
  } catch (err) {
    console.error("[secure-signin] check_login_allowed threw:", err);
  }

  // 2. Real login attempt. GoTrue applies its own per-IP rate limits here,
  //    which is what gates the DoS surface that Codex flagged.
  const { data: signInData, error: signInError } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  });

  // 3. Bad credentials: increment the counter ONLY here, after GoTrue confirmed
  //    the failure. This is the invariant Codex asked for.
  if (signInError) {
    if (signInError.message === "Invalid login credentials") {
      let attemptsRemaining: number | undefined;
      try {
        const { data: record, error: recordErr } = await supabaseAdmin.rpc(
          "record_failed_login",
          { p_email: emailNormalized },
        );
        if (recordErr) {
          console.error("[secure-signin] record_failed_login failed:", recordErr);
        } else if (record && (record as { locked?: boolean }).locked === true) {
          const remaining = (record as { remaining_seconds?: number }).remaining_seconds ?? 0;
          return jsonResponse({ ok: false, code: "ACCOUNT_LOCKED", remaining_seconds: remaining });
        } else if (record) {
          attemptsRemaining = (record as { attempts_remaining?: number }).attempts_remaining;
        }
      } catch (err) {
        console.error("[secure-signin] record_failed_login threw:", err);
      }

      return jsonResponse({
        ok: false,
        code: "INVALID_CREDENTIALS",
        message: "Invalid login credentials",
        remaining_attempts: attemptsRemaining,
      });
    }

    return jsonResponse({
      ok: false,
      code: "UNKNOWN_ERROR",
      message: signInError.message,
    });
  }

  if (!signInData.session) {
    return jsonResponse({
      ok: false,
      code: "UNKNOWN_ERROR",
      message: "Auth returned no session",
    });
  }

  const { access_token, refresh_token, expires_in, expires_at, token_type, user } =
    signInData.session;

  // 4. Successful login: clear the counter using the authenticated user's JWT
  // so reset_login_attempts can enforce its jwt-email guard. Service role is
  // deliberately not used here; otherwise 1-4 typos followed by a successful
  // login could fail to clear the counter.
  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    },
  });

  try {
    const { error: resetErr } = await supabaseUser.rpc("reset_login_attempts", {
      p_email: emailNormalized,
    });
    if (resetErr) {
      console.error("[secure-signin] reset_login_attempts failed:", resetErr);
    }
  } catch (err) {
    console.error("[secure-signin] reset_login_attempts threw:", err);
  }

  return jsonResponse({
    ok: true,
    session: { access_token, refresh_token, expires_in, expires_at, token_type, user },
  });
});
