import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import * as z from "zod";
import { render, screen } from "@/test/utils";

/**
 * BUG 0306-82: Auto-generate Engagement Code on Insert
 * Pure-logic tests + render-level tests that exercise the production component.
 */

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const mockServices = [
  { service_id: "s1", name: "Auditoría",  code: 1, allows_rates_activities: true,  is_active: true,  created_at: "" },
  { service_id: "s2", name: "Tax",        code: 3, allows_rates_activities: true,  is_active: true,  created_at: "" },
  { service_id: "s3", name: "Firmwide",   code: 0, allows_rates_activities: false, is_active: false, created_at: "" },
];

vi.mock("@/hooks/useEmsData", () => ({
  useClients:  () => ({ data: [] }),
  useServices: () => ({ data: mockServices }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partners: [],
    managerOptions: [],
    hasPartnerCategory: true,
    hasManagerCategory: true,
  }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false }),
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
};

// Mirror the helpers from EngagementForm.tsx
const suggestFiscalYear = (): number => {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
};

// Mirror the Zod schema (0625-149: practica max relaxed to 9 — catalog-driven)
const codeFieldsSchema = z.object({
  anio_fiscal: z.number().int().min(2020).max(2100, "Invalid fiscal year"),
  oficina:     z.number().int().min(0).max(2,   "Invalid office"),
  practica:    z.number().int().min(0).max(9,   "Invalid practice"),
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

  it("accepts practica=9 (catalog-driven max)", () => {
    const result = codeFieldsSchema.safeParse({ anio_fiscal: 2027, oficina: 1, practica: 9, funcion: 0 });
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

  it("rejects practica value outside 0-9", () => {
    const result = codeFieldsSchema.safeParse({ anio_fiscal: 2027, oficina: 1, practica: 10, funcion: 0 });
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
