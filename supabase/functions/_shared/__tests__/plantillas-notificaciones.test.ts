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
    expect(marcados.length).toBe(28);

    const conPlantilla = new Set(tiposConPlantilla());
    const faltantes = marcados.filter((t) => !conPlantilla.has(t));
    expect(faltantes).toEqual([]);
  });

  it("todo tipo marcado con correo en el seed llega a una pantalla", () => {
    // El hermano del de arriba, para la OTRA mitad del correo: tener plantilla no sirve si el
    // boton lleva a la portada.
    //
    // Hace falta un test y no alcanza con mirar la app porque los dos ruteadores despachan por
    // criterios DISTINTOS sobre los mismos datos: `notificationRoute()` por `module_key` y este
    // por prefijo del `type_key`. "Esta cubierto en la app" no implica "esta cubierto aca", y asi
    // se colo `timesheet.own_submit_confirmed`: mandaba correo con el boton "Ver mi hoja de
    // tiempo" y rutaDeNotificacion() no tenia ninguna rama `timesheet.`, asi que caia en el
    // `return null` del final y urlAbsoluta() lo mandaba al inicio de la aplicacion.
    const seed = readFileSync(
      "supabase/migrations/20260911100100_notificaciones_02_seed.sql",
      "utf-8",
    );
    const marcados = [...seed.matchAll(/\('([^']+)',[^)]*?,\s*true,\s*true\)/g)].map((m) => m[1]);
    expect(marcados.length).toBe(28);

    // Un payload con todo lo que las ramas pueden necesitar: los gastos rutean por
    // `fund_request_id` y los eventos de cuenta por `staff_id`, porque su entity_id no es
    // parametro de ninguna ruta. Sin `sin_ruta`, que es la unica forma legitima de no tener
    // destino y depende del destinatario, no del tipo.
    const sinRuta = marcados.filter(
      (typeKey) =>
        rutaDeNotificacion({
          typeKey,
          entityId: "entidad-1",
          payload: { fund_request_id: "fr-1", staff_id: "staff-1" },
        }) === null,
    );

    // La lista es CERRADA y esta es la unica excepcion: `engagement.specialist_assigned` sale
    // sin destino a proposito, porque `list_portfolio_engagements()` (BUG 0828-185) no reconoce
    // al especialista y la ficha del encargo le queda cerrada al destinatario. Anotarla aca en
    // vez de aflojar el test a "puede haber nulls" es lo que mantiene el valor del hermano: un
    // tipo nuevo que se quede sin rama sigue reventando.
    expect(sinRuta).toEqual(["engagement.specialist_assigned"]);
  });

  it("el acuse de la boleta propia lleva a la hoja de tiempo, no a la portada", () => {
    // La regresion concreta, fijada aparte del barrido: el barrido solo exige "alguna ruta", y
    // esta tiene que ser ESA — es la que el boton promete.
    for (const typeKey of ["timesheet.own_submit_confirmed"]) {
      expect(rutaDeNotificacion({ typeKey, entityId: "period-1" })).toBe("/timesheet");
      expect(
        urlAbsoluta(URL_APP, rutaDeNotificacion({ typeKey, entityId: "period-1" })),
      ).toBe("https://ems.ruizmier.com/timesheet");
    }
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
        payload: { request_number: "FR-2026-2027", amount: 1500, currency: "BOB" },
      }),
    );

    expect(correo.asunto).toBe("Solicitud de fondos cerrada");
    expect(correo.cuerpoTexto).toContain("- Solicitud: FR-2026-2027");
    // El comentario de arriba ya decia "BOB 1.500"; la linea salia "1500" a secas.
    expect(correo.cuerpoTexto).toContain("- Monto: BOB 1.500");
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

  it("un cambio de rol muestra nombres legibles y conserva un role_key futuro como fallback", () => {
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "auth.role.changed",
        entityId: null,
        payload: { staff_id: "s-1", previous_role_key: "hr_analyst", role_key: "director" },
      }),
    );
    const desconocido = renderizarCorreoNotificacion(
      base({
        typeKey: "auth.role.changed",
        entityId: null,
        payload: { staff_id: "s-1", role_key: "future_role" },
      }),
    );

    expect(correo.cuerpoTexto).toContain("- Rol anterior: Analista de Talento Humano");
    expect(correo.cuerpoTexto).toContain("- Rol actual: Director");
    expect(correo.cuerpoTexto).not.toContain("hr_analyst");
    expect(desconocido.cuerpoTexto).toContain("- Rol actual: future_role");
  });

  it("sin ruta el correo igual sale, pero SIN boton y sin enlace", () => {
    // El hecho ya ocurrio y vale por si mismo, asi que el correo sale igual. Lo que no sale es
    // el boton: hasta 2026-09-16 la ruta null se convertia en el origen pelado y el mensaje
    // llevaba "Ver solicitud" a la portada, que es la misma mentira que un enlace roto.
    const correo = renderizarCorreoNotificacion(
      base({ typeKey: "fund.request.closed", entityId: null, payload: {} }),
    );

    expect(correo.cuerpoTexto).not.toContain("https://ems.ruizmier.com");
    expect(correo.cuerpoTexto).not.toContain("Ver solicitud");
    expect(correo.cuerpoHtml).not.toContain("<a href=");
    expect(correo.cuerpoHtml).not.toContain("copie esta direcci\u00f3n");
    // Y el aviso sigue estando: sin boton no es lo mismo que sin correo.
    expect(correo.cuerpoTexto).toContain("Estimado/a Ana:");
    expect(correo.cuerpoTexto).toContain("EMS 2.0 - Ruizmier");
  });

  it("la asignacion de especialista sale sin boton y nombra cliente y encargo", () => {
    // El aviso es informativo: `ita_manager` tiene `engagement.read`, pero el encargo no entra
    // en su portafolio —`list_portfolio_engagements()` lo resuelve por `manager_id`— y
    // /engagements/<id> le muestra "no disponible". Como no hay pantalla a la que mandarlo, el
    // encargo tiene que quedar identificado EN EL TEXTO.
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "engagement.specialist_assigned",
        entityId: "eng-1",
        payload: {
          context: "it",
          client_name: "ACME S.A.",
          engagement_code: "12-06",
          engagement_name: "Auditoria Externa 2026",
        },
      }),
    );

    expect(correo.asunto).toBe("Lo asignaron a un encargo");
    expect(correo.cuerpoTexto).toContain("especialista ITA");
    expect(correo.cuerpoTexto).toContain("- Cliente: ACME S.A.");
    expect(correo.cuerpoTexto).toContain("- Encargo: 12-06 \u2014 Auditoria Externa 2026");
    expect(correo.cuerpoTexto).toContain("no requiere ninguna accion");

    // Sin boton y sin enlace: ni el texto plano ni el HTML mencionan una pantalla.
    expect(correo.cuerpoTexto).not.toContain("Ver encargo");
    expect(correo.cuerpoTexto).not.toContain("https://ems.ruizmier.com");
    expect(correo.cuerpoHtml).not.toContain("<a href=");
  });

  it("con codigo vacio el encargo se identifica por su nombre", () => {
    // `engagement_code` es nullable en la tabla y el disparador lo manda como cadena vacia.
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "engagement.specialist_assigned",
        entityId: "eng-1",
        payload: {
          context: "tax",
          client_name: "ACME S.A.",
          engagement_code: "",
          engagement_name: "Auditoria Externa 2026",
        },
      }),
    );

    expect(correo.cuerpoTexto).toContain("- Encargo: Auditoria Externa 2026");
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

  it("las fechas del payload salen en DD/MM/YYYY y no en ISO", () => {
    // `emergency_deadline_at` es una columna `date`, asi que jsonb la serializa "2026-09-18" y
    // String() la dejaba pasar tal cual hasta el correo. Regla 3 de AGENTS.md.
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "wo.emergency.deadline_passed",
        entityId: "wo-1",
        payload: { deadline: "2026-09-18" },
      }),
    );

    expect(correo.cuerpoTexto).toContain("- Plazo: 18/09/2026");
    expect(correo.cuerpoTexto).not.toContain("2026-09-18");
    expect(correo.cuerpoHtml).toContain("18/09/2026");
  });

  it("el otro disparo del mismo plazo tambien formatea", () => {
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "wo.emergency.deadline_near",
        entityId: "wo-1",
        payload: { deadline: "2026-12-01", days_left: 3 },
      }),
    );

    expect(correo.cuerpoTexto).toContain("- Plazo: 01/12/2026");
  });

  it("el dia no se corre por zona horaria", () => {
    // `new Date("2026-01-01")` es medianoche UTC; formatearla en La Paz (UTC-4) devuelve el 31 de
    // diciembre. Por eso el formateo reordena texto y no construye un Date.
    const correo = renderizarCorreoNotificacion(
      base({ typeKey: "wo.emergency.deadline_passed", entityId: "wo-1", payload: { deadline: "2026-01-01" } }),
    );

    expect(correo.cuerpoTexto).toContain("- Plazo: 01/01/2026");
    expect(correo.cuerpoTexto).not.toContain("31/12/2025");
  });

  it("solo formatea las claves declaradas como fecha, no el texto libre", () => {
    // Una observacion que el usuario escriba con forma de fecha es texto suyo, no un dato de
    // calendario: reordenarla seria corromperla.
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "fund.request.decided",
        entityId: "fr-1",
        payload: { notes: "2026-09-18" },
      }),
    );

    expect(correo.cuerpoTexto).toContain("- Observaciones: 2026-09-18");
  });

  it("una fecha que no calza el patron sale tal cual en vez de perderse", () => {
    const correo = renderizarCorreoNotificacion(
      base({ typeKey: "wo.emergency.deadline_passed", entityId: "wo-1", payload: { deadline: "sin definir" } }),
    );

    expect(correo.cuerpoTexto).toContain("- Plazo: sin definir");
  });

  it("el monto lleva separador de miles y no decimales", () => {
    // jsonb manda 1500.00 y JSON.parse lo vuelve 1500; String() lo imprimia pelado. Regla 4 de
    // AGENTS.md: miles separados, cero decimales.
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "fund.request.closed",
        entityId: "fr-9",
        payload: { amount: 1234567.89, currency: "USD" },
      }),
    );

    expect(correo.cuerpoTexto).toContain("- Monto: USD 1.234.568");
  });

  it("sin moneda en el payload el monto igual sale formateado", () => {
    const correo = renderizarCorreoNotificacion(
      base({ typeKey: "fund.request.closed", entityId: "fr-9", payload: { amount: 9500 } }),
    );

    expect(correo.cuerpoTexto).toContain("- Monto: 9.500");
  });

  it("la moneda no ocupa una linea propia", () => {
    // "Moneda: BOB" como detalle suelto no le dice nada a nadie: viaja pegada al monto.
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "fund.request.closed",
        entityId: "fr-9",
        payload: { amount: 100, currency: "BOB" },
      }),
    );

    expect(correo.cuerpoTexto).not.toContain("Moneda:");
    expect(correo.cuerpoTexto).toContain("- Monto: BOB 100");
  });

  it("un monto que no es numero sale tal cual en vez de perderse", () => {
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "fund.request.closed",
        entityId: "fr-9",
        payload: { amount: "por definir", currency: "BOB" },
      }),
    );

    expect(correo.cuerpoTexto).toContain("- Monto: por definir");
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

  // El recordatorio de aprobaciones resume TRES contadores que la app rutea a tres pantallas
  // distintas (TYPE_ROUTE_PERMISSION en src/lib/notifications.ts). Mandarlos a los tres a la cola
  // del aprobador le daba "No access" a los ocho roles que reciben el recordatorio sin
  // `timesheet_approval.read` — assistant, semisenior, senior, los ita_/tax_ y Seguridad TI.
  describe("approval.reminder.weekly elige destino segun el contador que trae", () => {
    const recordatorioDeAprobaciones = (payload: Record<string, unknown>) =>
      renderizarCorreoNotificacion(
        base({ typeKey: "approval.reminder.weekly", entityId: null, payload }),
      );

    it("la boleta propia esperando aprobacion lleva a MI hoja de tiempo", () => {
      // `lineas` no es trabajo por aprobar: son las semanas que envio el destinatario y que
      // siguen esperando a SU aprobador. Un senior no entra a /timesheet/approvals.
      const correo = recordatorioDeAprobaciones({ lineas: { count: 2 } });

      expect(correo.cuerpoTexto).toContain("https://ems.ruizmier.com/timesheet");
      expect(correo.cuerpoTexto).not.toContain("/timesheet/approvals");
      expect(correo.cuerpoTexto).toContain("semanas suyas esperando aprobación");
    });

    it("la cola de capacitacion si lleva a aprobaciones", () => {
      const correo = recordatorioDeAprobaciones({ capacitacion: { count: 4 } });
      expect(correo.cuerpoTexto).toContain("https://ems.ruizmier.com/timesheet/approvals");
    });

    it("los encargos esperando al Socio llevan a encargos", () => {
      const correo = recordatorioDeAprobaciones({ encargos: { count: 1 } });
      expect(correo.cuerpoTexto).toContain("https://ems.ruizmier.com/engagements");
    });

    it("con varios contadores gana lo que el destinatario tiene que resolver el", () => {
      // La boleta propia espera a otro; la capacitacion espera al destinatario. El boton lleva
      // a donde hay algo que hacer, no a donde hay algo que mirar.
      const correo = recordatorioDeAprobaciones({
        lineas: { count: 3 },
        capacitacion: { count: 1 },
      });

      expect(correo.cuerpoTexto).toContain("https://ems.ruizmier.com/timesheet/approvals");
      // Y las dos lineas siguen apareciendo: cambia el destino, no el resumen.
      expect(correo.cuerpoTexto).toContain("semanas suyas esperando aprobación: 3");
      expect(correo.cuerpoTexto).toContain("línea de capacitación por aprobar: 1");
    });

    it("el boton nombra la pantalla a la que lleva, no siempre 'aprobaciones'", () => {
      // Un boton que dice "Ir a aprobaciones" sobre un enlace a la hoja de tiempo propia es la
      // misma mentira que el enlace roto, solo que mas dificil de notar.
      expect(recordatorioDeAprobaciones({ lineas: { count: 1 } }).cuerpoTexto)
        .toContain("Ir a mi hoja de tiempo");
      expect(recordatorioDeAprobaciones({ encargos: { count: 1 } }).cuerpoTexto)
        .toContain("Ir a encargos");
      expect(recordatorioDeAprobaciones({ capacitacion: { count: 1 } }).cuerpoTexto)
        .toContain("Ir a aprobaciones");
    });
  });

  it("el recordatorio de fondos NO lleva a la lista personal de solicitudes", () => {
    // `/fund-requests` filtra por `requester_staff_id === staffRecord.staff_id`
    // (FundRequests.tsx): es la lista PROPIA. El recordatorio cuenta las colas de Contabilidad de
    // toda la firma, asi que ese destino le mostraba a un Gerente de Contabilidad sus propias
    // solicitudes —probablemente cero— en vez del backlog que el correo acababa de resumir.
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "fund.reminder.weekly",
        entityId: null,
        payload: { desembolsos: { count: 12 } },
      }),
    );

    expect(
      rutaDeNotificacion({ typeKey: "fund.reminder.weekly", payload: { desembolsos: { count: 12 } } }),
    ).toBe("/fund-requests/disbursements?tab=to_disburse");
    expect(correo.cuerpoTexto).toContain(
      "https://ems.ruizmier.com/fund-requests/disbursements?tab=to_disburse",
    );
    expect(correo.asunto).toBe("Solicitudes de fondos pendientes");
  });

  it.each([
    ["desembolsos", "to_disburse"],
    ["revision_gastos", "expenses_review"],
    ["liquidaciones", "in_settlement"],
    ["cierres", "in_settlement"],
  ])("el bucket %s manda a su pestaña (%s)", (clave, tab) => {
    // El mapeo es el mismo de PENDING_ALARMS en src/lib/notifications.ts, tab por tab: la campana
    // y el correo tienen que mandar al mismo lugar.
    const correo = renderizarCorreoNotificacion(
      base({ typeKey: "fund.reminder.weekly", entityId: null, payload: { [clave]: { count: 3 } } }),
    );

    expect(correo.cuerpoTexto).toContain(
      `https://ems.ruizmier.com/fund-requests/disbursements?tab=${tab}`,
    );
  });

  it("sin permiso sobre la pantalla, el recordatorio de fondos sale sin boton", () => {
    // `accounting_analyst` recibe el recordatorio y no tiene `fund_disbursement.read`. Lo decide
    // notify_staff al encolar, que es el unico momento con el rol a la vista, y marca el payload.
    const correo = renderizarCorreoNotificacion(
      base({
        typeKey: "fund.reminder.weekly",
        entityId: null,
        payload: { revision_gastos: { count: 4 }, sin_ruta: true },
      }),
    );

    expect(correo.cuerpoTexto).not.toContain("/fund-requests/disbursements");
    // El correo igual sale: el dato le sirve aunque no pueda abrir la pantalla.
    expect(correo.cuerpoTexto).toContain("- gastos por revisar: 4");
    // Y NO HAY BOTON, ni el de la pestania ni el generico del tipo: sin ruta no hay a donde
    // mandar al lector, y "Ir a solicitudes" sobre el origen pelado es la misma mentira que un
    // enlace roto, solo que mas dificil de notar.
    expect(correo.cuerpoTexto).not.toContain("Ir a revisión de gastos");
    expect(correo.cuerpoTexto).not.toContain("Ir a solicitudes");
    expect(correo.cuerpoHtml).not.toContain("<a href=");
  });

  it("los cuatro recordatorios rinden", () => {
    // `fund.reminder.weekly` NO tiene ruta fija: sus cuatro contadores viven en pestanias
    // distintas de la misma pantalla y el destino sale del contador que traiga el payload. Por
    // eso va con uno, mientras que a los otros tres les alcanza el tipo.
    const casos: [string, Record<string, unknown>][] = [
      ["timesheet.reminder.daily", {}],
      ["approval.reminder.weekly", {}],
      ["fund.reminder.weekly", { revision_gastos: { count: 4 } }],
      ["wo.installment.reminder.weekly", {}],
    ];

    for (const [tipo, payload] of casos) {
      const correo = renderizarCorreoNotificacion(base({ typeKey: tipo, entityId: null, payload }));
      expect(correo.asunto.length).toBeGreaterThan(0);
      expect(correo.cuerpoHtml).toContain("<a href=");
    }
  });
});

describe("rutas", () => {
  it("la asignacion de especialista no lleva a ninguna pantalla", () => {
    // No es `sin_ruta` —`ita_manager` y `tax_manager` SI tienen `engagement.read`—: lo que les
    // falta es la FILA, porque `list_portfolio_engagements()` (BUG 0828-185) resuelve su
    // portafolio por `manager_id`, no por las columnas de especialista. Espejo de
    // `notificationRoute` en src/lib/notifications.ts.
    expect(
      rutaDeNotificacion({ typeKey: "engagement.specialist_assigned", entityId: "eng-1" }),
    ).toBeNull();

    // Y el resto del modulo sigue entrando por la rama generica.
    expect(
      rutaDeNotificacion({ typeKey: "engagement.sqr_assigned", entityId: "eng-1" }),
    ).toBe("/engagements/eng-1");
  });

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

  describe("sin_ruta: el destinatario no puede abrir la pantalla", () => {
    // Quien decide es `notify_staff`, al encolar: es el unico momento con el rol del
    // destinatario a la vista. Aca no hay sesion contra la cual chequear permisos, asi que el
    // renderizador solo obedece la marca. Antes habia una excepcion a mano para dos tipos de
    // encargo; esto cubre la clase entera.
    it("apaga el enlace sea cual sea el modulo", () => {
      const casos = [
        { typeKey: "wo.submitted_risk", entityId: "wo-1" },
        { typeKey: "wo.payment_plan.pending_approval", entityId: "wo-1" },
        { typeKey: "engagement.sqr_assigned", entityId: "eng-1" },
        { typeKey: "engagement.encargado_assigned", entityId: "eng-1" },
        { typeKey: "fund.request.approved", entityId: "fr-1" },
      ];
      for (const caso of casos) {
        expect(rutaDeNotificacion({ ...caso, payload: { sin_ruta: true } }), caso.typeKey)
          .toBeNull();
      }
    });

    it("gana sobre cualquier destino, incluido el de los recordatorios", () => {
      const ruta = rutaDeNotificacion({
        typeKey: "approval.reminder.weekly",
        entityId: null,
        payload: { sin_ruta: true, capacitacion: { count: 3 } },
      });
      expect(ruta).toBeNull();
    });

    it("el borrado de encargo no rutea, aunque el destinatario tenga el permiso", () => {
      // No lo cubre `sin_ruta`: al admin no le falta `engagement.read`, lo que falta es la fila.
      // El borrado es duro (TG_OP='DELETE'), asi que el detalle solo puede dar "no disponible".
      expect(rutaDeNotificacion({ typeKey: "engagement.deleted", entityId: "eng-1" })).toBeNull();
      expect(rutaDeNotificacion({ typeKey: "engagement.finalized", entityId: "eng-1" }))
        .toBe("/engagements/eng-1");
    });

    it("sin la marca el enlace sale normal: no se apaga por las dudas", () => {
      // La marca la pone la base cuando corresponde. Un payload que no la trae es un
      // destinatario que SI puede entrar, y quitarle el enlace seria el error opuesto.
      expect(rutaDeNotificacion({ typeKey: "wo.submitted_risk", entityId: "wo-1" }))
        .toBe("/work-orders/wo-1");
      expect(
        rutaDeNotificacion({
          typeKey: "engagement.sqr_assigned",
          entityId: "eng-1",
          payload: { sin_ruta: false },
        }),
      ).toBe("/engagements/eng-1");
    });
  });

  it("urlAbsoluta no duplica la barra", () => {
    expect(urlAbsoluta("https://ems.ruizmier.com/", "/timesheet")).toBe(
      "https://ems.ruizmier.com/timesheet",
    );
  });
});
