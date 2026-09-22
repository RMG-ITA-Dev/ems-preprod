// supabase/functions/_shared/plantillas/cuenta.ts

/**
 * Arma los correos de cuenta: alta, recuperación, desbloqueo y cuenta ya existente.
 *
 * Los emiten `register-user`, `request-password-reset`, `unlock-account` y el Send Email Hook. Los
 * cuatro pasan por acá, así que el mismo hecho produce el mismo mensaje venga de donde venga.
 *
 * El enlace apunta a `/auth/v1/verify` del propio proyecto, no a la aplicación: GoTrue valida el
 * `token_hash`, crea la sesión y recién entonces redirige a `redirect_to`. Ese paso intermedio no
 * se puede saltear armando una URL directa a la pantalla.
 *
 * TypeScript puro, sin APIs de Deno ni imports por URL: vitest importa este archivo tal cual.
 */

import { renderizar, type CorreoRenderizado } from "./layout.ts";
import {
  TEXTOS_CUENTA,
  TEXTO_CUENTA_EXISTENTE,
  TEXTO_DESBLOQUEO,
  TIPOS_SOPORTADOS,
  type TipoAccionCorreo,
} from "./constants/cuenta.ts";

export type { TipoAccionCorreo };
export type { CorreoRenderizado };

export type DatosCorreoAuth = {
  tipo: string;
  tokenHash: string;
  redirectTo: string;
  siteUrl: string;
  supabaseUrl: string;
  email: string;
  nombre?: string | null;
};

export class TipoCorreoNoSoportado extends Error {
  constructor(tipo: string) {
    super(`El tipo de correo de cuenta "${tipo}" no tiene plantilla.`);
    this.name = "TipoCorreoNoSoportado";
  }
}

export function esTipoSoportado(tipo: string): tipo is TipoAccionCorreo {
  return (TIPOS_SOPORTADOS as string[]).includes(tipo);
}

/**
 * `${supabaseUrl}/auth/v1/verify?token=<token_hash>&type=<tipo>&redirect_to=<destino>`.
 *
 * `redirect_to` viaja codificado porque la aplicación lo manda con query propia
 * (`/reset-password?reason=admin_unlock`), y sin codificar ese `?` partiría la URL de verify.
 */
export function construirEnlaceVerificacion(datos: DatosCorreoAuth): string {
  const destino = datos.redirectTo?.trim() || datos.siteUrl;
  const base = datos.supabaseUrl.replace(/\/+$/, "");
  const parametros = new URLSearchParams({
    token: datos.tokenHash,
    type: datos.tipo,
    redirect_to: destino,
  });
  return `${base}/auth/v1/verify?${parametros.toString()}`;
}

/** Desbloqueo manual por un administrador: `unlock-account` manda `?reason=admin_unlock`. */
export function esDesbloqueoAdministrativo(datos: DatosCorreoAuth): boolean {
  return datos.tipo === "recovery" && /[?&]reason=admin_unlock\b/.test(datos.redirectTo ?? "");
}

export function renderizarCorreoAuth(datos: DatosCorreoAuth): CorreoRenderizado {
  if (!esTipoSoportado(datos.tipo)) {
    throw new TipoCorreoNoSoportado(datos.tipo);
  }
  if (!datos.tokenHash?.trim()) {
    throw new Error("El correo de cuenta no puede armarse sin token_hash.");
  }

  const copia = esDesbloqueoAdministrativo(datos)
    ? TEXTO_DESBLOQUEO
    : TEXTOS_CUENTA[datos.tipo as TipoAccionCorreo];

  return renderizar(copia, construirEnlaceVerificacion(datos), {
    nombre: datos.nombre,
    mencionarVencimiento: true,
  });
}

/**
 * Correo para quien intenta registrarse con un correo que ya tiene cuenta. No lleva token: no hay
 * nada que confirmar, sólo ingresar o restablecer la contraseña.
 */
export function renderizarCorreoCuentaExistente(datos: {
  urlApp: string;
  nombre?: string | null;
}): CorreoRenderizado {
  return renderizar(TEXTO_CUENTA_EXISTENTE, datos.urlApp, { nombre: datos.nombre });
}
