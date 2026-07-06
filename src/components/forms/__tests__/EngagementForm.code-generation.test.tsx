import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as z from "zod";
import { render, screen, fireEvent, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * BUG 0306-82: Auto-generate Engagement Code on Insert
 * Pure-logic tests + render-level tests that exercise the production component.
 */

// Polyfills for Radix UI Select, which calls APIs not implemented in jsdom
// (mirrors StaffHoursDetailDialog.test.tsx / EncargoTab.test.tsx).
if (typeof window !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => undefined;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
}
if (typeof global.ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  // Includes the client referenced by mockEngagement so the client Select can resolve a
  // matching SelectItem for full-submit tests (Radix Select can't retain a `value` that has
  // no corresponding item, which otherwise silently clears the field and fails validation).
  useClients: () => ({ data: [{ client_id: "client-1", client_legal_name: "Test Client", is_active: true }] }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partners: [],
    partnerOptions: [],
    managerOptions: [],
    allActiveStaff: [],
    hasPartnerCategory: true,
    hasManagerCategory: true,
  }),
}));

let mockUpdateMutateAsync = vi.fn();
vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

let mockRole: { isAdmin: boolean; isManager?: boolean; isPartner?: boolean } = { isAdmin: false };
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => mockRole,
}));

import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";

const mockEngagement: Engagement = {
  engagement_id:       "eng-test-1",
  client_id:           "client-1",
  engagement_name:     "Audit FY2027",
  engagement_code:     "2027.121.001",
  partner_id:          "staff-1",
  manager_id:          "staff-2",
  status:              "active",
  start_date:          "2026-10-01",
  end_date:            "2027-09-30",
  created_at:          "2026-05-22T00:00:00Z",
  work_order_required: true,
  activity_required:   true,
  is_internal:         false,
  approval_required:   true,
  oficina:             1,
  practica:            2,
  funcion:             1,
  anio_fiscal:         2027,
  fecha_cierre:        "2026-09-30",
  anio_fiscal_override: false,
  sqr_id:              null,
  encargado_id:        null,
  specialist_it_id:    null,
  specialist_tax_id:   null,
};

// Mirror the helpers from EngagementForm.tsx
const suggestFiscalYear = (): number => {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
};

// Mirror the Zod schema for the four new fields (Plan v3: oficina/practica accept 0, practica max=4, funcion 0-3)
const codeFieldsSchema = z.object({
  anio_fiscal: z.number().int().min(2020).max(2100, "Invalid fiscal year"),
  oficina:     z.number().int().min(0).max(2,   "Invalid office"),
  practica:    z.number().int().min(0).max(4,   "Invalid practice"),
  funcion:     z.number().int().min(0).max(3,   "Invalid function"),
});

describe("suggestFiscalYear (BUG 0306-82)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns currentYear + 1 when month is July (index 6) or later", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15"));
    expect(suggestFiscalYear()).toBe(2027);
  });

  it("returns currentYear when month is before July (index < 6)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30"));
    expect(suggestFiscalYear()).toBe(2026);
  });

  it("returns currentYear + 1 in October", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01"));
    expect(suggestFiscalYear()).toBe(2027);
  });

  it("returns currentYear in January", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-15"));
    expect(suggestFiscalYear()).toBe(2027);
  });
});

describe("Engagement create schema — new code-generation fields (BUG 0306-82)", () => {
  it("parses successfully with valid anio_fiscal, oficina, practica, and funcion", () => {
    const result = codeFieldsSchema.safeParse({
      anio_fiscal: 2027,
      oficina: 1,
      practica: 2,
      funcion: 1,
    });
    expect(result.success).toBe(true);
  });

  it("accepts oficina=0 (Ambos)", () => {
    const result = codeFieldsSchema.safeParse({ anio_fiscal: 2027, oficina: 0, practica: 1, funcion: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts practica=0 (Firmwide)", () => {
    const result = codeFieldsSchema.safeParse({ anio_fiscal: 2027, oficina: 1, practica: 0, funcion: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts practica=4 (Growth & Strategy)", () => {
    const result = codeFieldsSchema.safeParse({ anio_fiscal: 2027, oficina: 1, practica: 4, funcion: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts funcion=0 (Administrativa)", () => {
    const result = codeFieldsSchema.safeParse({ anio_fiscal: 2027, oficina: 1, practica: 1, funcion: 0 });
    expect(result.success).toBe(true);
  });

  it("rejects when anio_fiscal is missing", () => {
    const result = codeFieldsSchema.safeParse({ oficina: 1, practica: 2, funcion: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects when oficina is missing", () => {
    const result = codeFieldsSchema.safeParse({ anio_fiscal: 2027, practica: 2, funcion: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects when practica is missing", () => {
    const result = codeFieldsSchema.safeParse({ anio_fiscal: 2027, oficina: 1, funcion: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects when funcion is missing", () => {
    const result = codeFieldsSchema.safeParse({ anio_fiscal: 2027, oficina: 1, practica: 2 });
    expect(result.success).toBe(false);
  });

  it("rejects oficina value outside 0-2", () => {
    const result = codeFieldsSchema.safeParse({ anio_fiscal: 2027, oficina: 3, practica: 1, funcion: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects practica value outside 0-4", () => {
    const result = codeFieldsSchema.safeParse({ anio_fiscal: 2027, oficina: 1, practica: 5, funcion: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects funcion value outside 0-3", () => {
    const result = codeFieldsSchema.safeParse({ anio_fiscal: 2027, oficina: 1, practica: 1, funcion: 4 });
    expect(result.success).toBe(false);
  });
});

describe("Edit payload shape (BUG 0306-82)", () => {
  it("update payload does not contain oficina, practica, funcion, or anio_fiscal", () => {
    const updatePayload = {
      engagement_name: "Updated Audit",
      client_id: "client-1",
      partner_id: "partner-1",
      manager_id: "manager-1",
      start_date: "2027-01-01",
      end_date: "2027-09-30",
      status: "active",
      work_order_required: true,
      activity_required: true,
      is_internal: false,
      approval_required: true,
    };
    expect(updatePayload).not.toHaveProperty("oficina");
    expect(updatePayload).not.toHaveProperty("practica");
    expect(updatePayload).not.toHaveProperty("funcion");
    expect(updatePayload).not.toHaveProperty("anio_fiscal");
  });
});

// BUG 0603-140: live code preview during creation. Mirrors the helper in
// EngagementForm.tsx and the server format FY.[oficina][practica][funcion].[correlativo]
// (migration 20260601100000, lines 113-115). The correlativo is unknown until insert (`---`).
const buildCodePreview = (fy?: number, of?: number, pr?: number, fn?: number): string | null => {
  if (fy == null || of == null || pr == null || fn == null) return null;
  return `${fy}.${of}${pr}${fn}.---`;
};

describe("Engagement code preview format (BUG 0603-140)", () => {
  it("builds the prefix with placeholder correlativo when all four fields are set", () => {
    expect(buildCodePreview(2027, 1, 2, 1)).toBe("2027.121.---");
  });

  it("treats 0 values (Ambos / Firmwide / Administrativa) as present", () => {
    expect(buildCodePreview(2027, 0, 0, 0)).toBe("2027.000.---");
  });

  it("concatenates the raw digits for max values", () => {
    expect(buildCodePreview(2027, 2, 4, 3)).toBe("2027.243.---");
  });

  it("returns null (incomplete) when oficina is missing", () => {
    expect(buildCodePreview(2027, undefined, 2, 1)).toBeNull();
  });

  it("returns null (incomplete) when fiscal year is missing", () => {
    expect(buildCodePreview(undefined, 1, 2, 1)).toBeNull();
  });
});

describe("EngagementForm render — create mode (BUG 0306-82 / 0603-140)", () => {
  it("EF-R1: renders the engagement code as a non-editable preview (no free-text code input)", () => {
    render(<EngagementForm />);
    // The code label is now shown in create mode (preview), not hidden.
    expect(screen.getByText("engagement.engagementCode")).toBeInTheDocument();
    // With no office/service/function selected yet, the incomplete state is shown.
    expect(screen.getByText("engagement.codePreviewIncomplete")).toBeInTheDocument();
    // And the helper text explaining the code is assigned on save.
    expect(screen.getByText("engagement.codePreviewHelp")).toBeInTheDocument();
    // The preview is not a writable input: no field shows an editable code value.
    expect(screen.queryByDisplayValue(/\d{4}\.\d{3}\./)).not.toBeInTheDocument();
  });

  it("EF-R8: create-mode preview block uses the semantic warning token (yellow highlight)", () => {
    render(<EngagementForm />);
    const preview = screen.getByTestId("engagement-code-preview");
    expect(preview).toHaveClass("bg-warning/10");
    expect(preview).toHaveClass("border-warning/30");
  });

  it("EF-R2: renders the Fiscal Year select label", () => {
    render(<EngagementForm />);
    expect(screen.getByText("engagement.anioFiscal *")).toBeInTheDocument();
  });

  it("EF-R3: renders the Office (Oficina) select label", () => {
    render(<EngagementForm />);
    expect(screen.getByText("engagement.oficina *")).toBeInTheDocument();
  });

  it("EF-R4: renders the Practice (Practica) select label", () => {
    render(<EngagementForm />);
    expect(screen.getByText("engagement.practica *")).toBeInTheDocument();
  });

  it("EF-R7: renders the Function (Funcion) select label", () => {
    render(<EngagementForm />);
    expect(screen.getByText("engagement.funcion *")).toBeInTheDocument();
  });
});

describe("EngagementForm render — edit mode (BUG 0306-82)", () => {
  it("EF-R5: renders engagement code as a disabled read-only input with a subtle warning accent", () => {
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.getByText("engagement.engagementCode")).toBeInTheDocument();
    const codeInput = screen.getByTestId("engagement-code-readonly");
    expect(codeInput).toBeDisabled();
    expect(codeInput).toHaveValue("2027.121.001");
    // Subtle accent (border only), not the full warning background used in create mode.
    expect(codeInput).toHaveClass("border-warning/40");
    expect(codeInput).not.toHaveClass("bg-warning/10");
  });

  it("EF-R6: fiscal year/office/practice/function labels are still present in edit mode", () => {
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.getByText("engagement.anioFiscal *")).toBeInTheDocument();
    expect(screen.getByText("engagement.oficina *")).toBeInTheDocument();
    expect(screen.getByText("engagement.practica *")).toBeInTheDocument();
    expect(screen.getByText("engagement.funcion *")).toBeInTheDocument();
  });
});

// BUG 0604-143: Año Fiscal is derived from a new closing-date field (now grouped with
// Fecha de Inicio/Fin in the "Fechas" section) instead of being manually selected,
// except for an admin-only override.
describe("EngagementForm — closing date drives Año Fiscal (BUG 0604-143)", () => {
  beforeEach(() => {
    mockRole = { isAdmin: false };
    mockUpdateMutateAsync = vi.fn().mockResolvedValue(undefined);
  });

  it("non-admin: renders the closing-date field and the fiscal-year helper text", () => {
    render(<EngagementForm />);
    expect(screen.getByText("engagement.closingDate *")).toBeInTheDocument();
    expect(screen.getByText("engagement.fiscalYearHelper")).toBeInTheDocument();
  });

  it("non-admin: Año Fiscal has no editable Select (derived, read-only only)", () => {
    render(<EngagementForm />);
    expect(screen.getByTestId("anio-fiscal-derived")).toBeInTheDocument();
    expect(screen.getByTestId("anio-fiscal-derived")).toBeDisabled();
    // The Select placeholder for a manual pick never renders for non-admin.
    expect(screen.queryByText("engagement.selectAnioFiscal")).not.toBeInTheDocument();
    expect(screen.queryByText("engagement.fiscalYearOverride")).not.toBeInTheDocument();
  });

  it("admin: sees the manual-override toggle in addition to the derived read-only value", () => {
    mockRole = { isAdmin: true };
    render(<EngagementForm />);
    expect(screen.getByText("engagement.fiscalYearOverride")).toBeInTheDocument();
    // Override is off by default: still read-only, no Select yet.
    expect(screen.getByTestId("anio-fiscal-derived")).toBeInTheDocument();
    expect(screen.queryByText("engagement.selectAnioFiscal")).not.toBeInTheDocument();
  });

  it("edit mode: non-privileged role cannot edit the closing date", () => {
    mockRole = { isAdmin: false, isManager: false, isPartner: false };
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.getByRole("combobox", { name: "engagement.closingDate *" })).toBeDisabled();
  });

  it("edit mode: Manager can edit the closing date", () => {
    mockRole = { isAdmin: false, isManager: true, isPartner: false };
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.getByRole("combobox", { name: "engagement.closingDate *" })).not.toBeDisabled();
  });

  // REVIEW FIX regression (0604-143 it.6): the DB update trigger (engagement_fiscal_year_update_guard.sql,
  // review it.5) requires admin whenever OLD.anio_fiscal_override is true, even if the submitted value is
  // unchanged. A Manager/Partner changing the closing date on an already-overridden engagement would send a
  // new fecha_cierre and get rejected server-side. The Select must be disabled for non-admins in that case
  // so the form never exposes an edit path that always fails.
  it("edit mode: Manager cannot edit the closing date when an admin override is active", () => {
    mockRole = { isAdmin: false, isManager: true, isPartner: false };
    const overriddenEngagement: Engagement = { ...mockEngagement, anio_fiscal_override: true };
    render(<EngagementForm engagement={overriddenEngagement} />);
    expect(screen.getByRole("combobox", { name: "engagement.closingDate *" })).toBeDisabled();
  });

  it("edit mode: Admin can still edit the closing date when an admin override is active", () => {
    mockRole = { isAdmin: true };
    const overriddenEngagement: Engagement = { ...mockEngagement, anio_fiscal_override: true };
    render(<EngagementForm engagement={overriddenEngagement} />);
    expect(screen.getByRole("combobox", { name: "engagement.closingDate *" })).not.toBeDisabled();
  });

  it("picking the Sep 30 2026 close derives FY2026 in the read-only Año Fiscal field", async () => {
    // Fix "today" to Jun 1 2026 so the dated dropdown window is deterministic. At that date the
    // window includes "September 30, 2026" (a future close within FY2026). shouldAdvanceTime
    // keeps real timers ticking so userEvent's internal waits don't hang.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 5, 1));
    const user = userEvent.setup({ delay: null });
    render(<EngagementForm />);
    const closingDateSelect = screen.getByRole("combobox", { name: "engagement.closingDate *" });
    await user.click(closingDateSelect);
    const option = await screen.findByRole("option", { name: "September 30, 2026" });
    await user.click(option);
    await waitFor(() => {
      expect(screen.getByTestId("anio-fiscal-derived")).toHaveValue("2026");
    });
    vi.useRealTimers();
  });

  it("picking the Dec 31 2026 close rolls into FY2027 and completes the code preview", async () => {
    // "Today" is Jun 1 2026; the window offers "December 31, 2026" which falls in FY2027
    // (Oct 2026 → Sep 2027).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 5, 1));
    const user = userEvent.setup({ delay: null });
    render(<EngagementForm />);
    await user.click(screen.getByRole("combobox", { name: "engagement.oficina *" }));
    await user.click(await screen.findByRole("option", { name: "engagement.oficina_laPaz" }));
    await user.click(screen.getByRole("combobox", { name: "engagement.practica *" }));
    await user.click(await screen.findByRole("option", { name: "engagement.practica_auditoria" }));
    await user.click(screen.getByRole("combobox", { name: "engagement.funcion *" }));
    await user.click(await screen.findByRole("option", { name: "engagement.funcion_cli" }));

    const closingDateSelect = screen.getByRole("combobox", { name: "engagement.closingDate *" });
    await user.click(closingDateSelect);
    await user.click(await screen.findByRole("option", { name: "December 31, 2026" }));

    await waitFor(() => {
      expect(screen.getByTestId("anio-fiscal-derived")).toHaveValue("2027");
    });
    expect(screen.getByTestId("engagement-code-preview")).toHaveTextContent("2027.111.");
    vi.useRealTimers();
  });

  it("admin: toggling the override reveals the manual Fiscal Year Select", async () => {
    const user = userEvent.setup({ delay: null });
    mockRole = { isAdmin: true };
    render(<EngagementForm />);
    // The override switch is the first switch in DOM order (it renders in the code-fields
    // grid, ahead of the admin-only Timesheet Policy switches further down the form).
    const toggle = screen.getAllByRole("switch")[0];
    await user.click(toggle);
    await waitFor(() => {
      expect(screen.queryByTestId("anio-fiscal-derived")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("combobox", { name: "engagement.anioFiscal *" })).toBeInTheDocument();
  });

  // REVIEW FIX regression (0604-143 it.1): a Manager/Partner saving an engagement that already
  // carries an admin override must not silently discard it. Before the fix, `overrideActive`
  // was gated on `isAdmin`, so any non-admin save forced anio_fiscal back to the derived value
  // and wrote anio_fiscal_override: false.
  it("edit mode: Manager saving an admin-overridden engagement preserves the override (does not recalculate)", async () => {
    const user = userEvent.setup({ delay: null });
    mockRole = { isAdmin: false, isManager: true, isPartner: false };
    const overriddenEngagement: Engagement = {
      ...mockEngagement,
      anio_fiscal: 2030,             // deliberately different from the FY that fecha_cierre (2026-09-30) would derive (2026)
      anio_fiscal_override: true,
    };
    render(<EngagementForm engagement={overriddenEngagement} />);

    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    const [[call]] = mockUpdateMutateAsync.mock.calls;
    expect(call.data.anio_fiscal_override).toBe(true);
    expect(call.data.anio_fiscal).toBe(2030);
  });
});
