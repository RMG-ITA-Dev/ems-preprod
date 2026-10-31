// Qué pantalla muestra /auth según el ajuste AUTH_MODE de global_settings
// (docs/plan-entra-id-consolidado.md, V3).
//
// La regla es que un error nunca habilite un método de ingreso que el admin no eligió:
//   - clave ausente  -> "password". Es la pantalla de siempre, y lo que ve un proyecto que todavía
//                       no recibió el seed (bugs/entra-id/01_auth_mode.sql).
//   - valor inválido -> "invalid". No se adivina; la base ya rechaza cualquier otro valor
//                       (guard_auth_lockout_settings), así que llegar acá es un problema a arreglar.
//   - lectura fallida -> "error". Pantalla de reintento, no el formulario de contraseña.
//
// /login-rm no pasa por acá: muestra siempre la pantalla de contraseña.

export const AUTH_MODE_SETTING_KEY = "AUTH_MODE";

export const AUTH_MODES = ["password", "entra"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

export type AuthModeState = AuthMode | "loading" | "invalid" | "error";

interface SettingRow {
  setting_key: string;
  setting_value: string | null;
}

export interface OAuthReturnError {
  code: string;
  description: string;
}

// Error con el que Supabase devuelve a /auth cuando el ingreso con Microsoft no termina: la
// persona canceló, falta el consentimiento del admin en Entra (AADSTS65001), no tiene la app
// asignada (AADSTS50105), etc. Llega en la query (`?error=...`) o en el fragmento
// (`#error=...`) según el paso que falló, así que se miran los dos.
export function readOAuthReturnError(search: string, hash: string): OAuthReturnError | null {
  for (const raw of [search, hash]) {
    const params = new URLSearchParams(raw.replace(/^[?#]/, ""));
    const code = params.get("error");
    if (code) {
      return { code, description: params.get("error_description") ?? "" };
    }
  }
  return null;
}

export function isAuthMode(value: unknown): value is AuthMode {
  return typeof value === "string" && (AUTH_MODES as readonly string[]).includes(value);
}

export function resolveAuthMode(
  settings: SettingRow[] | undefined,
  { isLoading = false, isError = false }: { isLoading?: boolean; isError?: boolean } = {},
): AuthModeState {
  if (isError) return "error";
  if (isLoading || !settings) return "loading";
  const row = settings.find((s) => s.setting_key === AUTH_MODE_SETTING_KEY);
  if (!row) return "password";
  return isAuthMode(row.setting_value) ? row.setting_value : "invalid";
}
