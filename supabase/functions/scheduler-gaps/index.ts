// scheduler-gaps — Deno entry. Novena Edge Function de EMS.
//
// Byte-synced skeleton from scheduler-data/index.ts: CORS preflight,
// Authorization header check, server-side JWT verification via an anon
// client, then a SERVICE-ROLE client for queries (RLS bypassed — the
// role gate in handler.ts is a data-confidentiality boundary).
// The function always performs its own auth, so it behaves correctly
// under either gateway verify_jwt setting.
//
// DEPLOYMENT: committing this file configures nothing. Deploy via Lovable
// chat ("Deploy the scheduler-gaps edge function") and verify by direct
// invocation — until then the Gaps page renders its distinct
// "Unavailable" state, never a fake empty report.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleAction,
  resolveIdentity,
  type GapsContext,
} from "./handler.ts";

const staticAllowedOrigins = [
  Deno.env.get("FRONTEND_URL") || "",
  "https://ugqxfnrxvksiltwxzist.lovableproject.com",
  "https://ems-test.up.railway.app",
  "https://ruizmier.dev",
  "https://www.ruizmier.dev",
  "http://localhost:5173",
  "http://localhost:8080",
].filter(Boolean);

function isAllowedOrigin(origin: string): boolean {
  if (staticAllowedOrigins.includes(origin)) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname;
  // Parsed-hostname suffix check — never substring includes().
  if (host === "lovable.app" || host.endsWith(".lovable.app")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  return false;
}

/**
 * Fase 3 (plan v2 §G-F): un Origin PRESENTE pero no permitido no recibe
 * ningún Access-Control-Allow-Origin (en vez de recibir el primer origen
 * de la allowlist como antes) — el navegador bloquea la lectura de la
 * respuesta para ese origen. Un Origin ausente (llamada no-browser) usa el
 * primero de la allowlist, que no tiene efecto de seguridad en ese caso.
 */
function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (origin === null) {
    headers["Access-Control-Allow-Origin"] = staticAllowedOrigins[0];
  } else if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  // origin present but not allowed: no ACAO header — browser blocks it.
  return headers;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({
          error: { code: "unauthorized", message: "Missing Authorization header" },
        }),
        { status: 401, headers: jsonHeaders }
      );
    }

    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    // getUser(token) validates the JWT SERVER-SIDE against /auth/v1/user —
    // a forged signature is rejected regardless of the gateway verify_jwt
    // setting, the project's JWT signing algorithm, or the supabase-js
    // version in use. This function is a security boundary (service-role
    // queries below), so token verification must not depend on any of those.
    const { data: userData, error: userError } =
      await supabaseAnon.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Invalid token" } }),
        { status: 401, headers: jsonHeaders }
      );
    }
    const userId = userData.user.id;

    // Service client — RLS bypassed; the handler role gate is the boundary.
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Identity resolution failures are 500s, never a silent fall-through
    // to the denied default.
    const { identity, error: identityError } = await resolveIdentity(
      supabase as unknown as GapsContext["db"],
      userId
    );
    if (identityError || !identity) {
      console.error("scheduler-gaps identity resolution failed:", identityError);
      return new Response(
        JSON.stringify({
          error: { code: "identity_unresolved", message: "Could not resolve caller identity" },
        }),
        { status: 500, headers: jsonHeaders }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          error: { code: "bad_request", message: "Invalid JSON in request body" },
        }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const ctx: GapsContext = {
      db: supabase as unknown as GapsContext["db"],
      staffId: identity.staffId,
      role: identity.role,
      todayUtc: new Date().toISOString().slice(0, 10),
    };

    const result = await handleAction(ctx, body);

    // Telemetry: IDs/counts/durations only — no PII.
    const rowCount = Array.isArray((result.payload as { rows?: unknown[] })?.rows)
      ? (result.payload as { rows: unknown[] }).rows.length
      : 0;
    console.info(
      JSON.stringify({
        fn: "scheduler-gaps",
        action: (body as Record<string, unknown>)?.action ?? null,
        role: ctx.role,
        status: result.status,
        rows: rowCount,
        ms: Date.now() - startedAt,
      })
    );

    return new Response(JSON.stringify(result.payload), {
      status: result.status,
      headers: jsonHeaders,
    });
  } catch (e) {
    console.error("scheduler-gaps unhandled error:", e);
    return new Response(
      JSON.stringify({
        error: { code: "internal", message: "Internal server error" },
      }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
