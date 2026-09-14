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

const NOMBRE_SISTEMA = "EMS — Ruizmier";
const PIE = "Mensaje automático. No responda a esta dirección.";

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
    `— ${NOMBRE_SISTEMA}`,
    PIE,
  ].join("\n");

  const detallesHtml = detalles.length > 0
    ? `<ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.6;color:#1f2933;">
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
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2933;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;">${escaparHtml(encabezado)}</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">${escaparHtml(copia.intro)}</p>
      ${detallesHtml}
      <p style="margin:0 0 24px;">
        <a href="${escaparHtml(enlace)}"
           style="display:inline-block;padding:12px 20px;background:#0f4c81;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;">
          ${escaparHtml(copia.boton)}
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#52606d;line-height:1.5;">
        Si el botón no funciona, copie esta dirección en el navegador:<br />
        <span style="word-break:break-all;">${escaparHtml(enlace)}</span>
      </p>
      ${notaFinal
        ? `<p style="margin:16px 0 0;font-size:13px;color:#52606d;line-height:1.5;">${notaFinal}</p>`
        : ""}
      <hr style="border:none;border-top:1px solid #e4e7eb;margin:24px 0;" />
      <p style="margin:0;font-size:12px;color:#7b8794;">
        ${escaparHtml(NOMBRE_SISTEMA)} — ${escaparHtml(PIE)}
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
