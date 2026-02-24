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

    // 8. Delete the auth user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      // User might already be deleted
      await supabaseAdmin.from("user_lifecycle_audit_log").insert({
        actor_user_id: caller.id,
        target_user_id: userId,
        action: "account_delete_idempotent",
        metadata: { error: deleteError.message },
      });
      return new Response(
        JSON.stringify({ success: true, code: "ALREADY_DELETED", message: "User may already be deleted" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. Delete user_roles row
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);

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
