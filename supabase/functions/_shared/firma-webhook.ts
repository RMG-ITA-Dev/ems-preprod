// supabase/functions/_shared/firma-webhook.ts

/**
 * Verificación de firma Standard Webhooks (https://www.standardwebhooks.com/), que es el formato
 * con el que Supabase Auth firma el Send Email Hook.
 *
 * Está escrito a mano sobre Web Crypto en vez de traer la librería `standardwebhooks`: son 40
 * líneas, el algoritmo está congelado por la especificación, y evita colgar la única barrera de
 * autenticación del hook de una dependencia externa sin fijar.
 *
 * Sin APIs de Deno ni imports por URL a propósito: así vitest puede importar este archivo y
 * probar la verificación, que es justamente la parte donde un error se paga caro.
 *
 * Contrato:
 *   - `webhook-id`, `webhook-timestamp` (unix en segundos) y `webhook-signature` en los headers.
 *   - Se firma literalmente `${id}.${timestamp}.${cuerpo}` con HMAC-SHA256.
 *   - `webhook-signature` es una lista separada por espacios de `v1,<firma en base64>`: puede
 *     traer más de una durante una rotación de secreto, y basta con que una coincida.
 */

/** Ventana de tolerancia del timestamp. La especificación recomienda 5 minutos. */
export const TOLERANCIA_SEGUNDOS = 5 * 60;

export class FirmaWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirmaWebhookError";
  }
}

export type HeadersWebhook = {
  get(nombre: string): string | null;
};

/**
 * Supabase entrega el secreto como `v1,whsec_<base64>`. El material real de la clave es lo que
 * viene después de `whsec_`, en base64. Se aceptan las tres formas por las que suele pasar al
 * copiarlo del dashboard.
 */
export function normalizarSecreto(secreto: string): Uint8Array {
  const limpio = secreto.trim().replace(/^v1,/, "").replace(/^whsec_/, "");
  if (!limpio) {
    throw new FirmaWebhookError("El secreto del webhook está vacío.");
  }

  const binario = atob(limpio);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

async function firmar(clave: Uint8Array, contenido: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    clave,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(contenido));
  return btoa(String.fromCharCode(...new Uint8Array(firma)));
}

/** Comparación en tiempo constante: no cortar en la primera diferencia. */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let distintos = 0;
  for (let i = 0; i < a.length; i++) {
    distintos |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return distintos === 0;
}

/**
 * Verifica la firma del webhook. Lanza `FirmaWebhookError` si algo no cierra; no devuelve
 * booleano a propósito, para que quien llama no pueda ignorar el resultado por descuido.
 *
 * `ahoraSegundos` es inyectable sólo para poder probar la ventana de tolerancia.
 */
export async function verificarFirmaWebhook(params: {
  secreto: string;
  cuerpo: string;
  headers: HeadersWebhook;
  ahoraSegundos?: number;
}): Promise<void> {
  const { secreto, cuerpo, headers } = params;

  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const firmas = headers.get("webhook-signature");

  if (!id || !timestamp || !firmas) {
    throw new FirmaWebhookError(
      "Faltan headers de firma (webhook-id, webhook-timestamp, webhook-signature).",
    );
  }

  const marca = Number(timestamp);
  if (!Number.isFinite(marca)) {
    throw new FirmaWebhookError("El header webhook-timestamp no es un número.");
  }

  // Corta el replay de una petición vieja capturada, que es lo único que la firma sola no impide.
  const ahora = params.ahoraSegundos ?? Math.floor(Date.now() / 1000);
  if (Math.abs(ahora - marca) > TOLERANCIA_SEGUNDOS) {
    throw new FirmaWebhookError(
      `El webhook está fuera de la ventana de ${TOLERANCIA_SEGUNDOS} s (timestamp ${timestamp}).`,
    );
  }

  const esperada = await firmar(normalizarSecreto(secreto), `${id}.${timestamp}.${cuerpo}`);

  // Puede venir más de una firma ("v1,aaa v1,bbb") durante una rotación: alcanza con que una valga.
  const candidatas = firmas
    .split(" ")
    .map((entrada) => entrada.trim())
    .filter((entrada) => entrada.startsWith("v1,"))
    .map((entrada) => entrada.slice("v1,".length));

  if (candidatas.length === 0) {
    throw new FirmaWebhookError("El header webhook-signature no trae ninguna firma v1.");
  }

  if (!candidatas.some((candidata) => iguales(candidata, esperada))) {
    throw new FirmaWebhookError("La firma del webhook no coincide.");
  }
}
