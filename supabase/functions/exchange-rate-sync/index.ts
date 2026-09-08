// exchange-rate-sync — Deno entry. Décima Edge Function de EMS. Bug 0722-156 (Fase 1).
//
// Two request shapes, routed by `mode` in the JSON body:
//   - {} / {mode:"sync"}: NO caller auth required — reads EXCHANGE_RATE_API_URL from
//     global_settings and upserts the current rate. Callable today by the Settings
//     "Guardar" button (with the admin's JWT, though it isn't checked) and, once built,
//     by an external Railway cron with zero Supabase credentials — the function is public
//     by design (verify_jwt=false at the gateway, see supabase/config.toml) precisely so
//     that works without any change here (plan_v2.md Amendment 2026-09-04 parte 2).
//   - {mode:"test", url:"..."}: dry-run against the given URL (typed in Settings, possibly
//     unsaved) — admin-gated via authorizeTestMode() in handler.ts (has_permission(
//     'global_settings.update') via the caller's own JWT), because an anonymous caller
//     passing an arbitrary URL here would otherwise turn this public function into an
//     open SSRF proxy. authorizeTestMode has no Deno-only imports, so the gate itself is
//     unit-tested in exchangeRateSyncHandler.test.ts (review iteracion 1 MUST FIX #6) —
//     only this file's request routing/CORS glue stays untested, verified by direct
//     invocation after deploy instead.
//
// DEPLOYMENT: committing this file configures nothing by itself — it still needs an
// actual deploy of the function to whatever Supabase project is the current target.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleSync, handleTest, authorizeTestMode, type ExchangeRateDb } from "./handler.ts";

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
  if (host === "lovable.app" || host.endsWith(".lovable.app")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  return false;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (origin === null) {
    headers["Access-Control-Allow-Origin"] = staticAllowedOrigins[0];
  } else if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
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

    let body: unknown;
    try {
      body = req.method === "POST" ? await req.json() : {};
    } catch {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "Invalid JSON in request body" } }),
        { status: 400, headers: jsonHeaders },
      );
    }
    const mode = (body as { mode?: unknown })?.mode === "test" ? "test" : "sync";

    if (mode === "test") {
      const authHeader = req.headers.get("Authorization");
      const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader ?? "" } },
      });

      const authFailure = await authorizeTestMode(supabaseAnon, authHeader);
      if (authFailure) {
        return new Response(JSON.stringify(authFailure.payload), { status: authFailure.status, headers: jsonHeaders });
      }

      const result = await handleTest((body as { url?: unknown })?.url);
      console.info(JSON.stringify({
        fn: "exchange-rate-sync", mode, status: result.status, ms: Date.now() - startedAt,
      }));
      return new Response(JSON.stringify(result.payload), { status: result.status, headers: jsonHeaders });
    }

    // Sync mode: no caller auth required by design (see module header) — always re-fetches
    // the SAVED url server-side via the service-role client, never a client-supplied payload.
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
    const result = await handleSync(supabaseService as unknown as ExchangeRateDb);
    console.info(JSON.stringify({
      fn: "exchange-rate-sync", mode, status: result.status, ms: Date.now() - startedAt,
    }));
    return new Response(JSON.stringify(result.payload), { status: result.status, headers: jsonHeaders });
  } catch (e) {
    console.error("exchange-rate-sync unhandled error:", e);
    return new Response(
      JSON.stringify({ error: { code: "internal", message: "Internal server error" } }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
