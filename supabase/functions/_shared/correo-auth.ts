// supabase/functions/_shared/correo-auth.ts

/**
 * Correos de cuenta emitidos por NOSOTROS, sin pasar por el envío de GoTrue.
 *
 * `auth.admin.generateLink()` devuelve el token de recuperación/confirmación **sin mandar ningún
 * correo**. Eso es todo lo que necesitamos de GoTrue: sigue siendo quien emite y valida el token
 * —no se puede reemplazar sin cambiar el sistema de identidad entero— pero deja de ser quien
 * manda el mensaje, y por lo tanto deja de contarlo contra su límite de correos por hora.
 *
 * Usa las mismas plantillas que el Send Email Hook (`plantillas/cuenta.ts`), así los dos caminos
 * producen exactamente el mismo correo mientras convivan.
 */

import { renderizarCorreoAuth } from "./plantillas/cuenta.ts";

/**
 * El envío, inyectado. Es la costura entre armar el correo y mandarlo: deja este módulo sin
 * imports por URL —y por lo tanto testeable con vitest— y hace explícito en cada llamada que el
 * transporte es Graph y no otra cosa.
 */
export type EnviarCorreoFn = (input: {
  destinatarios: string[];
  asunto: string;
  cuerpoTexto: string;
  cuerpoHtml?: string;
}) => Promise<{ estado: "enviado" | "simulado"; redirigido: boolean }>;

/** Los tipos de enlace que `generateLink` sabe emitir y que este proyecto usa. */
export type TipoEnlaceAuth = "recovery" | "signup" | "invite" | "magiclink";

/** Lo mínimo del cliente de Supabase que este módulo necesita, para poder falsearlo en pruebas. */
export type ClienteAdmin = {
  auth: {
    admin: {
      generateLink(parametros: {
        type: string;
        email: string;
        password?: string;
        options?: { redirectTo?: string; data?: Record<string, unknown> };
      }): Promise<{
        data: { properties?: { hashed_token?: string } | null } | null;
        error: { message: string; status?: number } | null;
      }>;
    };
  };
};

export class UsuarioInexistente extends Error {
  constructor() {
    super("No hay usuario con ese correo.");
    this.name = "UsuarioInexistente";
  }
}

/**
 * GoTrue no distingue "no existe" con un código propio, así que hay que mirar el mensaje. Se
 * chequea en minúsculas y por fragmentos porque el texto cambió entre versiones.
 */
function esUsuarioInexistente(mensaje: string): boolean {
  const texto = mensaje.toLowerCase();
  return texto.includes("user not found") || texto.includes("no user found");
}

/**
 * Genera el enlace con GoTrue y manda el correo por Graph.
 *
 * Devuelve lo mismo que `enviarCorreo`: con `MAIL_ENABLED` apagado el estado es `simulado` y no
 * sale nada a la red, que es como se prueba sin mandar correo de verdad.
 *
 * Lanza `UsuarioInexistente` cuando el correo no corresponde a ninguna cuenta. Quien llama decide
 * qué hacer con eso: un flujo de admin puede reportarlo, pero uno público NO debe —  responder
 * distinto según exista o no la cuenta convierte el formulario en un detector de usuarios.
 */
export async function generarYEnviarCorreoAuth(parametros: {
  admin: ClienteAdmin;
  enviar: EnviarCorreoFn;
  tipo: TipoEnlaceAuth;
  email: string;
  redirectTo: string;
  supabaseUrl: string;
  nombre?: string | null;
  /** Sólo para `signup`: `generateLink` exige la contraseña al crear la cuenta. */
  password?: string;
  /** Sólo para `signup`: metadata del usuario nuevo. */
  metadata?: Record<string, unknown>;
}): Promise<{ estado: "enviado" | "simulado"; redirigido: boolean }> {
  const { admin, enviar, tipo, email, redirectTo, supabaseUrl } = parametros;

  const { data, error } = await admin.auth.admin.generateLink({
    type: tipo,
    email,
    ...(parametros.password ? { password: parametros.password } : {}),
    options: {
      redirectTo,
      ...(parametros.metadata ? { data: parametros.metadata } : {}),
    },
  });

  if (error) {
    if (esUsuarioInexistente(error.message)) {
      throw new UsuarioInexistente();
    }
    throw new Error(`generateLink(${tipo}) falló: ${error.message}`);
  }

  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error(`generateLink(${tipo}) no devolvió hashed_token.`);
  }

  const correo = renderizarCorreoAuth({
    tipo,
    tokenHash,
    redirectTo,
    siteUrl: redirectTo,
    supabaseUrl,
    email,
    nombre: parametros.nombre ?? null,
  });

  const resultado = await enviar({
    destinatarios: [email],
    asunto: correo.asunto,
    cuerpoTexto: correo.cuerpoTexto,
    cuerpoHtml: correo.cuerpoHtml,
  });

  return { estado: resultado.estado, redirigido: resultado.redirigido };
}
