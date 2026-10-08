// supabase/functions/_shared/plantillas/constants/cuenta.ts

/**
 * Textos de los correos de cuenta: alta, recuperación, desbloqueo y cuenta ya existente.
 *
 * Sólo texto. El armado del mensaje vive en `../cuenta.ts` y la envoltura en `../layout.ts`.
 */

import type { Copia } from "../layout.ts";

/** Los `email_action_type` que GoTrue emite y este proyecto sabe renderizar. */
export type TipoAccionCorreo =
  | "signup"
  | "recovery"
  | "invite"
  | "magiclink"
  | "email_change";

export const TIPOS_SOPORTADOS: TipoAccionCorreo[] = [
  "signup",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
];

export const TEXTOS_CUENTA: Record<TipoAccionCorreo, Copia> = {
  signup: {
    asunto: "Confirme su cuenta",
    intro: "Se creó una cuenta con este correo. Confírmela para activarla.",
    boton: "Confirmar cuenta",
    cierre: "Si no creó esta cuenta, ignore este mensaje: sin confirmar, no se activa.",
  },
  recovery: {
    asunto: "Restablezca su contraseña",
    intro: "Solicitó restablecer su contraseña. Defina una nueva desde el siguiente enlace.",
    boton: "Definir contraseña",
    cierre: "Si no lo solicitó, ignore este mensaje: su contraseña actual sigue vigente.",
  },
  invite: {
    asunto: "Acepte su invitación",
    intro: "Le crearon una cuenta en el sistema. Acepte la invitación y defina su contraseña.",
    boton: "Aceptar invitación",
    cierre: "Si considera que es un error, consulte con quien lo invitó antes de usar el enlace.",
  },
  magiclink: {
    asunto: "Su enlace de acceso",
    intro: "Solicitó ingresar con un enlace de acceso.",
    boton: "Ingresar",
    cierre: "Si no lo solicitó, ignore este mensaje.",
  },
  email_change: {
    asunto: "Confirme su correo nuevo",
    intro: "Solicitó cambiar el correo de su cuenta. Confirme la dirección nueva.",
    boton: "Confirmar correo",
    cierre: "Si no lo solicitó, informe al área de Seguridad TI.",
  },
};

/**
 * Desbloqueo manual por un administrador. Para GoTrue es el mismo `recovery` que "olvidé mi
 * contraseña", pero el usuario no pidió nada: el texto tiene que decirlo.
 */
export const TEXTO_DESBLOQUEO: Copia = {
  asunto: "Su cuenta fue desbloqueada",
  intro:
    "Un administrador desbloqueó su cuenta. Defina una contraseña nueva para volver a ingresar.",
  boton: "Definir contraseña",
  cierre: "Si no solicitó el desbloqueo, informe al área de Seguridad TI antes de usar el enlace.",
};

/**
 * Alguien intentó registrarse con un correo que ya tiene cuenta.
 *
 * El formulario responde igual exista o no la cuenta —distinguirlo lo convertiría en un detector
 * de usuarios—, así que la diferencia viaja por correo, que sólo lee el titular de la casilla.
 */
export const TEXTO_CUENTA_EXISTENTE: Copia = {
  asunto: "Ya existe una cuenta con este correo",
  intro:
    "Se intentó crear una cuenta con esta dirección y ya existe una. Ingrese con su contraseña o restablézcala.",
  boton: "Ir a EMS",
  cierre: "Si no fue usted, ignore este mensaje: no se creó ninguna cuenta.",
};
