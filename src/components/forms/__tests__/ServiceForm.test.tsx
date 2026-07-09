import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";
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

// Hoisted so the reference is available inside the vi.mock factory
const updateMutateAsync = vi.hoisted(() => vi.fn());
const mockAllActivities = vi.hoisted(() => ({ current: [] as any[] }));

vi.mock("@/hooks/mutations", () => ({
  useCreateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateService: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useAllActivityCodes: () => ({ data: mockAllActivities.current }),
}));

import { ServiceForm } from "@/components/forms/ServiceForm";
import type { Service } from "@/hooks/useEmsData";

const editService: Service = {
  service_id: "s3",
  name: "Tax",
  code: 3,
  abbreviation: "TAX",
  allows_rates_activities: true,
  is_active: true,
  created_at: "",
};

const usedCodes_0_to_4 = [0, 1, 2, 3, 4];

describe("ServiceForm — Zod schema (0625-149 / 0513-114)", () => {
  const abbrevSchema = z
    .string()
    .regex(/^[A-Z]{2,5}$/)
    .or(z.literal(""));

  const formSchema = z.object({
    name: z.string().min(1, "Name is required"),
    code: z.number().int().min(0).max(9),
    abbreviation: abbrevSchema,
    allows_rates_activities: z.boolean(),
    is_active: z.boolean(),
  });

  it("accepts a valid service", () => {
    const r = formSchema.safeParse({ name: "Tax", code: 3, abbreviation: "TAX", allows_rates_activities: true, is_active: true });
    expect(r.success).toBe(true);
  });

  it("accepts empty abbreviation (optional)", () => {
    const r = formSchema.safeParse({ name: "Tax", code: 3, abbreviation: "", allows_rates_activities: true, is_active: true });
    expect(r.success).toBe(true);
  });

  it("rejects abbreviation with lowercase letters", () => {
    const r = abbrevSchema.safeParse("Aud");
    expect(r.success).toBe(false);
  });

  it("rejects abbreviation shorter than 2 chars", () => {
    const r = abbrevSchema.safeParse("A");
    expect(r.success).toBe(false);
  });

  it("rejects abbreviation longer than 5 chars", () => {
    const r = abbrevSchema.safeParse("AUDITS");
    expect(r.success).toBe(false);
  });

  it("accepts AUD (3 uppercase letters)", () => {
    const r = abbrevSchema.safeParse("AUD");
    expect(r.success).toBe(true);
  });

  it("rejects code=10 (outside 0-9)", () => {
    const r = formSchema.safeParse({ name: "X", code: 10, abbreviation: "", allows_rates_activities: false, is_active: true });
    expect(r.success).toBe(false);
  });

  it("rejects code=-1", () => {
    const r = formSchema.safeParse({ name: "X", code: -1, abbreviation: "", allows_rates_activities: false, is_active: true });
    expect(r.success).toBe(false);
  });

  it("rejects empty name", () => {
    const r = formSchema.safeParse({ name: "", code: 5, abbreviation: "", allows_rates_activities: false, is_active: true });
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

describe("ServiceForm — available-digit picker (0625-149)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows only unused digits (5–9) and defaults to 5 when codes 0–4 are taken", () => {
    render(
      <ServiceForm open={true} onOpenChange={vi.fn()} service={null} usedCodes={usedCodes_0_to_4} />
    );
    const trigger = screen.getByTestId("code-select-trigger");
    // Default value rendered in the trigger button should be "5"
    expect(trigger).toHaveTextContent("5");
  });

  it("shows no-digits message and disables submit when all 10 codes are taken", () => {
    render(
      <ServiceForm
        open={true}
        onOpenChange={vi.fn()}
        service={null}
        usedCodes={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}
      />
    );
    expect(screen.getByTestId("no-digits-message")).toBeInTheDocument();
    expect(screen.getByText("service.noDigitsAvailable")).toBeInTheDocument();
    const submitBtn = screen.getByRole("button", { name: "service.createService" });
    expect(submitBtn).toBeDisabled();
  });
});

describe("ServiceForm — deactivation confirmation (0625-149)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMutateAsync.mockResolvedValue({});
  });

  it("shows AlertDialog before calling mutateAsync when active→inactive", async () => {
    const user = userEvent.setup();
    render(
      <ServiceForm open={true} onOpenChange={vi.fn()} service={editService} usedCodes={usedCodes_0_to_4} />
    );

    // Toggle is_active switch off (active → inactive)
    const activeSwitch = screen.getByRole("switch", { name: /common.active/i });
    await user.click(activeSwitch);

    // Submit the form
    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    // AlertDialog should appear — mutateAsync must NOT have been called yet
    expect(screen.getByText("service.deactivateConfirmTitle")).toBeInTheDocument();
    expect(updateMutateAsync).not.toHaveBeenCalled();

    // Confirm the deactivation
    await user.click(screen.getByRole("button", { name: "common.confirm" }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce());
  });
});

describe("ServiceForm — abbreviation field (0513-114)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMutateAsync.mockResolvedValue({});
    mockAllActivities.current = [];
  });

  it("renders abbreviation input", () => {
    render(
      <ServiceForm open={true} onOpenChange={vi.fn()} service={null} usedCodes={usedCodes_0_to_4} />
    );
    expect(screen.getByTestId("service-abbreviation-input")).toBeInTheDocument();
  });

  it("pre-fills abbreviation from the existing service in edit mode", () => {
    render(
      <ServiceForm open={true} onOpenChange={vi.fn()} service={editService} usedCodes={usedCodes_0_to_4} />
    );
    const abbrevInput = screen.getByTestId("service-abbreviation-input") as HTMLInputElement;
    expect(abbrevInput.value).toBe("TAX");
  });

  it("uppercases abbreviation input on change", async () => {
    const user = userEvent.setup();
    render(
      <ServiceForm open={true} onOpenChange={vi.fn()} service={null} usedCodes={usedCodes_0_to_4} />
    );
    const abbrevInput = screen.getByTestId("service-abbreviation-input");
    await user.type(abbrevInput, "con");
    expect((abbrevInput as HTMLInputElement).value).toBe("CON");
  });

  it("includes abbreviation in updateMutation payload on save", async () => {
    const user = userEvent.setup();
    render(
      <ServiceForm open={true} onOpenChange={vi.fn()} service={editService} usedCodes={usedCodes_0_to_4} />
    );

    // Clear and retype abbreviation
    const abbrevInput = screen.getByTestId("service-abbreviation-input");
    await user.clear(abbrevInput);
    await user.type(abbrevInput, "AUD");

    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() =>
      expect(updateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ abbreviation: "AUD" }),
        })
      )
    );
  });

  it("blocks clearing the abbreviation when the service has linked activities (R21)", async () => {
    const user = userEvent.setup();
    mockAllActivities.current = [
      { activity_id: "a1", service_id: "s3", is_active: true, activity_code: "TAX-A1", description: "x", entity_type: "A" },
    ];
    render(
      <ServiceForm open={true} onOpenChange={vi.fn()} service={editService} usedCodes={usedCodes_0_to_4} />
    );

    await user.clear(screen.getByTestId("service-abbreviation-input"));
    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    // Update must be blocked and the error surfaced.
    expect(await screen.findByText("service.abbreviationRequiredLinked")).toBeInTheDocument();
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it("allows clearing the abbreviation when the service has NO linked activities", async () => {
    const user = userEvent.setup();
    mockAllActivities.current = [];
    render(
      <ServiceForm open={true} onOpenChange={vi.fn()} service={editService} usedCodes={usedCodes_0_to_4} />
    );

    await user.clear(screen.getByTestId("service-abbreviation-input"));
    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() =>
      expect(updateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ abbreviation: null }) })
      )
    );
  });
});
