// supabase/functions/_shared/mail-graph.ts

/**
 * Envío de correo institucional vía Microsoft Graph (`POST /users/{remitente}/sendMail`).
 * Documentación: https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0
 *
 * Port a Deno del servicio probado en Cairo. Sólo cambian dos cosas respecto del original de
 * Node: la lectura de entorno (`Deno.env.get` en vez de `process.env`) y la codificación Base64
 * de los adjuntos (`encode()` de std en vez de `Buffer`). La lógica —caché de token, reintento
 * en 401, interruptores, mensajes de error— es la misma, a propósito: ya está validada contra
 * el tenant real y contra los códigos que devuelve Entra.
 *
 * Configuración: `supabase/functions/.env.example`. En la nube son secrets de Supabase.
 */

import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

/* ------------------------------------------------------------------ */
/* API pública                                                         */
/* ------------------------------------------------------------------ */

export type AdjuntoCorreo = {
  nombre: string; // con extensión: "reporte-avance.xlsx"
  tipoContenido?: string; // default "application/octet-stream"
  contenido: Uint8Array;
};

export type EnviarCorreoInput = {
  destinatarios: string[];
  asunto: string;
  cuerpoTexto: string;
  cuerpoHtml?: string;
  adjuntos?: AdjuntoCorreo[];
};

export type ResultadoCorreo = {
  estado: "enviado" | "simulado";
  destinatarios: string[]; // los realmente usados (ya redirigidos)
  redirigido: boolean;
};

/* ------------------------------------------------------------------ */
/* Constantes de módulo                                                 */
/* ------------------------------------------------------------------ */

const AUTHORITY_HOST = "https://login.microsoftonline.com";
const SCOPE = "https://graph.microsoft.com/.default";
// Falla en algunos buzones compartidos sin licencia -> cambio de una línea si hace falta.
const GUARDAR_EN_ENVIADOS = true;
/** Límite de adjuntos crudos para que el payload Base64 de Graph no supere 4 MB. */
export const LIMITE_ADJUNTOS_BYTES = 3 * 1024 * 1024;
const MARGEN_TOKEN_MS = 300_000;
const TIMEOUT_MS = 20_000;

// Códigos documentados en la prueba aislada del servicio original.
const PISTAS: Record<string, string> = {
  AADSTS7000215: "El Client Secret está mal copiado o expiró — genera uno nuevo en Azure/Entra.",
  AADSTS700016: "El Client ID o el Tenant ID están mal — revisa la app registration.",
  ErrorAccessDenied:
    "Falta el admin consent sobre Mail.Send, o la Application Access Policy no incluye el buzón remitente (MS_GRAPH_SENDER_EMAIL).",
  Authorization_RequestDenied:
    "Falta el admin consent sobre Mail.Send, o la Application Access Policy no incluye el buzón remitente (MS_GRAPH_SENDER_EMAIL).",
  ErrorInvalidUser:
    "MS_GRAPH_SENDER_EMAIL no existe o está mal escrito — debe ser el UPN primario, no un alias.",
  ResourceNotFound:
    "MS_GRAPH_SENDER_EMAIL no existe o está mal escrito — debe ser el UPN primario, no un alias.",
};

/* ------------------------------------------------------------------ */
/* Tipos internos                                                       */
/* ------------------------------------------------------------------ */

type ConfigGraph = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  remitente: string;
  remitenteNombre: string | null;
};

type RespuestaToken = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type RespuestaError = { error?: { code?: string; message?: string } };

type AdjuntoGraph = {
  "@odata.type": "#microsoft.graph.fileAttachment";
  name: string;
  contentType: string;
  contentBytes: string;
};

type MensajeGraph = {
  subject: string;
  body: { contentType: "Text" | "HTML"; content: string };
  toRecipients: { emailAddress: { address: string } }[];
  attachments?: AdjuntoGraph[];
  from?: { emailAddress: { address: string; name: string } };
};

/* ------------------------------------------------------------------ */
/* Caché de token                                                       */
/* ------------------------------------------------------------------ */

let tokenCache: { clave: string; token: string; expiraEn: number } | null = null;
let tokenEnVuelo: Promise<string> | null = null;

/** Nunca lee el entorno en tiempo de import: valida recién dentro de `enviarCorreo`. */
function leerConfig(): ConfigGraph {
  const tenantId = Deno.env.get("MS_GRAPH_TENANT_ID")?.trim();
  const clientId = Deno.env.get("MS_GRAPH_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("MS_GRAPH_CLIENT_SECRET");
  const remitente = Deno.env.get("MS_GRAPH_SENDER_EMAIL")?.trim();
  const remitenteNombre = Deno.env.get("MS_GRAPH_SENDER_NAME")?.trim() || null;

  const faltantes: string[] = [];
  if (!tenantId) faltantes.push("MS_GRAPH_TENANT_ID");
  if (!clientId) faltantes.push("MS_GRAPH_CLIENT_ID");
  if (!clientSecret) faltantes.push("MS_GRAPH_CLIENT_SECRET");
  if (!remitente) faltantes.push("MS_GRAPH_SENDER_EMAIL");
  if (faltantes.length > 0) {
    throw new Error(
      `Faltan variables de entorno para el correo institucional: ${faltantes.join(", ")}.`,
    );
  }

  return {
    tenantId: tenantId!,
    clientId: clientId!,
    clientSecret: clientSecret!,
    remitente: remitente!,
    remitenteNombre,
  };
}

/**
 * Solo "true" habilita llamadas externas; el `.toLowerCase()` no ensancha la semántica.
 *
 * SIN VALOR NO HAY DEFAULT: falta la variable y esto lanza, en vez de caer a "simular". El
 * default silencioso era peligroso justamente donde más se nota: un proyecto recién desplegado
 * al que nadie le cargó el secreto simulaba TODOS los correos y devolvía éxito, así que el alta
 * creaba la cuenta y le decía al usuario que revisara una casilla a la que no había salido nada.
 * Nada en los logs de la aplicación distinguía eso de un envío real.
 *
 * Obligar a que esté escrita convierte esa omisión en un error visible en el primer envío.
 * `MAIL_ENABLED=false` sigue siendo válido y sigue simulando: lo que deja de existir es
 * simular POR NO HABER DECIDIDO.
 */
function correoHabilitado(): boolean {
  const valor = Deno.env.get("MAIL_ENABLED")?.trim().toLowerCase();
  if (valor === undefined || valor === "") {
    throw new Error(
      'Falta el secreto MAIL_ENABLED. Se espera "true" (envia por Microsoft Graph) o "false" ' +
        "(simula sin salir a la red). Sin valor no se asume ninguno de los dos: ver " +
        "docs/operations.md, Mail delivery secrets.",
    );
  }
  return valor === "true";
}

function normalizarDestinatarios(destinatarios: string[]): string[] {
  const vistos = new Set<string>();
  const normalizados: string[] = [];
  for (const raw of destinatarios) {
    const valor = raw.trim();
    if (!valor) continue;
    const clave = valor.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    normalizados.push(valor);
  }
  return normalizados;
}

/** Si `MAIL_TEST_RECIPIENT` está seteado, reemplaza a TODOS los destinatarios. */
function resolverDestinatarios(destinatarios: string[]): {
  efectivos: string[];
  redirigido: boolean;
} {
  const testRecipient = Deno.env.get("MAIL_TEST_RECIPIENT")?.trim();
  if (testRecipient) {
    console.log(
      `[mail-graph] Redirigiendo correo: destinatarios originales [${destinatarios.join(", ")}] → ${testRecipient} (MAIL_TEST_RECIPIENT).`,
    );
    return { efectivos: [testRecipient], redirigido: true };
  }
  return { efectivos: destinatarios, redirigido: false };
}

function construirAdjuntos(adjuntos: AdjuntoCorreo[]): AdjuntoGraph[] {
  let totalBytes = 0;
  for (const adjunto of adjuntos) {
    const nombre = adjunto.nombre.trim();
    if (!nombre) throw new Error("Cada adjunto debe tener un nombre no vacío.");
    if (!/\.[^./\\]+$/.test(nombre)) {
      throw new Error(`El adjunto "${nombre}" debe incluir una extensión (ej. ".xlsx").`);
    }
    totalBytes += adjunto.contenido.byteLength;
  }
  // Graph corta el body en 4 MB y Base64 infla 4/3: el límite práctico de bytes crudos es ~3 MB.
  if (totalBytes > LIMITE_ADJUNTOS_BYTES) {
    throw new Error(
      `Los adjuntos suman ${totalBytes} bytes, por encima del límite de ${LIMITE_ADJUNTOS_BYTES} bytes. ` +
        "Para archivos más grandes hace falta una sesión de carga (createUploadSession), fuera de alcance de este servicio.",
    );
  }
  return adjuntos.map((adjunto) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: adjunto.nombre.trim(),
    contentType: adjunto.tipoContenido ?? "application/octet-stream",
    contentBytes: base64Encode(adjunto.contenido),
  }));
}

function mensajeDeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return `tiempo de espera agotado (${TIMEOUT_MS} ms)`;
    }
    return error.message;
  }
  return String(error);
}

/**
 * Error de integración con Graph/Entra: `message` lleva el detalle completo
 * (HTTP status, código AADSTS, Trace ID, Correlation ID...) pensado SOLO para
 * logs del servidor. `pista` es el único fragmento seguro para mostrar en la
 * UI — una recomendación accionable, sin identificadores de la app ni del
 * tenant que no aporten nada al usuario y sí aumenten la superficie expuesta.
 */
export class GraphIntegrationError extends Error {
  readonly pista: string | null;

  constructor(message: string, pista: string | null) {
    super(message);
    this.name = "GraphIntegrationError";
    this.pista = pista;
  }
}

function buscarPista(mensaje: string): string | null {
  const codigo = Object.keys(PISTAS).find((clave) => mensaje.includes(clave));
  return codigo ? PISTAS[codigo] : null;
}

/** Shape plano de Entra ID: `{ error, error_description, error_codes }` (AADSTSxxxxxxx vive en `error_description`). */
function construirErrorToken(
  status: number,
  cuerpo: RespuestaToken | null,
  statusText: string,
): Error {
  if (!cuerpo) {
    return new GraphIntegrationError(
      `No se pudo obtener el token de Microsoft Entra ID (HTTP ${status} ${statusText}): sin cuerpo de respuesta.`,
      null,
    );
  }
  const descripcion = (cuerpo.error_description ?? "").replace(/\r?\n/g, " | ");
  const detalle = [cuerpo.error, descripcion].filter(Boolean).join(": ") || "sin detalle";
  const mensaje = `No se pudo obtener el token de Microsoft Entra ID (HTTP ${status}): ${detalle}`;
  return new GraphIntegrationError(mensaje, buscarPista(mensaje));
}

/** Shape de Graph: `{ error: { code, message } }` — distinto del error de token. */
function construirErrorSendMail(
  status: number,
  cuerpo: RespuestaError | null,
  statusText: string,
): Error {
  if (!cuerpo?.error) {
    return new GraphIntegrationError(
      `Microsoft Graph rechazó el envío de correo (HTTP ${status} ${statusText}): sin cuerpo de respuesta.`,
      null,
    );
  }
  const detalle = `${cuerpo.error.code ?? "sin código"}: ${cuerpo.error.message ?? "sin mensaje"}`;
  const mensaje = `Microsoft Graph rechazó el envío de correo (HTTP ${status}): ${detalle}`;
  return new GraphIntegrationError(mensaje, buscarPista(mensaje));
}

async function solicitarToken(
  config: ConfigGraph,
): Promise<{ accessToken: string; expiresIn: number }> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${AUTHORITY_HOST}/${config.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: SCOPE,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `No se pudo contactar a Microsoft Entra ID para solicitar el token: ${mensajeDeError(error)}`,
    );
  }

  const cuerpo = (await respuesta.json().catch(() => null)) as RespuestaToken | null;
  if (!respuesta.ok || !cuerpo?.access_token) {
    throw construirErrorToken(respuesta.status, cuerpo, respuesta.statusText);
  }

  return { accessToken: cuerpo.access_token, expiresIn: cuerpo.expires_in ?? 3600 };
}

/**
 * Caché a nivel de módulo con margen de 300 s (no 60): cubre desfase de reloj del
 * contenedor y requests lentos sobre tokens que duran 3600 s.
 *
 * En edge functions la caché vive lo que vive el isolate. Es correcto igual: cada isolate pide
 * su token una vez y lo reusa mientras atienda requests, que es exactamente lo que se busca.
 */
async function obtenerToken(config: ConfigGraph): Promise<string> {
  const clave = `${config.tenantId}|${config.clientId}`;
  const ahora = Date.now();

  if (tokenCache && tokenCache.clave === clave && tokenCache.expiraEn > ahora) {
    return tokenCache.token;
  }

  if (!tokenEnVuelo) {
    tokenEnVuelo = solicitarToken(config)
      .then(({ accessToken, expiresIn }) => {
        tokenCache = {
          clave,
          token: accessToken,
          expiraEn: Date.now() + expiresIn * 1000 - MARGEN_TOKEN_MS,
        };
        return accessToken;
      })
      .finally(() => {
        tokenEnVuelo = null;
      });
  }

  return tokenEnVuelo;
}

/** Un solo reintento en 401 (bandera booleana, sin recursión): invalida caché y pide token nuevo. */
async function enviarAGraph(config: ConfigGraph, mensaje: MensajeGraph): Promise<void> {
  let reintentado = false;

  for (;;) {
    const token = await obtenerToken(config);

    let respuesta: Response;
    try {
      respuesta = await fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.remitente)}/sendMail`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: mensaje, saveToSentItems: GUARDAR_EN_ENVIADOS }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
    } catch (error) {
      throw new Error(
        `No se pudo contactar a Microsoft Graph para enviar el correo: ${mensajeDeError(error)}`,
      );
    }

    if (respuesta.status === 202) return;

    if (respuesta.status === 401 && !reintentado) {
      reintentado = true;
      tokenCache = null;
      continue;
    }

    const cuerpo = (await respuesta.json().catch(() => null)) as RespuestaError | null;
    throw construirErrorSendMail(respuesta.status, cuerpo, respuesta.statusText);
  }
}

/* ------------------------------------------------------------------ */
/* Envío                                                                */
/* ------------------------------------------------------------------ */

/** Envía un correo institucional vía Microsoft Graph; respeta `MAIL_ENABLED` y `MAIL_TEST_RECIPIENT`. */
export async function enviarCorreo(input: EnviarCorreoInput): Promise<ResultadoCorreo> {
  const asunto = input.asunto.trim();
  if (!asunto) throw new Error("El asunto del correo no puede estar vacío.");

  const destinatariosNormalizados = normalizarDestinatarios(input.destinatarios);
  if (destinatariosNormalizados.length === 0) {
    throw new Error("El correo debe tener al menos un destinatario válido.");
  }

  const adjuntosGraph =
    input.adjuntos && input.adjuntos.length > 0 ? construirAdjuntos(input.adjuntos) : [];

  const { efectivos, redirigido } = resolverDestinatarios(destinatariosNormalizados);

  if (!correoHabilitado()) {
    console.log(
      `[mail-graph] MAIL_ENABLED no está en "true": se simula el envío. Asunto: "${asunto}". ` +
        `Destinatarios: [${efectivos.join(", ")}].`,
    );
    return { estado: "simulado", destinatarios: efectivos, redirigido };
  }

  const config = leerConfig();

  const mensaje: MensajeGraph = {
    subject: asunto,
    body: input.cuerpoHtml?.trim()
      ? { contentType: "HTML", content: input.cuerpoHtml }
      : { contentType: "Text", content: input.cuerpoTexto },
    toRecipients: efectivos.map((direccion) => ({ emailAddress: { address: direccion } })),
    ...(adjuntosGraph.length > 0 ? { attachments: adjuntosGraph } : {}),
    // Exchange suele sobreescribir el display name; siempre con la dirección del propio buzón autorizado.
    ...(config.remitenteNombre
      ? { from: { emailAddress: { address: config.remitente, name: config.remitenteNombre } } }
      : {}),
  };

  await enviarAGraph(config, mensaje);

  console.log(
    `[mail-graph] Correo enviado. Asunto: "${asunto}". Destinatarios: [${efectivos.join(", ")}]. ` +
      `Adjuntos: [${(input.adjuntos ?? []).map((a) => a.nombre).join(", ") || "ninguno"}].`,
  );

  return { estado: "enviado", destinatarios: efectivos, redirigido };
}

export const mailGraphService = { enviarCorreo };
