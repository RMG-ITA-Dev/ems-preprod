import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, code: "UNAUTHORIZED", message: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // 2. Service role client for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 3. Resolve caller
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ success: false, code: "UNAUTHORIZED", message: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Admin check
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!roleData || roleData.role !== "admin") {
      return new Response(
        JSON.stringify({ success: false, code: "NOT_ADMIN", message: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Parse body
    const body = await req.json();
    const { action, userId } = body;

    if (action !== "delete" || !userId) {
      return new Response(
        JSON.stringify({ success: false, code: "INVALID_REQUEST", message: "Invalid action or missing userId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Self-delete guard
    if (caller.id === userId) {
      return new Response(
        JSON.stringify({ success: false, code: "SELF_DELETE", message: "Cannot delete your own account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Orphan guard - check if user has active staff record
    const { data: staffRecord } = await supabaseAdmin
      .from("staff")
      .select("staff_id")
      .eq("auth_user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (staffRecord) {
      return new Response(
        JSON.stringify({ success: false, code: "LINKED_USER", message: "Cannot delete user with linked staff record" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Guardar el correo ANTES de borrar la cuenta.
    //
    // `user_roles.user_id` tiene ON DELETE CASCADE contra `auth.users`, así que el trigger que
    // avisa a Seguridad TI corre DENTRO del cascade, con `auth.users` ya borrada: no puede leer
    // el correo, que es el único identificador que le queda al aviso (una cuenta con ficha de
    // staff no se puede borrar, ver el paso 7). El mensaje salía como "Se eliminó la cuenta ".
    //
    // Esta RPC copia el correo a `user_roles.deletion_email` para que el trigger lo encuentre en
    // `OLD` cuando el cascade se lleve la fila. NO borra ni anuncia nada: el aviso lo dispara el
    // borrado real del paso 9.
    //
    // Que no borre es deliberado y es lo que hace seguro este punto del flujo. La versión
    // anterior sí borraba la fila acá —y con eso emitía el aviso— antes del `await` externo, o
    // sea COMMITEANDO una baja que todavía no había ocurrido. Una invocación interrumpida entre
    // las dos llamadas (timeout, redeploy, caída) no devuelve error, así que la reposición de
    // abajo nunca corría: quedaba una cuenta viva sin rol y una alarma falsa en el canal de
    // Seguridad TI, para siempre y en silencio. Ahora ese estado no existe.
    const { data: preparacion, error: errorPreparacion } = await supabaseAdmin.rpc(
      "prepare_account_deletion",
      { p_user_id: userId },
    );

    if (errorPreparacion) {
      return new Response(
        JSON.stringify({ success: false, code: "INTERNAL_ERROR", message: errorPreparacion.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // La guarda de la RPC. No debería dispararse —el paso 7 ya la cubre— pero si se dispara hay
    // una cuenta en uso de por medio y el borrado no sigue.
    if (preparacion && (preparacion as { ok?: boolean }).ok === false) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "LINKED_USER",
          message: `Cannot delete user: ${(preparacion as { reason?: string }).reason}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (preparacion && (preparacion as { con_correo?: boolean }).con_correo === false) {
      // El aviso a Seguridad TI va a salir sin dirección porque la cuenta de auth ya no estaba.
      // No corta el borrado —la fila huérfana de user_roles hay que limpiarla igual— pero conviene
      // que el log diga por qué ese aviso salió incompleto.
      console.warn(`[manage-auth-user] ${userId} no tenia cuenta en auth; el aviso de baja sale sin correo.`);
    }

    // 9. Delete the auth user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      // El paso 8 no destruyó nada, así que acá no hay que reponer: la fila de `user_roles` sigue
      // intacta y nadie anunció una baja. Sólo queda limpiar la marca, que sin borrado no describe
      // nada — y si la limpieza falla tampoco pasa nada grave: la marca no la lee nadie fuera del
      // DELETE, y un borrado posterior la sobrescribe.
      const { error: errorLimpieza } = await supabaseAdmin.rpc(
        "clear_account_deletion_mark",
        { p_user_id: userId },
      );

      if (errorLimpieza) {
        console.warn(
          `[manage-auth-user] no se pudo limpiar la marca de baja de ${userId}:`,
          errorLimpieza.message,
        );
      }

      // "Ya estaba borrada" es una AFIRMACIÓN, no un default, y la respalda una lectura hecha
      // ANTES de intentar el borrado: `existe_auth` dice si la cuenta seguía en `auth.users`.
      // `false` -> el borrado es idempotente y la baja es real. `true` -> el borrado falló de
      // verdad. `null` -> no se pudo mirar, y entonces no se afirma nada.
      const yaNoEstaba = (preparacion as { existe_auth?: boolean | null } | null)
        ?.existe_auth === false;

      await supabaseAdmin.from("user_lifecycle_audit_log").insert({
        actor_user_id: caller.id,
        target_user_id: userId,
        action: yaNoEstaba ? "account_delete_idempotent" : "account_delete_failed",
        metadata: {
          error: deleteError.message,
          ...(errorLimpieza ? { cleanup_error: errorLimpieza.message } : {}),
        },
      });

      if (yaNoEstaba) {
        return new Response(
          JSON.stringify({ success: true, code: "ALREADY_DELETED", message: "User may already be deleted" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // La cuenta sigue existiendo y CON su rol: no se borró nada, así que decir que sí sería
      // mentir. A diferencia de la versión anterior, acá no hay un tercer caso "indeterminado":
      // como el paso 8 no destruye, no hay nada que pueda quedar a medias.
      console.error(`[manage-auth-user] deleteUser fallo para ${userId}; la cuenta queda intacta.`);
      return new Response(
        JSON.stringify({ success: false, code: "DELETE_FAILED", message: deleteError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 10. Audit
    await supabaseAdmin.from("user_lifecycle_audit_log").insert({
      actor_user_id: caller.id,
      target_user_id: userId,
      action: "account_deleted",
      metadata: {},
    });

    return new Response(
      JSON.stringify({ success: true, code: "DELETED", message: "User account deleted" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, code: "INTERNAL_ERROR", message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
