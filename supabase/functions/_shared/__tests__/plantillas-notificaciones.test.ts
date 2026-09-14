import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  renderizarCorreoNotificacion,
  tiposConPlantilla,
  TipoSinPlantilla,
} from "../plantillas/notificaciones.ts";
import { rutaDeNotificacion, urlAbsoluta } from "../plantillas/rutas.ts";

const URL_APP = "https://ems.ruizmier.com";

const base = (parche: Record<string, unknown> = {}) => ({
  typeKey: "wo.submitted_partner",
  entityId: "wo-1",
  payload: {},
  urlApp: URL_APP,
  nombre: "Ana",
  ...parche,
});

describe("cobertura contra el seed", () => {
  it("todo tipo marcado con correo en el seed tiene plantilla", () => {
    // El seed lo genera el parser desde la matriz: si alguien marca un tipo nuevo con CORREO y
    // no escribe el texto, el drenaje lo descubriria en produccion mandando nada.
    const seed = readFileSync(
      "supabase/migrations/20260911100100_notificaciones_02_seed.sql",
      "utf-8",
    );
    const bloque = seed.slice(
      seed.indexOf("insert into public.notification_types"),
      seed.indexOf("on conflict (type_key)"),
    );

    const marcados = [...bloque.matchAll(/\('([^']+)',[^)]*?,\s*true,\s*true\)/g)].map((m) => m[1]);
    expect(marcados.length).toBe(27);

    const conPlantilla = new Set(tiposConPlantilla());
    const faltantes = marcados.filter((t) => !conPlantilla.has(t));
    expect(faltantes).toEqual([]);
  });

  it("no sobran plantillas para tipos que nadie manda", () => {
    const seed = readFileSync(
      "supabase/migrations/20260911100100_notificaciones_02_seed.sql",
      "utf-8",
    );
    const marcados = new Set(
      [...seed.matchAll(/\('([^']+)',[^)]*?,\s*true,\s*true\)/g)].map((m) => m[1]),
    );
    const sobrantes = tiposConPlantilla().filter((t) => !marcados.has(t));
    expect(sobrantes).toEqual([]);
  });
});

describe("renderizarCorreoNotificacion — eventos", () => {
  it("arma asunto, cuerpo y enlace absoluto a la pantalla del registro", () => {
    const correo = renderizarCorreoNotificacion(base());

    expect(correo.asunto).toBe("Orden de trabajo pendiente de su aprobación");
    expect(correo.cuerpoTexto).toContain("Estimado/a Ana:");
    expect(correo.cuerpoTexto).toContain("https://ems.ruizmier.com/work-orders/wo-1");
    expect(correo.cuerpoHtml).toContain("https://ems.ruizmier.com/work-orders/wo-1");
  });

  it("los identificadores del payload bajan a detalles y no al texto", () => {
    // "Se cerro la solicitud FR-2026-2027 de BOB 1.500" obliga a redactar una frase por tipo.
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "fund.request.closed",
        entityId: "fr-9",
        payload: { request_number: "FR-2026-2027", amount: 1500 },
      }),
    );

    expect(correo.asunto).toBe("Solicitud de fondos cerrada");
    expect(correo.cuerpoTexto).toContain("- Solicitud: FR-2026-2027");
    expect(correo.cuerpoTexto).toContain("- Monto: 1500");
  });

  it("un cambio de rol derivado de la categoria tiene otra redaccion", () => {
    const directo = renderizarCorreoNotificacion(
      base({ typeKey: "auth.role.changed", entityId: null, payload: { staff_id: "s-1" } }),
    );
    const porCategoria = renderizarCorreoNotificacion(
      base({
        typeKey: "auth.role.changed",
        entityId: null,
        payload: { staff_id: "s-1", source: "category" },
      }),
    );

    expect(directo.asunto).toBe("Su rol en EMS cambió");
    expect(porCategoria.asunto).toBe("Su categoría en EMS cambió");
    expect(porCategoria.cuerpoTexto).toContain("/staff/s-1");
  });

  it("sin ruta el correo igual sale, apuntando al inicio", () => {
    // Mejor un enlace generico que no avisar: el hecho ya ocurrio.
    const correo = renderizarCorreoNotificacion(
      base({ typeKey: "fund.request.closed", entityId: null, payload: {} }),
    );
    expect(correo.cuerpoTexto).toContain("https://ems.ruizmier.com");
  });


  it("el envio de boleta arma la semana de dos claves del payload", () => {
    // "Semana: 37" seguido de "Anio: 2026" son dos lineas para un solo dato.
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "timesheet.own_submit_confirmed",
        entityId: "period-1",
        payload: { context: "submitted", week_number: 37, year: 2026 },
      }),
    );

    expect(correo.asunto).toBe("Boleta semanal enviada");
    expect(correo.cuerpoTexto).toContain("- Semana: 37/2026");
    expect(correo.cuerpoTexto).toContain("se le informará por este mismo medio");
  });

  it("el retiro de la boleta usa la variante del mismo tipo", () => {
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "timesheet.own_submit_confirmed",
        entityId: "period-1",
        payload: { context: "withdrawn", week_number: 37, year: 2026 },
      }),
    );

    expect(correo.asunto).toBe("Boleta semanal retirada");
  });

  it("un tipo sin texto falla ruidoso en vez de mandar un correo vacio", () => {
    expect(() => renderizarCorreoNotificacion(base({ typeKey: "client.created" }))).toThrow(
      TipoSinPlantilla,
    );
  });

  it("escapa el payload: lo escriben los usuarios", () => {
    const correo = renderizarCorreoNotificacion(
      base({ typeKey: "fund.request.decided", entityId: "fr-1", payload: { notes: "<script>x</script>" } }),
    );
    expect(correo.cuerpoHtml).not.toContain("<script>");
    expect(correo.cuerpoHtml).toContain("&lt;script&gt;");
  });
});

describe("renderizarCorreoNotificacion — recordatorios", () => {
  it("arma una linea por contador, con singular y plural", () => {
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "timesheet.reminder.daily",
        entityId: null,
        payload: { overdue: { count: 3 }, reverted: { count: 1 } },
      }),
    );

    expect(correo.asunto).toBe("Horas pendientes de registro");
    expect(correo.cuerpoTexto).toContain("- semanas sin registrar: 3");
    expect(correo.cuerpoTexto).toContain("- semana devuelta: 1");
    expect(correo.cuerpoTexto).toContain("https://ems.ruizmier.com/timesheet");
  });

  it("los contadores en cero no aparecen", () => {
    // Un recordatorio que enumera ceros ensena a ignorarlo.
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "fund.reminder.weekly",
        entityId: null,
        payload: {
          revision_gastos: { count: 2 },
          desembolsos: { count: 0 },
          liquidaciones: { count: 0 },
          cierres: { count: 0 },
        },
      }),
    );

    expect(correo.cuerpoTexto).toContain("- gastos por revisar: 2");
    expect(correo.cuerpoTexto).not.toContain("por desembolsar");
    expect(correo.cuerpoTexto).not.toContain("por liquidar");
  });

  it("los cuatro recordatorios rinden", () => {
    for (const tipo of [
      "timesheet.reminder.daily",
      "approval.reminder.weekly",
      "fund.reminder.weekly",
      "wo.installment.reminder.weekly",
    ]) {
      const correo = renderizarCorreoNotificacion(base({ typeKey: tipo, entityId: null }));
      expect(correo.asunto.length).toBeGreaterThan(0);
      expect(correo.cuerpoHtml).toContain("<a href=");
    }
  });
});

describe("rutas", () => {
  it("un gasto lleva a la pantalla de gastos de SU solicitud", () => {
    // entity_id es el fre_id, que no es parametro de ninguna ruta.
    const ruta = rutaDeNotificacion({
      typeKey: "fund.expense.returned_no_support",
      entityId: "fre-1",
      payload: { fund_request_id: "fr-7" },
    });
    expect(ruta).toBe("/fund-requests/fr-7/expenses");
  });

  it("el consolidado se emite sobre la solicitud, no sobre un gasto", () => {
    const ruta = rutaDeNotificacion({
      typeKey: "fund.expenses.all_reviewed",
      entityId: "fr-7",
      payload: {},
    });
    expect(ruta).toBe("/fund-requests/fr-7/expenses");
  });

  it("urlAbsoluta no duplica la barra", () => {
    expect(urlAbsoluta("https://ems.ruizmier.com/", "/timesheet")).toBe(
      "https://ems.ruizmier.com/timesheet",
    );
  });
});
