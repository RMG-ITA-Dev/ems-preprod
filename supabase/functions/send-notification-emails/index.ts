// send-notification-emails
//
// Drena la bandeja de salida (`public.notification_emails`) y despacha por Microsoft Graph.
//
// Lo llama el cron cada 5 minutos, no el navegador. El envío no puede vivir dentro de la
// transacción que produjo el hecho: si Graph tarda 20 s, la aprobación de la orden de trabajo
// tarda 20 s, y si el envío falla no puede tumbar el INSERT. Por eso hay una tabla en el medio.
//
// Contrato:
//   Entrada: POST con el header `x-cron-secret`. Sin cuerpo.
//   Salida:  { ok, reclamados, enviados, fallidos, simulados, sinCerrar }
//
// `verify_jwt = false` en config.toml: lo dispara un cron, que no tiene sesión. La autenticación
// es el secreto compartido, y sin él no se toca la bandeja.
//
// Reclamar y cerrar son dos RPC separadas a propósito: entre una y otra está la llamada a un
// servicio externo, y dejar la transacción abierta mientras tanto bloquearía la fila todo ese
// tiempo. `claim_notification_emails` usa FOR UPDATE SKIP LOCKED, así que dos drenajes
// simultáneos se reparten el trabajo en vez de pelearse.
//
// Son TRES RPC por correo y no dos, porque arrendar no es intentar. El claim arrienda el lote
// entero; `begin_notification_email_attempt` gasta el intento de a una fila, justo antes de
// Graph. Cobrar el intento al reclamar se lo cobraba también a las 49 filas que esperaban turno,
// así que una corrida cortada a mitad de lote les gastaba el presupuesto de reintentos sin
// haberlas mandado nunca.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderizarCorreoNotificacion, TipoSinPlantilla } from "../_shared/plantillas/notificaciones.ts";
import { enviarCorreo } from "../_shared/mail-graph.ts";

/** Cuántos correos toma cada corrida. Graph limita la concurrencia por buzón; se envía en serie. */
const LOTE = 50;
/** Reintentos del cierre ante un corte transitorio entre Graph y PostgREST. */
const INTENTOS_CIERRE = 3;

type FilaBandeja = {
  email_id: string;
  to_email: string;
  to_name: string | null;
  type_key: string;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  attempts: number;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  // De dónde son los enlaces de los correos. Sin esto apuntarían al proyecto de Supabase, que no
  // es una pantalla: el usuario abriría el correo y no llegaría a ninguna parte.
  const FRONTEND_URL = Deno.env.get("FRONTEND_URL");

  if (!SUPABASE_URL || !SERVICE_ROLE || !CRON_SECRET || !FRONTEND_URL) {
    console.error(
      "[send-notification-emails] Falta SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET o FRONTEND_URL.",
    );
    return jsonResponse({ ok: false, code: "INTERNAL_ERROR" }, 500);
  }

  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    console.error("[send-notification-emails] Secreto de cron invalido.");
    return jsonResponse({ ok: false, code: "UNAUTHORIZED" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data, error } = await supabase.rpc("claim_notification_emails", { p_limit: LOTE });
  if (error) {
    console.error("[send-notification-emails] claim_notification_emails fallo:", error.message);
    return jsonResponse({ ok: false, code: "INTERNAL_ERROR" }, 500);
  }

  const filas = (data ?? []) as FilaBandeja[];
  let enviados = 0;
  let simulados = 0;
  let fallidos = 0;
  /** Filas que quedaron en `sending` porque no se pudo escribir su resultado. */
  const sinCerrar: string[] = [];

  /**
   * Graph ya pudo aceptar el correo cuando se llega a esta RPC. Reintentar el cierre evita que
   * un fallo breve de PostgREST deje vencer el arriendo y convierta un envío único en duplicado.
   */
  const cerrarResultado = async (parametros: {
    p_email_id: string;
    p_ok: boolean;
    p_error: string | null;
  }) => {
    let ultimoError: { message: string } | null = null;

    for (let intento = 1; intento <= INTENTOS_CIERRE; intento++) {
      const { error: errorCierre } = await supabase.rpc(
        "mark_notification_email_result",
        parametros,
      );
      if (!errorCierre) return null;

      ultimoError = errorCierre;
      console.error(
        `[send-notification-emails] cierre ${intento}/${INTENTOS_CIERRE} de ${parametros.p_email_id} falló:`,
        errorCierre.message,
      );
    }

    return ultimoError;
  };

  for (const fila of filas) {
    try {
      // El intento se gasta ACÁ y no al reclamar el lote. Reclamar toma hasta 50 filas de una;
      // esto las manda de a una. Si la invocación muere a mitad del lote, las que todavía no
      // llegaron a este punto no gastaron nada y vuelven a la cola enteras al vencer el arriendo.
      const { data: intento, error: errorIntento } = await supabase.rpc(
        "begin_notification_email_attempt",
        { p_email_id: fila.email_id },
      );

      if (errorIntento) {
        // Sin poder anotar el intento no se manda: mandar igual abre la puerta a reintentar sin
        // tope un correo que sale mal cada vez. Queda arrendada y la retoma la corrida siguiente.
        console.error(
          `[send-notification-emails] no se pudo anotar el intento de ${fila.email_id}; se deja para el proximo drenaje:`,
          errorIntento.message,
        );
        sinCerrar.push(fila.email_id);
        continue;
      }

      if (intento === null) {
        // La fila dejo de estar arrendada entre el claim y esto: otra corrida la cerro, o el
        // barrido la dio por perdida. No es nuestra.
        console.warn(`[send-notification-emails] ${fila.email_id} ya no estaba en sending; se saltea.`);
        continue;
      }

      const correo = renderizarCorreoNotificacion({
        typeKey: fila.type_key,
        entityId: fila.entity_id,
        payload: fila.payload,
        urlApp: FRONTEND_URL,
        nombre: fila.to_name,
      });

      const resultado = await enviarCorreo({
        destinatarios: [fila.to_email],
        asunto: correo.asunto,
        cuerpoTexto: correo.cuerpoTexto,
        cuerpoHtml: correo.cuerpoHtml,
        adjuntos: correo.adjuntos,
      });

      const errorCierre = await cerrarResultado({
        p_email_id: fila.email_id,
        p_ok: true,
        p_error: null,
      });

      if (errorCierre) {
        sinCerrar.push(fila.email_id);
        console.error(
          `[send-notification-emails] ${fila.type_key} (${fila.email_id}) se envio pero no se pudo cerrar; puede reenviarse al vencer el arriendo:`,
          errorCierre.message,
        );
        continue;
      }

      if (resultado.estado === "enviado") enviados++;
      else simulados++;
    } catch (error) {
      // Un tipo sin plantilla no se arregla reintentando: se marca con el detalle y sigue el
      // lote. Cortar acá dejaria los 49 correos siguientes esperando cinco minutos por un bug
      // de texto.
      const detalle = error instanceof Error ? error.message : String(error);
      const permanente = error instanceof TipoSinPlantilla;
      console.error(
        `[send-notification-emails] ${fila.type_key} (${fila.email_id}) fallo${permanente ? " (sin plantilla)" : ""}:`,
        detalle,
      );

      const errorCierre = await cerrarResultado({
        p_email_id: fila.email_id,
        p_ok: false,
        p_error: detalle.slice(0, 1000),
      });
      if (errorCierre) {
        // Acá el correo NO salió, así que la fila sin cerrar se recupera sola: al vencer el
        // arriendo vuelve a la cola, que es justo lo que corresponde. Se registra igual para que
        // el conteo de intentos no parezca saltear uno.
        sinCerrar.push(fila.email_id);
        console.error(
          `[send-notification-emails] ${fila.type_key} (${fila.email_id}) fallo y tampoco se pudo registrar el fallo:`,
          errorCierre.message,
        );
      }
      fallidos++;
    }
  }

  const resumen = {
    ok: sinCerrar.length === 0,
    reclamados: filas.length,
    enviados,
    fallidos,
    simulados,
    // Se reporta aparte de `fallidos`: no es lo mismo "no se mandó" que "se mandó y no se pudo
    // anotar". Lo segundo es lo que puede terminar en un correo repetido.
    sinCerrar: sinCerrar.length,
  };
  if (filas.length > 0) {
    console.log("[send-notification-emails]", JSON.stringify(resumen));
  }

  // No informar éxito cuando alguna fila quedó en `sending`: oculta un posible duplicado y
  // hace que cron parezca sano aunque el cierre de la bandeja esté fallando.
  return jsonResponse(resumen, sinCerrar.length > 0 ? 500 : 200);
});
