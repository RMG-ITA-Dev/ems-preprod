import { describe, it, expect } from "vitest";
import {
  addBusinessDays,
  distributePercentages,
  computeAmount,
  computePaymentDate,
  isAlertDue,
  installmentCalendarState,
  getInstallmentCalendarState,
  getInstallmentDisplay,
  currentDueDate,
  currentInvoiceDate,
  computeBillingIndicator,
  isInvoiceRateEditable,
  isPaymentRateEditable,
  isPaymentRateCaptureEditable,
  computeConvertedAmount,
  applyExchangeRateMode,
  isPaymentPlanRestDirty,
} from "../workOrderPaymentPlan";
import type { PaymentInstallmentInput, PaymentPlanInput } from "@/types/workOrderPaymentPlan";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// BUG preexistente (M6, bugs/scheduler/fase_5/review.md), corregido acá: esta helper
// anclaba "hoy" a la hora local del SISTEMA que corre el test (`new Date()` +
// `setDate`/`getDate`, reloj de pared) y lo serializaba vía `toISOString()` (UTC) — dos
// conversiones de zona horaria que isAlertDue()/getInstallmentCalendarState() nunca hacen, porque ambas
// anclan "hoy" explícitamente a America/La_Paz vía Intl.DateTimeFormat. Cuando el sistema
// que corre el test no está en America/La_Paz (typicamente UTC en GitHub Actions), o incluso
// estando en esa zona según la hora del día, el "hoy" del test y el de producción podían
// ser calendarios distintos, dando falsos negativos/positivos dependientes de a qué hora del
// día corría la suite. Ahora ancla "hoy" exactamente como producción y hace toda la
// aritmética en UTC puro (setUTCDate), sin pasar nunca por reloj-de-pared local.
function dayOffset(offsetDays: number): string {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
  const d = new Date(`${todayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function baseInstallment(overrides: Partial<PaymentInstallmentInput> = {}): PaymentInstallmentInput {
  return {
    installment_id: "test-id",
    plan_id: "plan-id",
    wo_id: "wo-id",
    installment_number: 1,
    agreed_invoice_date: null,
    agreed_payment_date: null,
    collection_invoice_date: null,
    collection_payment_date: null,
    payment_date_actual: null,
    percentage: 100,
    amount: null,
    status: "Pending",
    invoice_exchange_rate: null,
    payment_exchange_rate: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// addBusinessDays
// ---------------------------------------------------------------------------

describe("addBusinessDays — basic", () => {
  it("0 days returns same date", () => {
    expect(isoDate(addBusinessDays(utcDate("2026-08-03"), 0))).toBe("2026-08-03");
  });

  it("1 business day after a Monday = Tuesday (no holiday)", () => {
    // 2026-08-03 = Monday
    expect(isoDate(addBusinessDays(utcDate("2026-08-03"), 1))).toBe("2026-08-04");
  });

  it("1 business day after a Friday skips the weekend", () => {
    // 2026-07-31 = Friday → next BD = Monday 2026-08-03
    expect(isoDate(addBusinessDays(utcDate("2026-07-31"), 1))).toBe("2026-08-03");
  });

  it("5 business days after a Monday", () => {
    // 2026-08-03 (Mon) + 5 BD, skipping Aug 6 (Día de la Independencia):
    // +1=Tue 04, +2=Wed 05, +3=Fri 07 (skip holiday Thu 06), +4=Mon 10, +5=Tue 11
    expect(isoDate(addBusinessDays(utcDate("2026-08-03"), 5))).toBe("2026-08-11");
  });
});

describe("addBusinessDays — Bolivia national holidays", () => {
  it("skips Día de la Independencia (Aug 6) when it falls mid-week", () => {
    // 2026-08-05 = Wednesday; +1 BD should skip Thu Aug 6 (holiday) → Fri Aug 7
    expect(isoDate(addBusinessDays(utcDate("2026-08-05"), 1))).toBe("2026-08-07");
  });

  it("skips Navidad (Dec 25) when it falls on a Friday", () => {
    // 2026-12-24 = Thursday; +1 BD should skip Fri Dec 25 (holiday) + weekend → Mon Dec 28
    expect(isoDate(addBusinessDays(utcDate("2026-12-24"), 1))).toBe("2026-12-28");
  });

  it("skips Día del Trabajo (May 1) when it falls on a Friday", () => {
    // 2026-04-30 = Thursday; +1 BD should skip Fri May 1 (holiday) + weekend → Mon May 4
    expect(isoDate(addBusinessDays(utcDate("2026-04-30"), 1))).toBe("2026-05-04");
  });
});

describe("addBusinessDays — departmental holidays (BUG 0526-122) do not apply globally", () => {
  it("does NOT skip 16-jul (La Paz-only holiday)", () => {
    // 2026-07-15 = Wednesday; +1 BD must land on Thu 2026-07-16 -- this is a
    // global/office-agnostic business-day calendar, so the La Paz-only
    // holiday must not be treated as a holiday here.
    expect(isoDate(addBusinessDays(utcDate("2026-07-15"), 1))).toBe("2026-07-16");
  });

  it("does NOT skip 24-sep (Santa Cruz-only holiday)", () => {
    // 2026-09-23 = Wednesday; +1 BD must land on Thu 2026-09-24, same reason.
    expect(isoDate(addBusinessDays(utcDate("2026-09-23"), 1))).toBe("2026-09-24");
  });
});

describe("addBusinessDays — Dec→Jan boundary", () => {
  it("crosses New Year correctly, skipping Jan 1 holiday", () => {
    // 2026-12-30 = Wednesday
    // +1 BD: Thu Dec 31
    // +2 BD: skip Fri Jan 1 (holiday) + Sat + Sun → Mon Jan 4
    // +3 BD: Tue Jan 5
    expect(isoDate(addBusinessDays(utcDate("2026-12-30"), 3))).toBe("2027-01-05");
  });

  it("1 business day after Dec 31 skips New Year", () => {
    // 2026-12-31 = Thursday; +1 BD → skip Fri Jan 1 (holiday) + weekend → Mon Jan 4
    expect(isoDate(addBusinessDays(utcDate("2026-12-31"), 1))).toBe("2027-01-04");
  });
});

// ---------------------------------------------------------------------------
// distributePercentages
// ---------------------------------------------------------------------------

describe("distributePercentages", () => {
  it("count=0 returns empty array", () => {
    expect(distributePercentages(0)).toEqual([]);
  });

  it("count=1 returns [100]", () => {
    expect(distributePercentages(1)).toEqual([100]);
  });

  it("count=2 returns [50, 50]", () => {
    expect(distributePercentages(2)).toEqual([50, 50]);
  });

  it("count=3 returns [33.33, 33.33, 33.34] — last row absorbs rounding", () => {
    expect(distributePercentages(3)).toEqual([33.33, 33.33, 33.34]);
  });

  it("count=4 returns [25, 25, 25, 25]", () => {
    expect(distributePercentages(4)).toEqual([25, 25, 25, 25]);
  });

  it("always sums to exactly 100 for counts 1–12", () => {
    for (let n = 1; n <= 12; n++) {
      const arr = distributePercentages(n);
      const sum = arr.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
    }
  });

  // review iteracion 2 #3: `total` opcional para redistribuir solo el porcentaje
  // remanente cuando alguna cuota ya facturada queda excluida (no participa de esto).
  describe("with an explicit `total` (review iteracion 2 #3)", () => {
    it("distributes an arbitrary remaining total instead of 100", () => {
      expect(distributePercentages(2, 60)).toEqual([30, 30]);
    });

    it("last row absorbs the rounding remainder against the given total", () => {
      const arr = distributePercentages(3, 70);
      const sum = arr.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 70)).toBeLessThanOrEqual(0.01);
    });

    it("count=0 returns empty regardless of total", () => {
      expect(distributePercentages(0, 55)).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// computeAmount
// ---------------------------------------------------------------------------

describe("computeAmount", () => {
  it("50% of 114,943 = 57,471.50", () => {
    expect(computeAmount(50, 114943)).toBe(57471.5);
  });

  it("100% = full fee", () => {
    expect(computeAmount(100, 1000)).toBe(1000);
  });

  it("0% = 0", () => {
    expect(computeAmount(0, 1000)).toBe(0);
  });

  it("33.33% of 100 = 33.33", () => {
    expect(computeAmount(33.33, 100)).toBe(33.33);
  });
});

// ---------------------------------------------------------------------------
// computePaymentDate
// ---------------------------------------------------------------------------

describe("computePaymentDate", () => {
  it("returns null when invoiceDate is null", () => {
    expect(computePaymentDate(null, 30)).toBeNull();
  });

  it("1 business day after 2026-08-05 skips Aug 6 holiday → 2026-08-07", () => {
    expect(computePaymentDate("2026-08-05", 1)).toBe("2026-08-07");
  });

  it("30 business days after 2026-08-03 (Monday)", () => {
    // Spot-check: result should be a valid date string further in the future
    const result = computePaymentDate("2026-08-03", 30);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result! > "2026-08-03").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isAlertDue
// ---------------------------------------------------------------------------

describe("isAlertDue", () => {
  it("returns true when agreed_invoice_date is tomorrow (1 day out)", () => {
    const inst = baseInstallment({
      status: "Pending",
      agreed_invoice_date: dayOffset(1),
    });
    expect(isAlertDue(inst)).toBe(true);
  });

  it("returns true when agreed_invoice_date is exactly 7 days away", () => {
    const inst = baseInstallment({
      status: "Pending",
      agreed_invoice_date: dayOffset(7),
    });
    expect(isAlertDue(inst)).toBe(true);
  });

  it("returns false when agreed_invoice_date is 8 days away", () => {
    const inst = baseInstallment({
      status: "Pending",
      agreed_invoice_date: dayOffset(8),
    });
    expect(isAlertDue(inst)).toBe(false);
  });

  it("returns false when agreed_invoice_date is in the past", () => {
    const inst = baseInstallment({
      status: "Pending",
      agreed_invoice_date: dayOffset(-1),
    });
    expect(isAlertDue(inst)).toBe(false);
  });

  // Cobranzas Fase 1: el banner dice "hay cuotas POR FACTURAR pronto". Una cuota ya
  // facturada no está por facturar, así que dejó de dispararlo (antes sí lo hacía, porque
  // isAlertDue sólo miraba la fecha y aceptaba también el estado Invoiced). Su riesgo real
  // —que el cliente no pague— lo cubre la condición de calendario de la propia cuota.
  it("una cuota YA FACTURADA no dispara el aviso de 'por facturar'", () => {
    const inst = baseInstallment({
      status: "Invoiced",
      agreed_invoice_date: dayOffset(3),
    });
    expect(isAlertDue(inst)).toBe(false);
  });

  it("returns false for Completed status even within window", () => {
    const inst = baseInstallment({
      status: "Completed",
      agreed_invoice_date: dayOffset(1),
    });
    expect(isAlertDue(inst)).toBe(false);
  });

  it("returns false for Overdue status even within window", () => {
    const inst = baseInstallment({
      status: "Overdue",
      agreed_invoice_date: dayOffset(1),
    });
    expect(isAlertDue(inst)).toBe(false);
  });

  it("returns false when agreed_invoice_date is null", () => {
    const inst = baseInstallment({
      status: "Pending",
      agreed_invoice_date: null,
    });
    expect(isAlertDue(inst)).toBe(false);
  });

  it("respects custom windowDays parameter", () => {
    const inst = baseInstallment({
      status: "Pending",
      agreed_invoice_date: dayOffset(3),
    });
    expect(isAlertDue(inst, 2)).toBe(false);
    expect(isAlertDue(inst, 3)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// installmentCalendarState — Cobranzas Fase 1 (issue #352 / 0923-206).
// Regla ÚNICA de mora, espejo de public.installment_calendar_state(...) en la base.
// Cubre los escenarios que nombra el issue: cuota vencida, cliente que no paga en el
// mes previsto, pago reprogramado al mes siguiente y pago hecho en otra fecha.
// ---------------------------------------------------------------------------

describe("installmentCalendarState (función pura, con 'hoy' explícito)", () => {
  const TODAY = "2026-10-15";

  it("una cuota SIN FACTURAR con su fecha de facturación pasada es 'facturación atrasada', NUNCA mora", () => {
    // El bug central de #352: antes esto se mostraba como "Mora", mezclando "no se
    // facturó a tiempo" (nuestro atraso) con "el cliente no pagó" (deuda del cliente).
    expect(installmentCalendarState("Pending", "2026-10-01", null, TODAY)).toBe("billing_late");
  });

  it("una cuota sin facturar cuya fecha de facturación cae dentro de los 7 días avisa, sin ser atraso", () => {
    expect(installmentCalendarState("Pending", "2026-10-20", null, TODAY)).toBe("billing_due_soon");
    expect(installmentCalendarState("Pending", TODAY, null, TODAY)).toBe("billing_due_soon");
  });

  it("una cuota sin facturar y todavía lejos está en plazo", () => {
    expect(installmentCalendarState("Pending", "2026-11-30", null, TODAY)).toBe("on_track");
  });

  it("la mora se cuenta desde el VENCIMIENTO REAL, no desde la fecha pactada (decisión Q4)", () => {
    // Facturada tarde: su vencimiento real cae después del pactado. Medida contra la
    // fecha pactada, la cuota aparecía en mora antes de tiempo.
    expect(installmentCalendarState("Invoiced", "2026-09-01", "2026-10-30", TODAY)).toBe("on_track");
    expect(installmentCalendarState("Invoiced", "2026-09-01", "2026-10-14", TODAY)).toBe("overdue");
  });

  it("el día del vencimiento todavía no es mora; el siguiente sí", () => {
    expect(installmentCalendarState("Invoiced", null, TODAY, TODAY)).toBe("payment_due_soon");
    expect(installmentCalendarState("Invoiced", null, "2026-10-14", TODAY)).toBe("overdue");
  });

  it("la mora MANUAL es mora aunque su vencimiento no haya pasado (decisión Q3: se mantiene)", () => {
    expect(installmentCalendarState("Overdue", null, "2026-12-31", TODAY)).toBe("overdue");
  });

  it("una cuota cobrada queda cerrada y no genera más alertas, ni siquiera pagada tarde", () => {
    expect(installmentCalendarState("Completed", "2026-01-01", "2026-02-01", TODAY)).toBe("closed");
  });

  it("sin fecha aplicable no inventa un estado", () => {
    expect(installmentCalendarState("Pending", null, null, TODAY)).toBe("on_track");
    expect(installmentCalendarState("Invoiced", null, null, TODAY)).toBe("on_track");
  });

  it("la ventana de aviso es configurable", () => {
    expect(installmentCalendarState("Pending", "2026-10-20", null, TODAY, 3)).toBe("on_track");
    expect(installmentCalendarState("Pending", "2026-10-18", null, TODAY, 3)).toBe("billing_due_soon");
  });
});

describe("fechas vigentes y reprogramación (issue #352)", () => {
  it("currentInvoiceDate usa la reprogramada cuando existe, y si no la del contrato", () => {
    expect(currentInvoiceDate(baseInstallment({ agreed_invoice_date: "2026-10-01" }))).toBe("2026-10-01");
    expect(currentInvoiceDate(baseInstallment({
      agreed_invoice_date: "2026-10-01",
      current_invoice_date: "2026-11-01",
    }))).toBe("2026-11-01");
  });

  it("currentDueDate prefiere el vencimiento real sobre el pactado", () => {
    expect(currentDueDate(baseInstallment({
      agreed_payment_date: "2026-10-10",
      collection_payment_date: "2026-11-05",
    }))).toBe("2026-11-05");
  });

  it("reprogramar al mes siguiente saca a la cuota de 'facturación atrasada' sin perder el contrato", () => {
    const original = baseInstallment({ status: "Pending", agreed_invoice_date: "2026-10-01" });
    expect(getInstallmentCalendarState(original, "2026-10-15")).toBe("billing_late");

    const rescheduled = { ...original, current_invoice_date: "2026-11-01" };
    expect(getInstallmentCalendarState(rescheduled, "2026-10-15")).toBe("on_track");
    // La fecha pactada sigue intacta: #352 pide no perder el historial ni confundir una
    // reprogramación autorizada con una cuota vencida.
    expect(rescheduled.agreed_invoice_date).toBe("2026-10-01");
  });

  it("si también se incumple la fecha nueva, vuelve a estar atrasada", () => {
    const rescheduled = baseInstallment({
      status: "Pending",
      agreed_invoice_date: "2026-10-01",
      current_invoice_date: "2026-11-01",
    });
    expect(getInstallmentCalendarState(rescheduled, "2026-11-10")).toBe("billing_late");
  });
});

describe("getInstallmentDisplay (etapa + calendario, para el chip)", () => {
  it("distingue mora manual de mora por fecha, que es lo que aclara el tooltip", () => {
    const manual = getInstallmentDisplay(
      baseInstallment({ status: "Overdue", collection_payment_date: "2026-12-31" }), "2026-10-15");
    expect(manual).toMatchObject({ stage: "Overdue", isOverdue: true, overdueKind: "manual" });

    const byDate = getInstallmentDisplay(
      baseInstallment({ status: "Invoiced", collection_payment_date: "2026-10-01" }), "2026-10-15");
    expect(byDate).toMatchObject({ stage: "Invoiced", isOverdue: true, overdueKind: "payment" });
  });

  it("una cuota sin facturar y atrasada NO es mora: conserva su etapa Pendiente", () => {
    const d = getInstallmentDisplay(
      baseInstallment({ status: "Pending", agreed_invoice_date: "2026-10-01" }), "2026-10-15");
    expect(d).toMatchObject({ stage: "Pending", calendar: "billing_late", isOverdue: false, overdueKind: null });
  });
});

// ---------------------------------------------------------------------------
// computeBillingIndicator (0817-176 §Indicadores — pestaña 2 tras aprobación total)
// ---------------------------------------------------------------------------

describe("computeBillingIndicator", () => {
  it("returns 'complete' when every installment is Collected (Completed) and percentages sum to 100%", () => {
    const installments = [
      baseInstallment({ status: "Completed", percentage: 50, agreed_payment_date: dayOffset(-30) }),
      baseInstallment({ status: "Completed", percentage: 50, agreed_payment_date: dayOffset(-10) }),
    ];
    expect(computeBillingIndicator(installments)).toBe("complete");
  });

  it("returns 'green' when in progress with no payment due soon or overdue", () => {
    const installments = [
      baseInstallment({ status: "Completed", agreed_payment_date: dayOffset(-30) }),
      baseInstallment({ status: "Invoiced", agreed_payment_date: dayOffset(20) }),
    ];
    expect(computeBillingIndicator(installments)).toBe("green");
  });

  it("returns 'red' when a not-yet-collected installment's payment date is within the alert window", () => {
    const installments = [
      baseInstallment({ status: "Completed", agreed_payment_date: dayOffset(-30) }),
      baseInstallment({ status: "Invoiced", agreed_payment_date: dayOffset(3) }),
    ];
    expect(computeBillingIndicator(installments)).toBe("red");
  });

  it("returns 'red' when a not-yet-collected installment's payment date is already overdue", () => {
    const installments = [
      baseInstallment({ status: "Invoiced", agreed_payment_date: dayOffset(-5) }),
    ];
    expect(computeBillingIndicator(installments)).toBe("red");
  });

  // Cobranzas Fase 1 (decisión Q4): una cuota todavía Pendiente se juzga por su fecha de
  // FACTURACIÓN, no por la de pago —nunca se facturó, así que no hay nada vencido que
  // cobrar—. Sigue pintando rojo, pero por el motivo correcto: facturación atrasada.
  it("pinta 'red' cuando una cuota sin facturar pasó su fecha de facturación", () => {
    const installments = [
      baseInstallment({ status: "Pending", agreed_invoice_date: dayOffset(-1), agreed_payment_date: dayOffset(29) }),
    ];
    expect(computeBillingIndicator(installments)).toBe("red");
  });

  it("una cuota sin facturar con la fecha de facturación lejana no pinta rojo por su fecha de pago", () => {
    const installments = [
      baseInstallment({ status: "Pending", agreed_invoice_date: dayOffset(40), agreed_payment_date: dayOffset(-1) }),
    ];
    expect(computeBillingIndicator(installments)).toBe("green");
  });

  it("returns 'green' for already-Invoiced installments with far-off payment dates (0817-176: Facturado en proceso, no rojo)", () => {
    const installments = [
      baseInstallment({ status: "Invoiced", agreed_payment_date: dayOffset(43) }),
      baseInstallment({ status: "Invoiced", agreed_payment_date: dayOffset(58) }),
    ];
    expect(computeBillingIndicator(installments)).toBe("green");
  });

  it("an Overdue-status installment is always red, regardless of its payment date", () => {
    const installments = [
      baseInstallment({ status: "Overdue", agreed_payment_date: dayOffset(30) }),
    ];
    expect(computeBillingIndicator(installments)).toBe("red");
  });

  it("a payment at risk does not turn green just because another installment is Completed", () => {
    const installments = [
      baseInstallment({ status: "Completed", agreed_payment_date: dayOffset(-60) }),
      baseInstallment({ status: "Invoiced", agreed_payment_date: dayOffset(-1) }),
      baseInstallment({ status: "Invoiced", agreed_payment_date: dayOffset(60) }),
    ];
    expect(computeBillingIndicator(installments)).toBe("red");
  });

  // Review iteración 2 (2026-08-19) #1: un plan de pagos nunca configurado no debe
  // leerse como "al día" (green) una vez la OT queda totalmente aprobada — el hint de
  // completitud en Draft es solo visual y no bloquea el envío (Open Question #2).
  describe("'unconfigured' — sin datos de cobranza cargados (review iteración 2 #1)", () => {
    it("returns 'unconfigured' for an empty installments list", () => {
      expect(computeBillingIndicator([])).toBe("unconfigured");
    });

    it("returns 'unconfigured' when no installment ever got an agreed payment date", () => {
      const installments = [
        baseInstallment({ status: "Pending", agreed_payment_date: null }),
        baseInstallment({ status: "Pending", agreed_payment_date: null }),
      ];
      expect(computeBillingIndicator(installments)).toBe("unconfigured");
    });
  });

  // Review iteración 2 #2: "complete" exige que las cuotas Completed cubran el 100%
  // del honorario, no solo que las cuotas registradas estén todas cobradas.
  describe("'complete' exige que la suma de % sea ~100% (review iteración 2 #2)", () => {
    it("does NOT return 'complete' when Completed installments only sum to 80%", () => {
      const installments = [
        baseInstallment({ status: "Completed", percentage: 40, agreed_payment_date: dayOffset(-30) }),
        baseInstallment({ status: "Completed", percentage: 40, agreed_payment_date: dayOffset(-10) }),
      ];
      expect(computeBillingIndicator(installments)).toBe("green");
    });

    it("still returns 'complete' when percentages sum to 100 within tolerance", () => {
      const installments = [
        baseInstallment({ status: "Completed", percentage: 33.33, agreed_payment_date: dayOffset(-30) }),
        baseInstallment({ status: "Completed", percentage: 33.33, agreed_payment_date: dayOffset(-20) }),
        baseInstallment({ status: "Completed", percentage: 33.34, agreed_payment_date: dayOffset(-10) }),
      ];
      expect(computeBillingIndicator(installments)).toBe("complete");
    });
  });
});

// ---------------------------------------------------------------------------
// 0722-156b (Fase 2): TC fijo/variable helpers
// ---------------------------------------------------------------------------

describe("isInvoiceRateEditable (persisted status only, never getEffectiveInstallmentStatus)", () => {
  it("editable only while Pending", () => {
    expect(isInvoiceRateEditable("Pending")).toBe(true);
  });

  it("frozen once Invoiced", () => {
    expect(isInvoiceRateEditable("Invoiced")).toBe(false);
  });

  it("stays frozen after a manual revert to a persisted Overdue (only reachable from Invoiced)", () => {
    expect(isInvoiceRateEditable("Overdue")).toBe(false);
  });

  it("frozen once Completed", () => {
    expect(isInvoiceRateEditable("Completed")).toBe(false);
  });
});

describe("isPaymentRateEditable (persisted status only)", () => {
  it("editable while Pending", () => {
    expect(isPaymentRateEditable("Pending")).toBe(true);
  });

  it("editable while Invoiced", () => {
    expect(isPaymentRateEditable("Invoiced")).toBe(true);
  });

  it("editable during a persisted post-invoice Overdue (operator decision: same window as Invoiced)", () => {
    expect(isPaymentRateEditable("Overdue")).toBe(true);
  });

  it("frozen once Completed", () => {
    expect(isPaymentRateEditable("Completed")).toBe(false);
  });
});

// Review iteracion 1 MUST FIX #1: distinta de isPaymentRateEditable de arriba (esa sigue
// usandose tal cual para el re-sync de modo Fijo). Esta es la ventana de captura real
// para el input de modo Variable — nunca antes de facturar.
describe("isPaymentRateCaptureEditable (modo Variable — ventana de captura real)", () => {
  it("NOT editable while still Pending (nothing invoiced yet)", () => {
    expect(isPaymentRateCaptureEditable("Pending")).toBe(false);
  });

  it("editable once Invoiced", () => {
    expect(isPaymentRateCaptureEditable("Invoiced")).toBe(true);
  });

  it("editable during a persisted post-invoice Overdue", () => {
    expect(isPaymentRateCaptureEditable("Overdue")).toBe(true);
  });

  it("frozen once Completed", () => {
    expect(isPaymentRateCaptureEditable("Completed")).toBe(false);
  });
});

describe("computeConvertedAmount (derived Bs amount, never persisted)", () => {
  it("multiplies amount by rate, rounded to 2 decimals", () => {
    expect(computeConvertedAmount(500, 6.95)).toBe(3475);
  });

  it("returns null when amount is null (no invented conversion)", () => {
    expect(computeConvertedAmount(null, 6.95)).toBeNull();
  });

  it("returns null when rate is null (exchange_rate_history empty -> no conversion shown)", () => {
    expect(computeConvertedAmount(500, null)).toBeNull();
  });
});

describe("applyExchangeRateMode (modo Fijo sync — no-op for an already-frozen field)", () => {
  it("modo Variable: returns installments unchanged (independent per-cuota capture)", () => {
    const installments = [
      baseInstallment({ status: "Pending", invoice_exchange_rate: 6.95, payment_exchange_rate: null }),
    ];
    expect(applyExchangeRateMode("variable", 7.0, installments)).toEqual(installments);
  });

  it("modo Fijo: syncs both TC columns to the plan rate for a still-editable (Pending) installment", () => {
    const installments = [
      baseInstallment({ status: "Pending", invoice_exchange_rate: 6.95, payment_exchange_rate: 6.95 }),
    ];
    const result = applyExchangeRateMode("fijo", 7.0, installments);
    expect(result[0].invoice_exchange_rate).toBe(7.0);
    expect(result[0].payment_exchange_rate).toBe(7.0);
  });

  it("modo Fijo: leaves an already-frozen invoice_exchange_rate (Invoiced) untouched, syncs the still-editable payment_exchange_rate", () => {
    const installments = [
      baseInstallment({ status: "Invoiced", invoice_exchange_rate: 6.95, payment_exchange_rate: null }),
    ];
    const result = applyExchangeRateMode("fijo", 7.0, installments);
    // Frozen: stays at its original value, never force-synced to the new plan rate —
    // this is what makes the resulting batch upsert a no-op for the DB freeze trigger.
    expect(result[0].invoice_exchange_rate).toBe(6.95);
    expect(result[0].payment_exchange_rate).toBe(7.0);
  });

  it("modo Fijo: leaves an already-frozen payment_exchange_rate (Completed) untouched", () => {
    const installments = [
      baseInstallment({ status: "Completed", invoice_exchange_rate: 6.95, payment_exchange_rate: 6.98 }),
    ];
    const result = applyExchangeRateMode("fijo", 7.0, installments);
    expect(result[0].invoice_exchange_rate).toBe(6.95);
    expect(result[0].payment_exchange_rate).toBe(6.98);
  });
});

// MUST FIX 0722-156b review iteracion 3 #4: invoice_exchange_rate/payment_exchange_rate
// se guardan directo en su propio onBlur, no via el flujo de pagina -- no deben contar como
// "el resto del plan tiene cambios sin guardar", o el propio tipeo del usuario bloquea su
// propio guardado (bug real encontrado en WorkOrderEdit.tsx).
describe("isPaymentPlanRestDirty (excluye invoice/payment_exchange_rate, que se auto-guardan)", () => {
  function basePlan(overrides: Partial<PaymentPlanInput> = {}): PaymentPlanInput {
    return {
      plan_id: "plan-id",
      wo_id: "wo-id",
      exchange_rate: 6.95,
      payment_days: 30,
      exchange_rate_mode: "variable",
      ...overrides,
    };
  }

  it("is false when only invoice_exchange_rate changed (the field's own edit)", () => {
    const original = [baseInstallment({ status: "Invoiced", invoice_exchange_rate: null })];
    const edited = [baseInstallment({ status: "Invoiced", invoice_exchange_rate: 7.1 })];
    expect(isPaymentPlanRestDirty(edited, original, basePlan(), basePlan())).toBe(false);
  });

  it("is false when only payment_exchange_rate changed (the field's own edit)", () => {
    const original = [baseInstallment({ status: "Invoiced", payment_exchange_rate: null })];
    const edited = [baseInstallment({ status: "Invoiced", payment_exchange_rate: 7.2 })];
    expect(isPaymentPlanRestDirty(edited, original, basePlan(), basePlan())).toBe(false);
  });

  it("is true when percentage changed (a real pending change elsewhere in the row)", () => {
    const original = [baseInstallment({ percentage: 100 })];
    const edited = [baseInstallment({ percentage: 50 })];
    expect(isPaymentPlanRestDirty(edited, original, basePlan(), basePlan())).toBe(true);
  });

  it("is true when the plan itself changed (exchange_rate_mode)", () => {
    const original = [baseInstallment()];
    expect(
      isPaymentPlanRestDirty(original, original, basePlan({ exchange_rate_mode: "fijo" }), basePlan()),
    ).toBe(true);
  });

  it("is false when nothing changed", () => {
    const original = [baseInstallment({ invoice_exchange_rate: 6.95, payment_exchange_rate: 6.95 })];
    expect(isPaymentPlanRestDirty(original, original, basePlan(), basePlan())).toBe(false);
  });
});
