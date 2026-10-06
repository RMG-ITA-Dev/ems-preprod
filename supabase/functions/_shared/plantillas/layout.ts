// supabase/functions/_shared/plantillas/layout.ts

/**
 * Envoltura común de todos los correos: el mismo HTML, el mismo texto plano, el mismo pie.
 *
 * Existe para que ninguna plantilla arme su propio HTML. Cuando cada una tenía el suyo, dos
 * correos del mismo sistema se veían distintos según quién los hubiera escrito último.
 *
 * TypeScript puro, sin APIs de Deno ni imports por URL: vitest importa este archivo tal cual.
 *
 * Registro de los textos: español neutro, imperativo formal, sin relleno. Quien lee un correo
 * de sistema quiere saber qué pasó y qué tiene que hacer, en ese orden.
 */

import { LOGO_EMS, LOGO_RUIZMIER, type LogoCorreo } from "./constants/logos.ts";

const NOMBRE_SISTEMA = "EMS 2.0 - Ruizmier";
const PIE = "Mensaje automático. No responda a esta dirección.";

/**
 * La paleta de la marca, en hex literal y con nombre.
 *
 * POR QUÉ HEX Y NO TOKENS, que es la regla del resto del repo: en correo no hay tokens. El motor
 * de Word con el que Outlook renderiza no resuelve `var()`, y casi todos los clientes descartan
 * `<style>` y las clases, así que el estilo tiene que viajar inline y literal. Lo que sí se puede
 * es no repartir los valores sueltos por el HTML: nombrarlos acá deja un solo lugar donde
 * mirarlos cuando la marca cambie.
 *
 * Los valores salen de `docs/skills/design-system.md`. Antes eran otros —la paleta Blue Grey de
 * Tailwind, con un `#0f4c81` que quería ser el navy de la marca y quedaba corrido—, así que el
 * correo institucional salía con colores que no eran los de la firma.
 *
 * El botón va en `brand-navy` y no en `brand-purple`, que es el color de acción primaria de la
 * app: ahí el púrpura significa Agregar/Guardar (regla 1 de AGENTS.md) y este botón navega.
 * Tampoco en `brand-teal`: blanco sobre teal da 4.29:1, por debajo del 4.5:1 que pide AA para
 * texto normal. Sobre navy da 10.97:1.
 */
const COLORES = {
  /** `background` — fondo de página, gris con tinte frío. */
  fondo: "#f7f9fc",
  /** `card` — la tarjeta del mensaje. */
  tarjeta: "#ffffff",
  /** `brand-navy`, que en la app es además el `foreground`. */
  texto: "#0f3c73",
  /** `brand-gray` — texto secundario. 6.08:1 sobre blanco. */
  textoTenue: "#5a6370",
  /** `border` — la línea del pie. */
  borde: "#c9d4e9",
  boton: "#0f3c73",
  botonTexto: "#ffffff",
} as const;

/** Lo que define cada plantilla. El resto del mensaje es común. */
export type Copia = {
  asunto: string;
  /** Qué pasó y qué se espera. Una o dos frases. */
  intro: string;
  /**
   * Texto del botón. Imperativo, dos o tres palabras.
   *
   * OPCIONAL, y sin él el correo sale sin botón. Un aviso puramente informativo no tiene a
   * dónde mandar al lector: `engagement.specialist_assigned` avisa al Gerente ESPECIALISTA de
   * su asignación y la ficha del encargo le queda cerrada por RLS. Antes esos correos salían
   * igual, con el botón apuntando a la portada: prometían una pantalla y entregaban otra.
   */
  boton?: string;
  /** Cierre opcional: sólo cuando agrega algo que el lector necesita. */
  cierre?: string;
};

export type CorreoRenderizado = {
  asunto: string;
  cuerpoTexto: string;
  cuerpoHtml: string;
  /**
   * Los logos que el HTML referencia por `cid:`. Van acá y no dentro de `mail-graph.ts` porque
   * el que sabe qué imágenes usa el cuerpo es quien arma el cuerpo: el servicio de envío es
   * genérico y no tiene por qué conocer la marca.
   *
   * Quien llame a `enviarCorreo` tiene que pasarlos. Sin ellos el `<img src="cid:...">` queda
   * apuntando a un adjunto que no viaja, y el cliente dibuja el ícono de imagen rota.
   */
  adjuntos: AdjuntoInline[];
};

/** Un logo listo para `enviarCorreo`. Espejo de `AdjuntoCorreo` de `mail-graph.ts`, sin importarlo:
 *  aquel módulo es Deno puro y este lo importa vitest. */
export type AdjuntoInline = {
  nombre: string;
  tipoContenido: string;
  contenido: Uint8Array;
  contentId: string;
};

export type OpcionesCuerpo = {
  /** Nombre del destinatario, si se conoce. */
  nombre?: string | null;
  /** Líneas de detalle: número de solicitud, código de encargo, conteos de un recordatorio. */
  detalles?: { etiqueta: string; valor: string }[];
  /** Los enlaces con token vencen; los que apuntan a una pantalla, no. */
  mencionarVencimiento?: boolean;
};

/**
 * Los bytes de cada logo, decodificados una sola vez.
 *
 * `atob` y no `Buffer`: existe tanto en Deno como en el jsdom de vitest, y este archivo lo
 * importan los dos. La caché evita repetir la decodificación en cada correo de una tanda — el
 * drenaje de la bandeja de salida manda varios por invocación y los logos son siempre los mismos.
 */
const bytesCache = new Map<string, Uint8Array>();

function bytesDeLogo(logo: LogoCorreo): Uint8Array {
  const guardado = bytesCache.get(logo.cid);
  if (guardado) return guardado;

  const binario = atob(logo.base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  bytesCache.set(logo.cid, bytes);
  return bytes;
}

function adjuntoDeLogo(logo: LogoCorreo): AdjuntoInline {
  return {
    nombre: logo.nombre,
    tipoContenido: "image/png",
    contenido: bytesDeLogo(logo),
    contentId: logo.cid,
  };
}

/**
 * `width` y `height` como ATRIBUTOS, no sólo en el `style`: Outlook los necesita para reservar
 * el espacio, y sin ellos pinta la imagen a tamaño original —el archivo mide el doble, por
 * pantallas HiDPI— y el encabezado del correo sale al doble de lo previsto.
 */
function etiquetaLogo(logo: LogoCorreo): string {
  return `<img src="cid:${logo.cid}" alt="${escaparHtml(logo.alt)}" width="${logo.anchoCss}" height="${logo.altoCss}" style="display:block;border:0;width:${logo.anchoCss}px;height:${logo.altoCss}px;" />`;
}

export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Registro formal y neutro. `Estimado/a` cubre los dos generos sin pedirle a `staff` un dato que
 * no tiene: la tabla guarda nombre y apellido, no tratamiento.
 */
function saludo(nombre?: string | null): string {
  const limpio = nombre?.trim();
  return limpio ? `Estimado/a ${limpio}:` : "Estimado/a:";
}

const VENCIMIENTO = "El enlace vence en una hora y admite un solo uso.";

/**
 * Arma texto plano y HTML a partir de una copia, un enlace y los detalles.
 *
 * El HTML es deliberadamente simple y con estilos en línea: los clientes de correo descartan las
 * hojas de estilo, y cualquier cosa más elaborada se rompe distinto en cada uno.
 */
export function construirCuerpos(
  copia: Copia,
  enlace: string | null,
  opciones: OpcionesCuerpo = {},
): { cuerpoTexto: string; cuerpoHtml: string } {
  const encabezado = saludo(opciones.nombre);
  const detalles = opciones.detalles ?? [];
  const vence = opciones.mencionarVencimiento === true;

  // Sin destino no hay botón, y tampoco la línea "copie esta dirección": las dos hablan de una
  // pantalla, y si no hay ruta la única dirección que queda es la portada. El correo se manda
  // igual —el hecho vale por sí mismo—, sólo que como aviso y no como invitación a entrar.
  const destino = enlace && copia.boton ? { enlace, boton: copia.boton } : null;

  const cuerpoTexto = [
    encabezado,
    "",
    copia.intro,
    ...(detalles.length > 0
      ? ["", ...detalles.map((d) => `- ${d.etiqueta}: ${d.valor}`)]
      : []),
    "",
    ...(destino ? [`${destino.boton}: ${destino.enlace}`, ""] : []),
    ...(vence ? [VENCIMIENTO] : []),
    ...(copia.cierre ? [copia.cierre] : []),
    "",
    `- ${NOMBRE_SISTEMA}`,
    PIE,
  ].join("\n");

  const detallesHtml = detalles.length > 0
    ? `<ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.6;color:${COLORES.texto};">
        ${detalles
          .map(
            (d) =>
              `<li>${escaparHtml(d.etiqueta)}: <strong>${escaparHtml(d.valor)}</strong></li>`,
          )
          .join("\n        ")}
      </ul>`
    : "";

  const notaFinal = [vence ? escaparHtml(VENCIMIENTO) : "", copia.cierre ? escaparHtml(copia.cierre) : ""]
    .filter(Boolean)
    .join("<br />");

  const cuerpoHtml = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:${COLORES.fondo};font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${COLORES.texto};">
    <div style="max-width:560px;margin:0 auto;background:${COLORES.tarjeta};border-radius:8px;padding:32px;">
      <div style="margin:0 0 24px;">${etiquetaLogo(LOGO_EMS)}</div>
      <p style="margin:0 0 16px;font-size:15px;">${escaparHtml(encabezado)}</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">${escaparHtml(copia.intro)}</p>
      ${detallesHtml}
      ${destino
        ? `<p style="margin:0 0 24px;">
        <a href="${escaparHtml(destino.enlace)}"
           style="display:inline-block;padding:12px 20px;background:${COLORES.boton};color:${COLORES.botonTexto};text-decoration:none;border-radius:6px;font-size:15px;">
          ${escaparHtml(destino.boton)}
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:${COLORES.textoTenue};line-height:1.5;">
        Si el botón no funciona, copie esta dirección en el navegador:<br />
        <span style="word-break:break-all;">${escaparHtml(destino.enlace)}</span>
      </p>`
        : ""}
      ${notaFinal
        ? `<p style="margin:16px 0 0;font-size:13px;color:${COLORES.textoTenue};line-height:1.5;">${notaFinal}</p>`
        : ""}
      <hr style="border:none;border-top:1px solid ${COLORES.borde};margin:24px 0;" />
      <div style="margin:0 0 12px;">${etiquetaLogo(LOGO_RUIZMIER)}</div>
      <p style="margin:0;font-size:12px;color:${COLORES.textoTenue};">
        ${escaparHtml(NOMBRE_SISTEMA)} - ${escaparHtml(PIE)}
      </p>
    </div>
  </body>
</html>`;

  return { cuerpoTexto, cuerpoHtml };
}

/** Arma el correo completo. Es el único lugar que ensambla copia + enlace + detalles. */
export function renderizar(
  copia: Copia,
  enlace: string | null,
  opciones: OpcionesCuerpo = {},
): CorreoRenderizado {
  const { cuerpoTexto, cuerpoHtml } = construirCuerpos(copia, enlace, opciones);
  return {
    asunto: copia.asunto,
    cuerpoTexto,
    cuerpoHtml,
    // Siempre los dos, porque `construirCuerpos` siempre emite los dos `<img>`. Si alguna vez
    // un logo pasa a ser condicional, esta lista tiene que seguir la misma condición: un
    // adjunto inline que el HTML no referencia igual aparece como archivo en algunos clientes.
    adjuntos: [adjuntoDeLogo(LOGO_EMS), adjuntoDeLogo(LOGO_RUIZMIER)],
  };
}
