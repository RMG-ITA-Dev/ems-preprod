import { describe, it, expect } from "vitest";
import {
  addBusinessDays,
  distributePercentages,
  computeAmount,
  computePaymentDate,
  detectOverdue,
  isAlertDue,
  getEffectiveInstallmentStatus,
  computeBillingIndicator,
  isInvoiceRateEditable,
  isPaymentRateEditable,
  computeConvertedAmount,
  applyExchangeRateMode,
} from "../workOrderPaymentPlan";
import type { PaymentInstallmentInput } from "@/types/workOrderPaymentPlan";

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
// conversiones de zona horaria que isAlertDue()/detectOverdue() nunca hacen, porque ambas
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
// detectOverdue
// ---------------------------------------------------------------------------

describe("detectOverdue", () => {
  it("returns true when Invoiced and agreed_payment_date is yesterday", () => {
    const inst = baseInstallment({
      status: "Invoiced",
      agreed_payment_date: dayOffset(-1),
    });
    expect(detectOverdue(inst)).toBe(true);
  });

  it("returns false when Invoiced and agreed_payment_date is today (not yet overdue)", () => {
    const inst = baseInstallment({
      status: "Invoiced",
      agreed_payment_date: dayOffset(0),
    });
    expect(detectOverdue(inst)).toBe(false);
  });

  it("returns false when Invoiced and agreed_payment_date is tomorrow", () => {
    const inst = baseInstallment({
      status: "Invoiced",
      agreed_payment_date: dayOffset(1),
    });
    expect(detectOverdue(inst)).toBe(false);
  });

  it("returns false when status is Pending (even with past date)", () => {
    const inst = baseInstallment({
      status: "Pending",
      agreed_payment_date: dayOffset(-10),
    });
    expect(detectOverdue(inst)).toBe(false);
  });

  it("returns false when status is Completed (even with past date)", () => {
    const inst = baseInstallment({
      status: "Completed",
      agreed_payment_date: dayOffset(-10),
    });
    expect(detectOverdue(inst)).toBe(false);
  });

  it("returns false when agreed_payment_date is null", () => {
    const inst = baseInstallment({
      status: "Invoiced",
      agreed_payment_date: null,
    });
    expect(detectOverdue(inst)).toBe(false);
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

  it("returns true for Invoiced status within window", () => {
    const inst = baseInstallment({
      status: "Invoiced",
      agreed_invoice_date: dayOffset(3),
    });
    expect(isAlertDue(inst)).toBe(true);
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
// getEffectiveInstallmentStatus (0817-176: extraída de WorkOrderPaymentPlanSection
// para compartirla con computeBillingIndicator)
// ---------------------------------------------------------------------------

describe("getEffectiveInstallmentStatus", () => {
  it("Pending with a past agreed_invoice_date reads as Overdue", () => {
    const inst = baseInstallment({ status: "Pending", agreed_invoice_date: dayOffset(-1) });
    expect(getEffectiveInstallmentStatus(inst)).toBe("Overdue");
  });

  it("Pending with a future agreed_invoice_date stays Pending", () => {
    const inst = baseInstallment({ status: "Pending", agreed_invoice_date: dayOffset(1) });
    expect(getEffectiveInstallmentStatus(inst)).toBe("Pending");
  });

  it("Pending with no agreed_invoice_date stays Pending", () => {
    const inst = baseInstallment({ status: "Pending", agreed_invoice_date: null });
    expect(getEffectiveInstallmentStatus(inst)).toBe("Pending");
  });

  it("non-Pending statuses pass through unchanged", () => {
    expect(getEffectiveInstallmentStatus(baseInstallment({ status: "Invoiced", agreed_invoice_date: dayOffset(-5) }))).toBe("Invoiced");
    expect(getEffectiveInstallmentStatus(baseInstallment({ status: "Completed", agreed_invoice_date: dayOffset(-5) }))).toBe("Completed");
    expect(getEffectiveInstallmentStatus(baseInstallment({ status: "Overdue", agreed_invoice_date: dayOffset(-5) }))).toBe("Overdue");
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

  it("stays 'red' when the payment date passed and it was never invoiced (Pending, unpaid = overdue)", () => {
    const installments = [
      baseInstallment({ status: "Pending", agreed_payment_date: dayOffset(-1) }),
    ];
    expect(computeBillingIndicator(installments)).toBe("red");
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
