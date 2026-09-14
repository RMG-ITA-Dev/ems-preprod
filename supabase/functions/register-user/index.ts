// register-user
//
// Alta de usuario emitida por nosotros, en vez de por GoTrue.
//
// Reemplaza a `supabase.auth.signUp()` en el cliente. `signUp()` crea la cuenta **y** manda la
// confirmación en un solo paso, así que mientras el alta la dispare el navegador el correo sale
// por el servicio integrado de Supabase — con su techo de 2 por hora. Acá se usa
// `generateLink({ type: "signup" })`, que crea la cuenta y devuelve el token **sin mandar nada**,
// y el mensaje sale por Microsoft Graph.
//
// GoTrue sigue creando la cuenta y validando la confirmación: lo que se movió es la entrega.
//
// Contrato (endpoint público, sin JWT):
//   Entrada: { email, password, firstName, lastName, redirectTo? }
//   Salida:  { ok: true, emailConfirmationRequired: true }  si la entrada es válida
//            { ok: false, code: "INVALID_EMAIL" | "INVALID_PASSWORD" | "INVALID_NAME"
//                               | "INVALID_DOMAIN" | "INVALID_REQUEST" | "INTERNAL_ERROR" }
//
// Un correo que YA tiene cuenta devuelve exactamente la misma respuesta que un alta exitosa, y
// no un error. Es deliberado: responder distinto convertiría el formulario de registro en un
// detector de usuarios — se prueban direcciones hasta ver cuál contesta distinto. Quien se
// equivocó de dirección igual se entera, pero por correo (ver `renderizarCorreoCuentaExistente`),
// que sólo puede leer el dueño de esa casilla.
//
// El dominio permitido se valida ACÁ además de en el formulario. La pantalla de registro ya
// filtra por `ALLOWED_EMAIL_DOMAIN`, pero es un endpoint público: saltearse el formulario y pegarle
// directo es trivial, y sin esta validación cualquiera se registraría con un correo de afuera.
//
// `verify_jwt = false` en config.toml: quien se registra todavía no tiene cuenta.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generarYEnviarCorreoAuth } from "../_shared/correo-auth.ts";
import { renderizarCorreoCuentaExistente } from "../_shared/plantillas/cuenta.ts";
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

/** Misma respuesta para el alta exitosa y para el correo que ya tiene cuenta. */
const respuestaCiega = () => jsonResponse({ ok: true, emailConfirmationRequired: true });

function correoValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor) && valor.length <= 255;
}

/**
 * GoTrue no expone un código estable para "ese correo ya está registrado", así que hay que mirar
 * el mensaje. Se chequea por fragmentos y en minúsculas porque el texto cambió entre versiones.
 */
function esCorreoYaRegistrado(mensaje: string): boolean {
  const texto = mensaje.toLowerCase();
  return (
    texto.includes("already registered") ||
    texto.includes("already been registered") ||
    texto.includes("email_exists") ||
    texto.includes("user already exists")
  );
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

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("[register-user] Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    return jsonResponse({ ok: false, code: "INTERNAL_ERROR" }, 500);
  }

  let body: {
    email?: unknown;
    password?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    redirectTo?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, code: "INVALID_REQUEST" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";

  if (!correoValido(email)) {
    return jsonResponse({ ok: false, code: "INVALID_EMAIL" }, 400);
  }
  // Mismo mínimo que `signupPasswordSchema` en src/pages/Auth.tsx.
  if (password.length < 8 || password.length > 100) {
    return jsonResponse({ ok: false, code: "INVALID_PASSWORD" }, 400);
  }
  if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) {
    return jsonResponse({ ok: false, code: "INVALID_NAME" }, 400);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Dominio permitido. No es información sensible —la pantalla de registro lo muestra— así que
  // rechazarlo explícitamente no filtra nada que no esté ya a la vista.
  const { data: ajuste } = await supabaseAdmin
    .from("global_settings")
    .select("setting_value")
    .eq("setting_key", "ALLOWED_EMAIL_DOMAIN")
    .maybeSingle();

  const dominio = (ajuste?.setting_value ?? "").trim().toLowerCase();
  if (dominio && !email.toLowerCase().endsWith(`@${dominio}`)) {
    return jsonResponse({ ok: false, code: "INVALID_DOMAIN" }, 400);
  }

  const origen = req.headers.get("origin");
  const redirectTo = typeof body.redirectTo === "string" && body.redirectTo
    ? body.redirectTo
    : `${origen ?? SUPABASE_URL}/`;

  // El mismo freno que la recuperación: un alta también manda un correo, y un endpoint público
  // que manda correos sin tope es un amplificador contra la casilla de cualquiera.
  const { data: hayCupo, error: errorCupo } = await supabaseAdmin.rpc("claim_auth_email_slot", {
    p_email: email,
  });

  if (errorCupo) {
    console.error("[register-user] claim_auth_email_slot falló:", errorCupo.message);
    // Falla cerrado: si no se puede contar, no se manda.
    return respuestaCiega();
  }

  if (!hayCupo) {
    console.log("[register-user] frenado por throttle.");
    return respuestaCiega();
  }

  try {
    const resultado = await generarYEnviarCorreoAuth({
      admin: supabaseAdmin,
      enviar: enviarCorreo,
      tipo: "signup",
      email,
      redirectTo,
      supabaseUrl: SUPABASE_URL,
      nombre: firstName,
      password,
      metadata: { first_name: firstName, last_name: lastName },
    });
    console.log(`[register-user] signup: ${resultado.estado}.`);
    return respuestaCiega();
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);

    if (esCorreoYaRegistrado(detalle)) {
      // Se le avisa por correo, no por la respuesta. El cupo ya se consumió, y eso es a
      // propósito: si probar una dirección registrada saliera gratis, el throttle no frenaría
      // el barrido.
      console.log("[register-user] el correo ya tiene cuenta; se avisa por correo.");
      const aviso = renderizarCorreoCuentaExistente({
        urlApp: `${origen ?? SUPABASE_URL}/auth`,
        nombre: firstName,
      });
      try {
        await enviarCorreo({
          destinatarios: [email],
          asunto: aviso.asunto,
          cuerpoTexto: aviso.cuerpoTexto,
          cuerpoHtml: aviso.cuerpoHtml,
        });
      } catch (errorAviso) {
        console.error(
          "[register-user] falló el aviso de cuenta existente:",
          errorAviso instanceof Error ? errorAviso.message : String(errorAviso),
        );
      }
      return respuestaCiega();
    }

    console.error("[register-user] falló el alta:", detalle);
    return jsonResponse({ ok: false, code: "INTERNAL_ERROR" }, 500);
  }
});
