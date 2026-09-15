// supabase/functions/_shared/mail-config.ts

/**
 * Las decisiones de configuración del correo, separadas del transporte.
 *
 * Vive aparte de `mail-graph.ts` por la misma razón que `correo-auth.ts` recibe el envío
 * inyectado: ese módulo importa por URL (`deno.land/std`) y vitest no puede cargarlo, así que
 * todo lo que esté adentro queda sin pruebas. Esto SÍ se prueba, y conviene que se pruebe —
 * decide si un correo sale de verdad o se simula, y simular devuelve éxito.
 */

/**
 * Solo "true" habilita llamadas externas; el `.toLowerCase()` no ensancha la semántica.
 *
 * NI SIN VALOR NI CON UN VALOR RARO HAY DEFAULT: los dos lanzan, en vez de caer a "simular". El
 * default silencioso era peligroso justamente donde más se nota: un proyecto recién desplegado
 * al que nadie le cargó el secreto simulaba TODOS los correos y devolvía éxito, así que el alta
 * creaba la cuenta y le decía al usuario que revisara una casilla a la que no había salido nada.
 * Nada en los logs de la aplicación distinguía eso de un envío real.
 *
 * Un `MAIL_ENABLED=tru` termina exactamente igual —simula y devuelve éxito— y por eso se rechaza
 * con el mismo criterio: `=== "true"` a secas convierte cualquier typo en la decisión silenciosa
 * que esta guarda existe para eliminar. Dentro de la bandeja de salida es peor todavía: el
 * drenaje cierra la fila en `sent` y el correo queda registrado como entregado.
 *
 * `MAIL_ENABLED=false` sigue siendo válido y sigue simulando: lo que deja de existir es simular
 * POR NO HABER DECIDIDO.
 */
export function correoHabilitado(): boolean {
  const valor = Deno.env.get("MAIL_ENABLED")?.trim().toLowerCase();
  if (valor === "true") return true;
  if (valor === "false") return false;

  throw new Error(
    (valor === undefined || valor === ""
      ? "Falta el secreto MAIL_ENABLED."
      : `MAIL_ENABLED tiene un valor que no se entiende: "${valor}".`) +
      ' Se espera "true" (envia por Microsoft Graph) o "false" (simula sin salir a la red). ' +
      "Ningun otro valor se asume: ver docs/operations.md, Mail delivery secrets.",
  );
}
