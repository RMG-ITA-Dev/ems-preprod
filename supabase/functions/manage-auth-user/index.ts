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

    // 8. Quitar el rol ANTES de borrar la cuenta, y no después.
    //
    // `user_roles.user_id` tiene ON DELETE CASCADE contra `auth.users`, así que borrar primero
    // la cuenta se llevaba la fila por cascade — y el trigger que avisa a Seguridad TI corría
    // adentro de ese cascade, con `auth.users` ya borrada. El correo es el único identificador
    // que le queda a ese aviso (una cuenta con ficha de staff no se puede borrar, ver el paso 7),
    // así que el mensaje salía como "Se eliminó la cuenta " y nadie podía saber cuál.
    //
    // Con la fila borrada acá, el trigger lee `auth.users` viva y el aviso sale con la dirección.
    // El cascade posterior ya no encuentra nada, así que el aviso tampoco se duplica.
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
      // El aviso a Seguridad TI sale sin dirección porque la cuenta de auth ya no estaba. No
      // corta el borrado —queda la fila huérfana de user_roles por limpiar igual— pero conviene
      // que el log diga por qué ese aviso salió incompleto.
      console.warn(`[manage-auth-user] ${userId} no tenia cuenta en auth; el aviso de baja sale sin correo.`);
    }

    // 9. Delete the auth user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      // Dos cosas distintas llegan acá y el paso 8 obliga a separarlas.
      //
      //   * La cuenta ya no estaba: el borrado es idempotente, la baja es real y lo que hizo el
      //     paso 8 fue limpiar una fila huérfana. Es el caso que este bloque siempre asumió.
      //   * El borrado falló por algo transitorio: la cuenta sigue viva, y sin el rol que el
      //     paso 8 ya le quitó. Antes ese estado era imposible —la fila sólo se iba por el
      //     CASCADE, o sea sólo si la cuenta se había borrado— así que hay que reponerla, o el
      //     fallo de GoTrue deja a alguien adentro sin ver nada.
      //
      // `abort_account_deletion` distingue los dos mirando `auth.users`, y lo hace en la misma
      // transacción en la que repone: preguntar acá y reponer después dejaría la ventana abierta.
      const { data: reposicion, error: errorReposicion } = await supabaseAdmin.rpc(
        "abort_account_deletion",
        { p_user_id: userId, p_rol: (preparacion as { rol?: unknown } | null)?.rol ?? null },
      );

      const reposicionRpc = reposicion as { ok?: boolean; reason?: string } | null;
      const repuesto = !errorReposicion && reposicionRpc?.ok === true;

      // "Ya estaba borrada" es una AFIRMACIÓN, no un default. La única lectura que la respalda es
      // que la RPC haya mirado `auth.users` y no haya encontrado la cuenta; cualquier otra cosa
      // —la RPC no respondió, o se negó por otro motivo— deja el estado sin saber, y ahí no se
      // puede decir que el borrado salió bien: la cuenta puede seguir viva y sin rol.
      const borradoReal = !errorReposicion &&
        reposicionRpc?.ok === false &&
        reposicionRpc?.reason === "NO_AUTH_USER";

      if (errorReposicion) {
        console.error(
          `[manage-auth-user] no se pudo reponer el rol de ${userId} tras fallar el borrado:`,
          errorReposicion.message,
        );
      }

      await supabaseAdmin.from("user_lifecycle_audit_log").insert({
        actor_user_id: caller.id,
        target_user_id: userId,
        action: borradoReal
          ? "account_delete_idempotent"
          : repuesto
            ? "account_delete_aborted"
            : "account_delete_unresolved",
        metadata: {
          error: deleteError.message,
          ...(errorReposicion ? { rollback_error: errorReposicion.message } : {}),
          ...(reposicionRpc?.reason ? { rollback_reason: reposicionRpc.reason } : {}),
        },
      });

      if (borradoReal) {
        return new Response(
          JSON.stringify({ success: true, code: "ALREADY_DELETED", message: "User may already be deleted" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (repuesto) {
        // La cuenta sigue existiendo y volvió a su estado anterior: no se borró nada, así que
        // decir que sí sería mentir. El aviso de baja a Seguridad TI también se retiró.
        console.error(`[manage-auth-user] deleteUser fallo para ${userId}; se repuso el rol.`);
        return new Response(
          JSON.stringify({ success: false, code: "DELETE_FAILED", message: deleteError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Ni borrada ni repuesta. Es el único camino que deja el problema en pie, así que va con
      // el id: si la cuenta sigue viva, destrabarla necesita que un admin le reasigne el rol.
      console.error(
        `[manage-auth-user] ${userId} quedo en estado indeterminado: el borrado fallo y no se pudo confirmar ni deshacer.`,
      );
      return new Response(
        JSON.stringify({
          success: false,
          code: "DELETE_INCONSISTENT",
          message: "Deletion failed and could not be rolled back; the account may be left without a role",
        }),
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
