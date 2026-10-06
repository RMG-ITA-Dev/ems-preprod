// auth-email-hook
//
// Send Email Hook de Supabase Auth: GoTrue deja de mandar los correos de cuenta con el servicio
// integrado de Supabase y llama acá; nosotros armamos la plantilla y la mandamos por Microsoft
// Graph (ver docs/plan-correos-notificaciones.md §3).
//
// Cubre los tres correos de cuenta que ya existen, sin tocar a quien los dispara:
//   - alta de usuario            → src/hooks/useAuth.tsx (signUp)
//   - olvidé mi contraseña       → src/hooks/useAuth.tsx (resetPasswordForEmail)
//   - desbloqueo manual de admin → supabase/functions/unlock-account (resetPasswordForEmail)
//
// El token lo sigue generando y validando GoTrue: acá sólo se arma el mensaje. Por eso este
// camino y no `auth.admin.generateLink()`, que además no cubre el "olvidé mi contraseña" de
// alguien sin sesión.
//
// Contrato (lo fija Supabase, no nosotros):
//   Entrada:  POST con { user, email_data }, firmado con Standard Webhooks.
//   Salida:   200 {} cuando el correo salió (o se simuló con MAIL_ENABLED=false).
//             { error: { http_code, message } } cuando no, que es lo que GoTrue propaga.
//
// `verify_jwt = false` en config.toml: GoTrue no manda JWT. La autenticación es la firma del
// webhook, y sin ella no se hace absolutamente nada.

import { verificarFirmaWebhook, FirmaWebhookError } from "../_shared/firma-webhook.ts";
import {
  renderizarCorreoAuth,
  TipoCorreoNoSoportado,
  type DatosCorreoAuth,
} from "../_shared/plantillas/cuenta.ts";
import { enviarCorreo, GraphIntegrationError } from "../_shared/mail-graph.ts";

type PayloadHook = {
  user?: {
    email?: string;
    user_metadata?: Record<string, unknown> | null;
  };
  email_data?: {
    token_hash?: string;
    email_action_type?: string;
    redirect_to?: string;
    site_url?: string;
  };
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Formato de error que GoTrue entiende y propaga a quien disparó el correo. */
const errorResponse = (status: number, message: string) =>
  jsonResponse({ error: { http_code: status, message } }, status);

function nombreDe(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  const nombre = typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
  return nombre || null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return errorResponse(405, "Método no permitido.");
  }

  const secretoHook = Deno.env.get("AUTH_EMAIL_HOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!secretoHook || !supabaseUrl) {
    // Sin secreto no se puede verificar nada, y sin verificar no se manda nada: cualquiera
    // podría disparar correos con el enlace que quiera.
    console.error("[auth-email-hook] Falta AUTH_EMAIL_HOOK_SECRET o SUPABASE_URL.");
    return errorResponse(500, "El servicio de correo no está configurado.");
  }

  // El cuerpo crudo, no el parseado: la firma se calcula sobre los bytes exactos que llegaron.
  const cuerpoCrudo = await req.text();

  try {
    await verificarFirmaWebhook({
      secreto: secretoHook,
      cuerpo: cuerpoCrudo,
      headers: req.headers,
    });
  } catch (error) {
    const detalle = error instanceof FirmaWebhookError ? error.message : String(error);
    console.error("[auth-email-hook] Firma rechazada:", detalle);
    return errorResponse(401, "Firma inválida.");
  }

  let payload: PayloadHook;
  try {
    payload = JSON.parse(cuerpoCrudo) as PayloadHook;
  } catch {
    return errorResponse(400, "El cuerpo no es JSON válido.");
  }

  const email = payload.user?.email?.trim();
  const emailData = payload.email_data;

  if (!email || !emailData?.token_hash || !emailData.email_action_type) {
    console.error("[auth-email-hook] Payload incompleto.");
    return errorResponse(400, "Payload incompleto.");
  }

  const datos: DatosCorreoAuth = {
    tipo: emailData.email_action_type,
    tokenHash: emailData.token_hash,
    redirectTo: emailData.redirect_to ?? "",
    siteUrl: emailData.site_url ?? "",
    supabaseUrl,
    email,
    nombre: nombreDe(payload.user?.user_metadata),
  };

  let correo;
  try {
    correo = renderizarCorreoAuth(datos);
  } catch (error) {
    if (error instanceof TipoCorreoNoSoportado) {
      // Un tipo de correo que no usamos (reauthentication, por ejemplo). Falla ruidoso a
      // propósito: mejor que GoTrue avise, y no que el usuario espere un correo que nadie mandó.
      console.error("[auth-email-hook]", error.message);
      return errorResponse(422, "Tipo de correo no soportado.");
    }
    throw error;
  }

  try {
    const resultado = await enviarCorreo({
      destinatarios: [email],
      asunto: correo.asunto,
      cuerpoTexto: correo.cuerpoTexto,
      cuerpoHtml: correo.cuerpoHtml,
      adjuntos: correo.adjuntos,
    });

    console.log(
      `[auth-email-hook] ${datos.tipo}: ${resultado.estado}` +
        `${resultado.redirigido ? " (redirigido a MAIL_TEST_RECIPIENT)" : ""}.`,
    );

    return jsonResponse({});
  } catch (error) {
    // `message` completo al log del servidor; al usuario sólo la pista accionable, si la hay.
    const detalle = error instanceof Error ? error.message : String(error);
    console.error("[auth-email-hook] Falló el envío por Graph:", detalle);

    const pista = error instanceof GraphIntegrationError ? error.pista : null;
    return errorResponse(500, pista ?? "No se pudo enviar el correo.");
  }
});
