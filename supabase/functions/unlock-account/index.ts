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
//     { ok: true, resetEmailSent: boolean }
//     resetEmailSent is false when the account was unblocked but the recovery
//     email could not be produced or delivered (generateLink rejected the
//     redirect, or Microsoft Graph refused the send), so the UI can warn the
//     admin instead of claiming the email went out.
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
//   3. Ask GoTrue for a recovery link with generateLink() — which sends no
//      email — and deliver it through Microsoft Graph. The user gets the same
//      reset-password email as "Forgot password", prompting them to set a new
//      password. The redirectTo includes reason=admin_unlock so the
//      /reset-password page can show a contextual banner, and the email copy
//      reflects that an admin did this rather than the user asking for it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { devolverCupoDeCorreo, generarYEnviarCorreoAuth } from "../_shared/correo-auth.ts";
import { enviarCorreo } from "../_shared/mail-graph.ts";

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
  // SUPABASE_ANON_KEY ya no hace falta: el correo de recuperacion lo emite el cliente de
  // servicio con generateLink(), no un cliente anonimo llamando a resetPasswordForEmail().

  if (!SUPABASE_URL || !SERVICE_ROLE) {
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

  //    The email goes out through Microsoft Graph, not GoTrue: generateLink()
  //    hands us the recovery token WITHOUT sending anything, so this no longer
  //    burns the project's per-hour email quota. An admin unblocking several
  //    accounts in a row used to hit that limit from the fourth one onwards.
  //    GoTrue still issues and validates the token — only the delivery moved.
  //
  //    El freno propio SI se aplica, y faltaba. La migracion del throttle dice tres veces que
  //    cubre "desbloqueo", y esta era la unica de las tres vias de correo de cuenta que no lo
  //    reclamaba: `AUTH_EMAIL_GLOBAL_MAX_PER_HOUR` decia ser el tope de toda la firma y en los
  //    hechos contaba dos flujos de tres. Y `admin_unblock_account` devuelve ok aunque la cuenta
  //    no estuviera bloqueada, asi que repetir la llamada —un doble clic alcanza— mandaba un
  //    correo cada vez, saltando el minimo entre correos al mismo destinatario.
  //
  //    El tope global de 120/hora no reintroduce el problema que esta rama vino a resolver: el de
  //    GoTrue eran 2 por proyecto, y un admin desbloqueando de a uno no se acerca a 120.
  const { data: hayCupo, error: errorCupo } = await supabaseAdmin.rpc("claim_auth_email_slot", {
    p_email: email,
  });

  if (errorCupo || !hayCupo) {
    // A diferencia de `request-password-reset`, que es publico y responde siempre igual para no
    // delatar que correos existen, ACA quien llama es un admin y necesita saber que el correo no
    // salio: la cuenta ya quedo desbloqueada, y sin el enlace la persona no puede entrar. Se le
    // devuelve el mismo `resetEmailSent: false` que ya usa el fallo de Graph.
    console.warn(
      errorCupo
        ? `[unlock-account] claim_auth_email_slot fallo: ${errorCupo.message}`
        : "[unlock-account] frenado por throttle.",
    );
    return jsonResponse({ ok: true, resetEmailSent: false });
  }

  try {
    const resultado = await generarYEnviarCorreoAuth({
      admin: supabaseAdmin,
      enviar: enviarCorreo,
      tipo: "recovery",
      email,
      redirectTo,
      supabaseUrl: SUPABASE_URL,
    });
    console.log(`[unlock-account] recovery: ${resultado.estado}.`);
  } catch (error) {
    // The account is already unblocked, so this is not fatal — but the user
    // received no recovery link. Report resetEmailSent: false so the admin is
    // warned and can re-send the reset manually instead of being told it went out.
    //
    // El cupo vuelve: ningun mensaje llego a esa casilla, asi que el admin puede reintentar en el
    // acto en vez de chocar con el minimo entre correos por un envio que nunca ocurrio.
    await devolverCupoDeCorreo(supabaseAdmin, email, "unlock-account");
    console.error(
      "[unlock-account] recovery email failed:",
      error instanceof Error ? error.message : String(error),
    );
    return jsonResponse({ ok: true, resetEmailSent: false });
  }

  return jsonResponse({ ok: true, resetEmailSent: true });
});
