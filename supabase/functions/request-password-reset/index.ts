// request-password-reset
//
// "Olvidé mi contraseña", emitido por nosotros en vez de por GoTrue.
//
// Reemplaza a `supabase.auth.resetPasswordForEmail()` en el cliente. GoTrue sigue emitiendo y
// validando el token —con `generateLink()`, que no manda ningún correo— y el mensaje sale por
// Microsoft Graph. Para GoTrue no hubo correo, así que su límite de envíos por hora deja de
// aplicar; ese límite era el techo de 2 por hora que bloqueaba el flujo.
//
// Contrato (endpoint público, sin JWT):
//   Entrada: { email: string, redirectTo?: string }
//   Salida:  { ok: true }  SIEMPRE que la petición esté bien formada.
//
// La respuesta es deliberadamente ciega: idéntica exista o no la cuenta, y esté o no frenada por
// el throttle. Un endpoint que responde distinto según el caso es un detector de usuarios — se
// prueban correos hasta ver cuál contesta distinto. Lo que pasó de verdad va al log del servidor.
//
// El anti-abuso que antes ponía GoTrue lo pone ahora `claim_auth_email_slot()`: un mínimo de
// segundos entre dos correos al mismo destinatario y un tope por ventana de una hora. Sin eso, un
// endpoint público que manda correos es un amplificador contra la casilla de cualquiera.
//
// `verify_jwt = false` en config.toml: quien recupera la contraseña no tiene sesión. Mismo caso
// que `secure-signin`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  devolverCupoDeCorreo,
  generarYEnviarCorreoAuth,
  UsuarioInexistente,
} from "../_shared/correo-auth.ts";
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

/** Validación mínima: sólo descarta lo que ni siquiera es una dirección. */
function correoValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor) && valor.length <= 255;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // A donde vuelve el usuario despues de que GoTrue valide el token. Sale de un secreto del
  // proyecto y NO del header `Origin`: este endpoint es publico, con CORS `*` y sin JWT, asi
  // que `Origin` lo elige quien llama. Mismo criterio que register-user.
  const FRONTEND_URL = Deno.env.get("FRONTEND_URL")?.replace(/\/+$/, "");

  if (!SUPABASE_URL || !SERVICE_ROLE || !FRONTEND_URL) {
    console.error(
      "[request-password-reset] Falta SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o FRONTEND_URL.",
    );
    return jsonResponse({ ok: false, code: "INTERNAL_ERROR" }, 500);
  }

  let body: { email?: unknown; redirectTo?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, code: "INVALID_REQUEST" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!correoValido(email)) {
    // Un correo mal formado no es un intento de recuperación: no consume cupo ni se disimula.
    return jsonResponse({ ok: false, code: "INVALID_EMAIL" }, 400);
  }

  // `body.redirectTo` lo valida GoTrue contra su allowlist de redirects antes de usarlo; el
  // default sale de FRONTEND_URL.
  const redirectTo = typeof body.redirectTo === "string" && body.redirectTo
    ? body.redirectTo
    : `${FRONTEND_URL}/reset-password`;

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: hayCupo, error: errorCupo } = await supabaseAdmin.rpc("claim_auth_email_slot", {
    p_email: email,
  });

  if (errorCupo) {
    console.error("[request-password-reset] claim_auth_email_slot falló:", errorCupo.message);
    // Falla cerrado: si no se puede contar, no se manda. Un throttle que se cae abierto no es
    // un throttle.
    return jsonResponse({ ok: true });
  }

  if (!hayCupo) {
    console.log("[request-password-reset] frenado por throttle.");
    return jsonResponse({ ok: true });
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
    console.log(`[request-password-reset] recovery: ${resultado.estado}.`);
  } catch (error) {
    if (error instanceof UsuarioInexistente) {
      // Respuesta idéntica al caso exitoso. El cupo ya se consumió, y eso es a propósito:
      // si probar un correo inexistente saliera gratis, el throttle no frenaría el barrido.
      console.log("[request-password-reset] sin cuenta para ese correo.");
      return jsonResponse({ ok: true });
    }
    // El correo no salió, así que el cupo vuelve: el usuario puede reintentar en el acto en vez
    // de esperar al minuto por un envío que nunca ocurrió. No afloja el freno —ningún mensaje
    // llegó a esa casilla— y no se confunde con el caso de arriba, donde consumir el cupo por una
    // dirección inexistente es justamente lo que impide barrerlas gratis.
    await devolverCupoDeCorreo(supabaseAdmin, email, "request-password-reset");
    console.error(
      "[request-password-reset] falló el envío:",
      error instanceof Error ? error.message : String(error),
    );
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: true });
});
