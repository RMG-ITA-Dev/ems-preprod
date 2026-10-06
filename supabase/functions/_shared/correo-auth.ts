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
import type { AdjuntoInline } from "./plantillas/layout.ts";

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
  /**
   * Los logos que el HTML referencia por `cid:`. NO es opcional de verdad: el cuerpo que arma
   * `renderizarCorreoAuth` siempre trae los dos `<img src="cid:...">`, así que un envío sin
   * adjuntos sale con el ícono de imagen rota en el encabezado y en el pie.
   *
   * Va como opcional sólo para que los dobles de prueba que ya existen sigan compilando.
   */
  adjuntos?: AdjuntoInline[];
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
        data: {
          properties?: { hashed_token?: string } | null;
          /** Para `signup`, la cuenta que GoTrue acaba de crear. Ver `FalloDeEnvio`. */
          user?: { id?: string } | null;
        } | null;
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
 * El enlace se generó pero el correo NO salió.
 *
 * Existe para que quien llama pueda distinguir las dos fases, porque para `signup` no significan
 * lo mismo: `generateLink({ type: "signup" })` CREA LA CUENTA y después se manda el mensaje. Si
 * falla la generación no quedó nada; si falla el envío quedó una cuenta sin confirmar y sin
 * correo — y el reintento del usuario ya no puede arreglarla solo, porque a partir de ahí GoTrue
 * responde "ya registrado" y el alta toma la rama de cuenta existente.
 *
 * `usuarioId` es la cuenta recién creada, para que quien llama pueda deshacerla. Va a estar sólo
 * en `signup`: para `recovery` o `magiclink` la cuenta ya existía y no hay nada que deshacer.
 */
export class FalloDeEnvio extends Error {
  constructor(
    readonly causa: unknown,
    readonly usuarioId?: string | null,
  ) {
    super(causa instanceof Error ? causa.message : String(causa));
    this.name = "FalloDeEnvio";
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

/** Lo mínimo del cliente para llamar a las RPC del throttle, separado por el mismo motivo. */
export type ClienteRpc = {
  rpc(
    nombre: string,
    argumentos: Record<string, unknown>,
  ): Promise<{ error: { message: string } | null }>;
};

/**
 * Devuelve el cupo de correo que `claim_auth_email_slot()` ya había descontado, para cuando el
 * correo NO llegó a salir.
 *
 * El cupo se pide antes de intentar el envío, así que un fallo de Graph deja gastado un cupo por
 * un correo que nunca existió. Eso trancaba el reintento: el alta a medias se deshace justamente
 * para que el usuario pueda volver a registrarse, y el mínimo entre correos se lo comía con una
 * respuesta de "revise su casilla" sobre una cuenta que ya no está.
 *
 * NO se llama cuando el correo sí salió, ni cuando el consumo del cupo es deliberado (una
 * dirección que ya tiene cuenta o que no existe: si probarlas saliera gratis, el throttle no
 * frenaría el barrido).
 *
 * No lanza: corre dentro de un camino de error y no puede tapar la falla original.
 */
export async function devolverCupoDeCorreo(
  admin: ClienteRpc,
  email: string,
  etiqueta: string,
): Promise<void> {
  const { error } = await admin.rpc("release_auth_email_slot", { p_email: email });
  if (error) {
    // Lo peor que pasa es que el usuario espere al minuto para reintentar.
    console.error(`[${etiqueta}] no se pudo devolver el cupo de correo:`, error.message);
  }
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

  // A partir de acá la cuenta de un `signup` YA EXISTE. Cualquier fallo del transporte se
  // envuelve para que quien llama sepa que lo que falló fue la entrega y no la generación, y
  // pueda deshacer el alta a medias en vez de dejar una cuenta sin confirmar y sin correo.
  let resultado: Awaited<ReturnType<EnviarCorreoFn>>;
  try {
    resultado = await enviar({
      destinatarios: [email],
      asunto: correo.asunto,
      cuerpoTexto: correo.cuerpoTexto,
      cuerpoHtml: correo.cuerpoHtml,
      adjuntos: correo.adjuntos,
    });
  } catch (error) {
    throw new FalloDeEnvio(error, data?.user?.id ?? null);
  }

  return { estado: resultado.estado, redirigido: resultado.redirigido };
}
