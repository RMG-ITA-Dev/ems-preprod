// Nombre e iniciales de la cuenta cuando NO hay ficha de staff (el admin de bootstrap, o una
// sesión que ProtectedRoute está por rechazar). Con ficha, el header y el menú móvil usan la ficha.
//
// El registro con contraseña guarda `first_name` / `last_name` en user_metadata (register-user).
// El ingreso con Microsoft no: Supabase guarda lo que manda Entra, `full_name` y `name`.

type Metadata = Record<string, unknown> | null | undefined;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function accountDisplayName(metadata: Metadata): string | null {
  const first = text(metadata?.first_name);
  if (first) return `${first} ${text(metadata?.last_name)}`.trim();
  return text(metadata?.full_name) || text(metadata?.name) || null;
}

export function accountInitials(metadata: Metadata, email: string | null | undefined): string {
  const first = text(metadata?.first_name);
  const last = text(metadata?.last_name);
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();

  const words = (text(metadata?.full_name) || text(metadata?.name)).split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();

  return email?.substring(0, 2).toUpperCase() || "U";
}
