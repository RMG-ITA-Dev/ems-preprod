import { describe, it, expect } from "vitest";
import {
  addBusinessDays,
  distributePercentages,
  computeAmount,
  computePaymentDate,
  detectOverdue,
  isAlertDue,
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

function dayOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
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
