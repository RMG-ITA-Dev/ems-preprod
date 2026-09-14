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
//   Salida:  { reclamados, enviados, fallidos, simulados }
//
// `verify_jwt = false` en config.toml: lo dispara un cron, que no tiene sesión. La autenticación
// es el secreto compartido, y sin él no se toca la bandeja.
//
// Reclamar y cerrar son dos RPC separadas a propósito: entre una y otra está la llamada a un
// servicio externo, y dejar la transacción abierta mientras tanto bloquearía la fila todo ese
// tiempo. `claim_notification_emails` usa FOR UPDATE SKIP LOCKED, así que dos drenajes
// simultáneos se reparten el trabajo en vez de pelearse.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderizarCorreoNotificacion, TipoSinPlantilla } from "../_shared/plantillas/notificaciones.ts";
import { enviarCorreo } from "../_shared/mail-graph.ts";

/** Cuántos correos toma cada corrida. Graph limita la concurrencia por buzón; se envía en serie. */
const LOTE = 50;

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

  for (const fila of filas) {
    try {
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
      });

      await supabase.rpc("mark_notification_email_result", {
        p_email_id: fila.email_id,
        p_ok: true,
        p_error: null,
      });

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

      await supabase.rpc("mark_notification_email_result", {
        p_email_id: fila.email_id,
        p_ok: false,
        p_error: detalle.slice(0, 1000),
      });
      fallidos++;
    }
  }

  const resumen = { reclamados: filas.length, enviados, fallidos, simulados };
  if (filas.length > 0) {
    console.log("[send-notification-emails]", JSON.stringify(resumen));
  }

  return jsonResponse(resumen);
});
