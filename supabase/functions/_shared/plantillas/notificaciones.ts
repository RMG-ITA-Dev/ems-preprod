// supabase/functions/_shared/plantillas/notificaciones.ts

/**
 * Arma el correo de un tipo del catálogo: los 22 por suceso y los 4 recordatorios (D-44).
 *
 * Lo consume el drenaje de la bandeja de salida (`send-notification-emails`), que sólo pasa la
 * fila tal como la dejó `notify_staff()` y despacha el resultado.
 *
 * TypeScript puro, sin APIs de Deno ni imports por URL: vitest importa este archivo tal cual.
 */

import { renderizar, type Copia, type CorreoRenderizado } from "./layout.ts";
import { DETALLES_PAYLOAD, TEXTOS_NOTIFICACION } from "./constants/notificaciones.ts";
import {
  destinoDeRecordatorio,
  TEXTOS_RECORDATORIO,
  type CopiaRecordatorio,
} from "./constants/recordatorios.ts";
import { rutaDeNotificacion, urlAbsoluta } from "./rutas.ts";

export class TipoSinPlantilla extends Error {
  constructor(typeKey: string) {
    super(`El tipo "${typeKey}" no tiene plantilla de correo.`);
    this.name = "TipoSinPlantilla";
  }
}

export type DatosNotificacion = {
  typeKey: string;
  entityId?: string | null;
  payload?: Record<string, unknown> | null;
  /** Origen de la aplicación: https://ems.ruizmier.com, http://localhost:8080… */
  urlApp: string;
  nombre?: string | null;
};

/** Todos los tipos que este módulo sabe renderizar. Lo usa el test de cobertura contra el seed. */
export function tiposConPlantilla(): string[] {
  return [
    ...Object.keys(TEXTOS_NOTIFICACION).filter((k) => !k.includes(":")),
    ...Object.keys(TEXTOS_RECORDATORIO),
  ];
}

function esRecordatorio(typeKey: string): boolean {
  return typeKey in TEXTOS_RECORDATORIO;
}

function conteo(payload: Record<string, unknown>, clave: string): number {
  const bloque = payload[clave];
  if (!bloque || typeof bloque !== "object") return 0;
  const valor = (bloque as Record<string, unknown>).count;
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) && numero > 0 ? Math.trunc(numero) : 0;
}

/** Las líneas de un recordatorio: un concepto por contador, salteando los que están en cero. */
function detallesDeRecordatorio(
  copia: CopiaRecordatorio,
  payload: Record<string, unknown>,
): { etiqueta: string; valor: string }[] {
  return copia.conceptos
    .map((concepto) => ({ concepto, total: conteo(payload, concepto.clave) }))
    .filter(({ total }) => total > 0)
    .map(({ concepto, total }) => ({
      etiqueta: total === 1 ? concepto.singular : concepto.plural,
      valor: String(total),
    }));
}

/** Las líneas de un evento: las claves del payload que existan, en el orden declarado. */
function detallesDeEvento(payload: Record<string, unknown>): { etiqueta: string; valor: string }[] {
  const salida: { etiqueta: string; valor: string }[] = [];

  // La semana se compone: el payload trae `week_number` y `year` por separado, y "Semana: 37"
  // seguido de "Año: 2026" son dos líneas para un solo dato.
  const semana = payload.week_number;
  const anio = payload.year;
  if (semana !== undefined && semana !== null && anio !== undefined && anio !== null) {
    payload = { ...payload, semana: `${semana}/${anio}` };
  }
  for (const { clave, etiqueta } of DETALLES_PAYLOAD) {
    const valor = payload[clave];
    if (valor === null || valor === undefined) continue;
    const texto = typeof valor === "string" ? valor.trim() : String(valor);
    if (!texto) continue;
    salida.push({ etiqueta, valor: texto });
  }
  return salida;
}

/**
 * Un mismo tipo puede tener varias redacciones, porque el hecho se lee distinto según la variante:
 * el cambio de rol directo o derivado de la categoría (`payload.source`), el envío o el retiro de
 * la boleta (`payload.context`). Es la misma idea que usa el panel con el `context` de i18next, y
 * evita partir un tipo en dos sólo para cambiar una frase.
 *
 * Se prueban las variantes y se cae al texto base, que siempre existe.
 */
function copiaDeEvento(typeKey: string, payload: Record<string, unknown>): Copia {
  for (const clave of ["context", "source"]) {
    const variante = payload[clave];
    if (typeof variante === "string" && variante) {
      const copia = TEXTOS_NOTIFICACION[`${typeKey}:${variante}`];
      if (copia) return copia;
    }
  }
  const copia = TEXTOS_NOTIFICACION[typeKey];
  if (!copia) throw new TipoSinPlantilla(typeKey);
  return copia;
}

export function renderizarCorreoNotificacion(datos: DatosNotificacion): CorreoRenderizado {
  const payload = datos.payload ?? {};
  const enlace = urlAbsoluta(
    datos.urlApp,
    rutaDeNotificacion({ typeKey: datos.typeKey, entityId: datos.entityId, payload }),
  );

  if (esRecordatorio(datos.typeKey)) {
    const copia = TEXTOS_RECORDATORIO[datos.typeKey];
    // El botón tiene que nombrar la pantalla a la que lleva, y esa pantalla puede cambiar según
    // los contadores del destinatario: "Ir a aprobaciones" sobre un enlace a la hoja de tiempo
    // propia es la misma mentira que el enlace roto, sólo que más difícil de notar.
    const destino = destinoDeRecordatorio(datos.typeKey, payload);
    return renderizar(destino ? { ...copia, boton: destino.boton, intro: destino.intro } : copia, enlace, {
      nombre: datos.nombre,
      detalles: detallesDeRecordatorio(copia, payload),
    });
  }

  return renderizar(copiaDeEvento(datos.typeKey, payload), enlace, {
    nombre: datos.nombre,
    detalles: detallesDeEvento(payload),
  });
}
