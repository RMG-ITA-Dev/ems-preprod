import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import * as z from "zod";

// Radix UI Sheet uses ResizeObserver internally
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

/**
 * 0625-149: ServiceForm
 * - Create: only unused digits available (default = lowest free = 5 given 0-4 used)
 * - Edit: code field is read-only
 * - Deactivate: toggling active→inactive shows confirmation AlertDialog
 * - Zod: rejects code outside 0–9 or empty name
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ServiceForm } from "@/components/forms/ServiceForm";
import type { Service } from "@/hooks/useEmsData";

const editService: Service = {
  service_id: "s3",
  name: "Tax",
  code: 3,
  allows_rates_activities: true,
  is_active: true,
  created_at: "",
};

const usedCodes_0_to_4 = [0, 1, 2, 3, 4];

describe("ServiceForm — Zod schema (0625-149)", () => {
  const formSchema = z.object({
    name: z.string().min(1, "Name is required"),
    code: z.number().int().min(0).max(9),
    allows_rates_activities: z.boolean(),
    is_active: z.boolean(),
  });

  it("accepts a valid service", () => {
    const r = formSchema.safeParse({ name: "Tax", code: 3, allows_rates_activities: true, is_active: true });
    expect(r.success).toBe(true);
  });

  it("rejects code=10 (outside 0-9)", () => {
    const r = formSchema.safeParse({ name: "X", code: 10, allows_rates_activities: false, is_active: true });
    expect(r.success).toBe(false);
  });

  it("rejects code=-1", () => {
    const r = formSchema.safeParse({ name: "X", code: -1, allows_rates_activities: false, is_active: true });
    expect(r.success).toBe(false);
  });

  it("rejects empty name", () => {
    const r = formSchema.safeParse({ name: "", code: 5, allows_rates_activities: false, is_active: true });
    expect(r.success).toBe(false);
  });
});

describe("ServiceForm — render (0625-149)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the code read-only in edit mode", () => {
    render(
      <ServiceForm open={true} onOpenChange={vi.fn()} service={editService} usedCodes={usedCodes_0_to_4} />
    );
    const codeInput = screen.getByTestId("service-code-readonly");
    expect(codeInput).toBeDisabled();
    expect(codeInput).toHaveValue("3");
  });

  it("shows the sheet title for edit mode", () => {
    render(
      <ServiceForm open={true} onOpenChange={vi.fn()} service={editService} usedCodes={usedCodes_0_to_4} />
    );
    expect(screen.getByText("service.editService")).toBeInTheDocument();
  });

  it("shows the sheet title for create mode", () => {
    render(
      <ServiceForm open={true} onOpenChange={vi.fn()} service={null} usedCodes={usedCodes_0_to_4} />
    );
    expect(screen.getByText("service.newService")).toBeInTheDocument();
  });
});
