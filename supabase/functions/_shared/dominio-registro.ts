// supabase/functions/_shared/dominio-registro.ts

/**
 * El límite del alta pública: qué dominio de correo puede registrarse.
 *
 * Vive acá y no dentro de `register-user/index.ts` por el mismo motivo que `mail-config.ts`: ese
 * archivo importa el cliente de Supabase por URL y vitest no lo puede cargar. Sacar la decisión a
 * una función pura la deja probada, que es lo que corresponde para el borde de un endpoint que
 * cualquiera puede llamar desde internet (`verify_jwt = false` en config.toml).
 *
 * POR QUÉ "SIN CONFIGURAR" NO ES "SIN RESTRICCIÓN". `register-user` ya fallaba cerrado cuando la
 * consulta a `global_settings` devolvía error, con el argumento correcto escrito al lado: tratar
 * un fallo de lectura como "sin restricción" deja crear cuentas desde cualquier dominio. Pero la
 * fila AUSENTE o VACÍA caía en un `if (dominio && ...)` que simplemente no evaluaba nada, o sea
 * que el mismo límite fallaba cerrado ante un error y abierto ante una ausencia.
 *
 * No es una configuración soportada, tampoco: el seed pone 'ruizmier.com' (cero_16) y la pantalla
 * de Ajustes no puede guardar un valor vacío — `if (allowedEmailDomain)` descarta la cadena vacía
 * antes de persistir (Settings.tsx). Un ajuste vacío sólo aparece si alguien lo borró por fuera de
 * la aplicación, que es exactamente el caso en el que NO hay que abrir el registro al mundo.
 *
 * OJO, ESTO NO ES EL ÚNICO GUARDIÁN Y LOS DOS NO COINCIDEN. El trigger `validate_email_domain()`
 * (cero_02) hace lo contrario ante un ajuste vacío: `IF allowed_domain IS NULL OR allowed_domain =
 * '' THEN RETURN NEW`, con el comentario "allow all domains". Esa semántica es anterior a todo
 * esto y cubre TAMBIÉN las altas que hace un admin autenticado, donde "sin restricción" puede ser
 * lo querido. Acá el modelo de amenaza es otro —un formulario abierto a internet— y por eso el
 * borde público es más estricto. Unificarlos es una decisión de producto aparte.
 */

/**
 * `DOMAIN_NOT_CONFIGURED` es un problema del SERVIDOR y no de quien escribe el correo, así que
 * quien llama lo traduce a INTERNAL_ERROR (500) y no a INVALID_DOMAIN (400): decirle "tu dominio
 * no vale" a alguien cuya dirección estaba bien manda a esa persona a revisar lo que no falla.
 */
export type VeredictoDominio =
  | { ok: true }
  | { ok: false; code: "DOMAIN_NOT_CONFIGURED" | "INVALID_DOMAIN" };

/**
 * Decide si `email` puede registrarse, dado el valor crudo de `ALLOWED_EMAIL_DOMAIN` tal como
 * salió de `global_settings` (null si la fila no existe).
 */
export function verificarDominioDeRegistro(
  email: string,
  ajuste: string | null | undefined,
): VeredictoDominio {
  const dominio = (ajuste ?? "").trim().toLowerCase();
  if (!dominio) return { ok: false, code: "DOMAIN_NOT_CONFIGURED" };

  // Se compara el dominio COMPLETO y no un sufijo: `endsWith("@" + dominio)` sobre
  // "alguien@noruizmier.com" con dominio "ruizmier.com" da false —el "@" lo impide— pero
  // "alguien@mail.ruizmier.com" también daría false, y un subdominio es otra organización.
  // Partir por "@" y comparar exacto dice lo mismo sin depender de esa sutileza.
  const suyo = email.trim().toLowerCase().split("@")[1] ?? "";
  if (suyo !== dominio) return { ok: false, code: "INVALID_DOMAIN" };

  return { ok: true };
}
