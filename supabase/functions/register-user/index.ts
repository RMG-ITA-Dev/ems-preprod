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
// Si el correo no sale, el alta SE DESHACE. `generateLink` crea la cuenta antes de que haya nada
// que mandar, así que un fallo de Graph dejaba una cuenta sin confirmar y sin correo — y el
// reintento del usuario caía en la rama de "ya tenés cuenta", que le dice que ingrese o
// restablezca la contraseña, cosas que una cuenta sin confirmar no puede hacer. Quedaba trancado
// hasta que un admin la borrara. Ver `FalloDeEnvio` en `_shared/correo-auth.ts`.
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
import { FalloDeEnvio, generarYEnviarCorreoAuth } from "../_shared/correo-auth.ts";
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
  // De donde salen los enlaces de los correos que manda esta funcion. Es un secreto del
  // proyecto y NO el header `Origin` de la peticion: este endpoint es publico, con CORS `*` y
  // sin JWT, asi que `Origin` lo elige quien llama. Tomarlo de ahi convertiria el buzon
  // institucional en un emisor de correos de marca con el boton apuntando a donde quiera el
  // atacante. Mismo secreto que usan dashboard-data, scheduler-data y send-notification-emails.
  const FRONTEND_URL = Deno.env.get("FRONTEND_URL")?.replace(/\/+$/, "");

  if (!SUPABASE_URL || !SERVICE_ROLE || !FRONTEND_URL) {
    console.error("[register-user] Falta SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o FRONTEND_URL.");
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
  const { data: ajuste, error: errorAjuste } = await supabaseAdmin
    .from("global_settings")
    .select("setting_value")
    .eq("setting_key", "ALLOWED_EMAIL_DOMAIN")
    .maybeSingle();

  if (errorAjuste) {
    // Esta consulta define el límite de un endpoint público. Tratar un error de PostgREST como
    // "sin restricción" permitiría crear cuentas desde cualquier dominio.
    console.error("[register-user] no se pudo leer ALLOWED_EMAIL_DOMAIN:", errorAjuste.message);
    return jsonResponse({ ok: false, code: "INTERNAL_ERROR" }, 500);
  }

  const dominio = (ajuste?.setting_value ?? "").trim().toLowerCase();
  if (dominio && !email.toLowerCase().endsWith(`@${dominio}`)) {
    return jsonResponse({ ok: false, code: "INVALID_DOMAIN" }, 400);
  }

  // `body.redirectTo` sigue viniendo del cliente, pero no se cuela a ningun correo armado por
  // nosotros: viaja a `generateLink`, y GoTrue lo valida contra su allowlist de redirects
  // (Site URL + Additional Redirect URLs) antes de usarlo. El default sale de FRONTEND_URL.
  const redirectTo = typeof body.redirectTo === "string" && body.redirectTo
    ? body.redirectTo
    : `${FRONTEND_URL}/`;

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

    // El alta quedó a medias: `generateLink({ type: "signup" })` YA CREÓ la cuenta y el correo
    // no salió. Sin deshacerla, el usuario queda trancado y no puede destrancarse solo — su
    // reintento cae en la rama de "ya tenés cuenta" de más abajo, que manda un mensaje diciendo
    // que ingrese o restablezca la contraseña, y ninguna de las dos cosas funciona en una cuenta
    // sin confirmar. Hacía falta un admin para borrarla a mano.
    //
    // Borrarla es seguro justamente porque se creó en ESTA llamada, hace milisegundos: nunca se
    // confirmó, nadie inició sesión con ella, no tiene nada colgando. Y devuelve el alta a su
    // estado inicial, así que el reintento vuelve a ser un registro normal.
    if (error instanceof FalloDeEnvio) {
      if (error.usuarioId) {
        // DOS PASOS, y en este orden.
        //
        // Crear la cuenta dejó rastro fuera de `auth`: handle_new_user() escribió una fila en
        // `user_roles`, y el trigger de notificaciones emitió un `auth.user.registered` a cada
        // ADM con su correo encolado. Si se borra la cuenta sin limpiar eso, el CASCADE de
        // `user_roles.user_id` dispara un `auth.account.deleted` a Seguridad TI: una alarma de
        // baja de cuenta por un 503 de Graph, y los ADM avisados de un alta que ya no existe.
        //
        // `rollback_unconfirmed_signup` borra ese rastro dentro de UNA transacción, que es la
        // única forma de que el marcador que silencia al trigger sea visible: es
        // transaction-local, y esta llamada viaja por otra conexión que el deleteUser de abajo.
        const { data: limpieza, error: errorLimpieza } = await supabaseAdmin.rpc(
          "rollback_unconfirmed_signup",
          { p_user_id: error.usuarioId },
        );

        if (errorLimpieza) {
          // No se corta: una cuenta trancada es peor que una alarma de más, así que el borrado
          // sigue igual y lo que queda es ruido que alguien puede descartar.
          console.error(
            "[register-user] no se pudo limpiar el rastro del alta; el borrado va a generar un aviso de baja:",
            errorLimpieza.message,
          );
        } else if (limpieza && (limpieza as { ok?: boolean }).ok === false) {
          // La guarda de la RPC. `ACCOUNT_CONFIRMED` no debería pasar nunca acá — la cuenta se
          // creó en esta misma llamada y nadie pudo confirmarla — pero si pasa, hay una cuenta
          // en uso de por medio y no se toca.
          console.error(
            "[register-user] la limpieza se nego:",
            (limpieza as { reason?: string }).reason,
          );
          return jsonResponse({ ok: false, code: "INTERNAL_ERROR" }, 500);
        }

        const { error: errorBorrado } = await supabaseAdmin.auth.admin.deleteUser(
          error.usuarioId,
        );
        if (errorBorrado) {
          // Es el único camino que deja el problema original en pie, así que se registra con
          // el id: destrancar la cuenta pasa a necesitar un admin.
          console.error(
            `[register-user] no se pudo deshacer el alta a medias de ${error.usuarioId}; queda una cuenta sin confirmar:`,
            errorBorrado.message,
          );
        } else {
          console.log("[register-user] alta deshecha tras fallar el envio; el reintento sirve.");
        }
      } else {
        console.error("[register-user] fallo el envio y GoTrue no devolvio el id de la cuenta.");
      }

      // 500 y no `respuestaCiega()`: que el correo no salga no depende de si la dirección
      // existía, así que decirlo no filtra nada, y una pantalla de "revisá tu casilla" sobre un
      // correo que nunca se mandó es peor que un error.
      console.error("[register-user] fallo el envio del alta:", detalle);
      return jsonResponse({ ok: false, code: "INTERNAL_ERROR" }, 500);
    }

    if (esCorreoYaRegistrado(detalle)) {
      // Se le avisa por correo, no por la respuesta. El cupo ya se consumió, y eso es a
      // propósito: si probar una dirección registrada saliera gratis, el throttle no frenaría
      // el barrido.
      console.log("[register-user] el correo ya tiene cuenta; se avisa por correo.");
      const aviso = renderizarCorreoCuentaExistente({
        urlApp: `${FRONTEND_URL}/auth`,
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
