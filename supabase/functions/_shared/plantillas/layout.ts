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
  /** Texto del botón. Imperativo, dos o tres palabras. */
  boton: string;
  /** Cierre opcional: sólo cuando agrega algo que el lector necesita. */
  cierre?: string;
};

export type CorreoRenderizado = {
  asunto: string;
  cuerpoTexto: string;
  cuerpoHtml: string;
};

export type OpcionesCuerpo = {
  /** Nombre del destinatario, si se conoce. */
  nombre?: string | null;
  /** Líneas de detalle: número de solicitud, código de encargo, conteos de un recordatorio. */
  detalles?: { etiqueta: string; valor: string }[];
  /** Los enlaces con token vencen; los que apuntan a una pantalla, no. */
  mencionarVencimiento?: boolean;
};

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
  enlace: string,
  opciones: OpcionesCuerpo = {},
): { cuerpoTexto: string; cuerpoHtml: string } {
  const encabezado = saludo(opciones.nombre);
  const detalles = opciones.detalles ?? [];
  const vence = opciones.mencionarVencimiento === true;

  const cuerpoTexto = [
    encabezado,
    "",
    copia.intro,
    ...(detalles.length > 0
      ? ["", ...detalles.map((d) => `- ${d.etiqueta}: ${d.valor}`)]
      : []),
    "",
    `${copia.boton}: ${enlace}`,
    "",
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
      <p style="margin:0 0 16px;font-size:15px;">${escaparHtml(encabezado)}</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">${escaparHtml(copia.intro)}</p>
      ${detallesHtml}
      <p style="margin:0 0 24px;">
        <a href="${escaparHtml(enlace)}"
           style="display:inline-block;padding:12px 20px;background:${COLORES.boton};color:${COLORES.botonTexto};text-decoration:none;border-radius:6px;font-size:15px;">
          ${escaparHtml(copia.boton)}
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:${COLORES.textoTenue};line-height:1.5;">
        Si el botón no funciona, copie esta dirección en el navegador:<br />
        <span style="word-break:break-all;">${escaparHtml(enlace)}</span>
      </p>
      ${notaFinal
        ? `<p style="margin:16px 0 0;font-size:13px;color:${COLORES.textoTenue};line-height:1.5;">${notaFinal}</p>`
        : ""}
      <hr style="border:none;border-top:1px solid ${COLORES.borde};margin:24px 0;" />
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
  enlace: string,
  opciones: OpcionesCuerpo = {},
): CorreoRenderizado {
  const { cuerpoTexto, cuerpoHtml } = construirCuerpos(copia, enlace, opciones);
  return { asunto: copia.asunto, cuerpoTexto, cuerpoHtml };
}
