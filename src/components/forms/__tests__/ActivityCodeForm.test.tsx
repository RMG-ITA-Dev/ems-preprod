import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import * as z from "zod";

// Radix UI uses ResizeObserver and pointer events not supported by jsdom.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

// Patch pointer capture so Radix Select doesn't throw in jsdom.
if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

/**
 * 0513-114: ActivityCodeForm
 * - With service: code is read-only; submit invokes create with service_id/entity_type, not typed code.
 * - Without service: code is editable, max 10 chars (accepts AUD-A3, 6 chars).
 * - Service-linked edit: shows deactivate button, not delete.
 * - Legacy edit: shows delete button.
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, _opts?: object) => k, i18n: { language: "en" } }),
}));

const createMutateAsync = vi.hoisted(() => vi.fn());
const deactivateMutateAsync = vi.hoisted(() => vi.fn());
const reactivateMutateAsync = vi.hoisted(() => vi.fn());
const deleteMutateAsync = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/mutations", () => ({
  useCreateActivityCode: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateActivityCode: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteActivityCode: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
  useDeactivateServiceActivity: () => ({ mutateAsync: deactivateMutateAsync, isPending: false }),
  useReactivateServiceActivity: () => ({ mutateAsync: reactivateMutateAsync, isPending: false }),
}));

const mockServices = [
  { service_id: "s1", name: "Auditoría", code: 1, abbreviation: "AUD", allows_rates_activities: true, is_active: true, created_at: "" },
  { service_id: "s2", name: "Consultoría", code: 2, abbreviation: "CON", allows_rates_activities: true, is_active: true, created_at: "" },
];

vi.mock("@/hooks/useEmsData", () => ({
  useServices: () => ({ data: mockServices }),
}));

import { ActivityCodeForm } from "@/components/forms/ActivityCodeForm";
import type { ActivityCode } from "@/hooks/useEmsData";

const legacyActivity: ActivityCode = {
  activity_id: "act-legacy",
  activity_code: "100-PLA",
  description: "Planning",
  is_active: true,
  service_id: null,
  entity_type: "A",
};

const linkedActivity: ActivityCode = {
  activity_id: "act-linked",
  activity_code: "AUD-A1",
  description: "Audit Planning",
  is_active: true,
  service_id: "s1",
  entity_type: "A",
  service: { service_id: "s1", name: "Auditoría", abbreviation: "AUD", code: 1, allows_rates_activities: true, is_active: true, created_at: "" },
};

const inactiveLinkedActivity: ActivityCode = {
  activity_id: "act-linked-inactive",
  activity_code: "AUD-AX",
  description: "Old Step",
  is_active: false,
  service_id: "s1",
  entity_type: "A",
  service: { service_id: "s1", name: "Auditoría", abbreviation: "AUD", code: 1, allows_rates_activities: true, is_active: true, created_at: "" },
};

// Helper: change Radix UI Select via the hidden native <select> element.
// The SheetContent is a Radix portal rendered into document.body, so we must
// query document rather than the render container.
function selectNativeValue(value: string) {
  const nativeSelect = document.querySelector('select[aria-hidden="true"]') as HTMLSelectElement | null;
  if (!nativeSelect) throw new Error("Radix native select not found in document");
  fireEvent.change(nativeSelect, { target: { value } });
}

// ── Zod schema tests ──────────────────────────────────────────────────────

describe("ActivityCodeForm — Zod schema (0513-114)", () => {
  const schema = z.object({
    activity_code: z.string().max(10, "Max 10 characters"),
    description: z.string().min(1, "Description is required"),
    is_active: z.boolean(),
    service_id: z.string().nullable(),
  });

  it("accepts AUD-A3 (6 chars) as activity_code", () => {
    const r = schema.safeParse({ activity_code: "AUD-A3", description: "Audit Step 3", is_active: true, service_id: null });
    expect(r.success).toBe(true);
  });

  it("rejects activity_code longer than 10 chars", () => {
    const r = schema.safeParse({ activity_code: "12345678901", description: "Too long", is_active: true, service_id: null });
    expect(r.success).toBe(false);
  });

  it("rejects empty description", () => {
    const r = schema.safeParse({ activity_code: "AUD-A1", description: "", is_active: true, service_id: null });
    expect(r.success).toBe(false);
  });

  it("accepts null service_id (legacy activity)", () => {
    const r = schema.safeParse({ activity_code: "100-PLA", description: "Planning", is_active: true, service_id: null });
    expect(r.success).toBe(true);
  });
});

// ── New activity (create) ─────────────────────────────────────────────────

describe("ActivityCodeForm — create (0513-114)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows service selector when creating a new activity", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={null} />);
    expect(screen.getByTestId("activity-service-select")).toBeInTheDocument();
  });

  it("code field is editable (no readonly testid) when no service is selected", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={null} />);
    expect(screen.queryByTestId("activity-code-readonly")).not.toBeInTheDocument();
  });

  it("code field becomes read-only after selecting a service via native select", async () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={null} />);

    selectNativeValue("s1");

    await waitFor(() =>
      expect(screen.getByTestId("activity-code-readonly")).toBeInTheDocument()
    );
    expect(screen.getByTestId("activity-code-readonly")).toBeDisabled();
  });

  it("submit calls createMutation with service_id/entity_type (not typed code) when service selected", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue({});

    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={null} />);

    // Select a service via native select (avoids jsdom pointer-capture issue).
    selectNativeValue("s1");

    await waitFor(() => expect(screen.getByTestId("activity-code-readonly")).toBeInTheDocument());

    // Fill description
    const descInput = screen.getByPlaceholderText("e.g., Planning");
    await user.type(descInput, "Audit Step");

    // Submit
    await user.click(screen.getByRole("button", { name: "activity.createActivity" }));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          service_id: "s1",
          entity_type: "A",
          description: "Audit Step",
        })
      )
    );
  });

  it("submit does NOT include activity_code in the payload when service is selected", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue({});

    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={null} />);

    selectNativeValue("s1");
    await waitFor(() => expect(screen.getByTestId("activity-code-readonly")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("e.g., Planning"), "Review");
    await user.click(screen.getByRole("button", { name: "activity.createActivity" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ activity_code: expect.any(String) })
    );
  });
});

// ── Edit service-linked activity ──────────────────────────────────────────

describe("ActivityCodeForm — edit service-linked (0513-114)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows deactivate button (not delete) for a service-linked activity", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={linkedActivity} />);
    expect(screen.getByTestId("deactivate-button")).toBeInTheDocument();
    // The delete button (heredada path) must not appear
    expect(screen.queryByRole("button", { name: /common\.delete/i })).not.toBeInTheDocument();
  });

  it("code is read-only and shows existing code for a linked activity", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={linkedActivity} />);
    const codeInput = screen.getByTestId("activity-code-readonly") as HTMLInputElement;
    expect(codeInput).toBeDisabled();
    expect(codeInput.value).toBe("AUD-A1");
  });

  it("does not show the service selector in edit mode", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={linkedActivity} />);
    expect(screen.queryByTestId("activity-service-select")).not.toBeInTheDocument();
  });
});

// ── Reactivate inactive service-linked activity ───────────────────────────

describe("ActivityCodeForm — reactivate inactive service-linked (0513-114)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows activate button (not deactivate) for an inactive linked activity", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={inactiveLinkedActivity} />);
    expect(screen.getByTestId("activate-button")).toBeInTheDocument();
    expect(screen.queryByTestId("deactivate-button")).not.toBeInTheDocument();
  });

  it("confirming activate calls the reactivate mutation with the activity id", async () => {
    const user = userEvent.setup();
    reactivateMutateAsync.mockResolvedValue({});

    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={inactiveLinkedActivity} />);

    await user.click(screen.getByTestId("activate-button"));
    // AlertDialog action button (label = activity.activate).
    const confirmButtons = await screen.findAllByRole("button", { name: "activity.activate" });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(reactivateMutateAsync).toHaveBeenCalledWith("act-linked-inactive")
    );
  });

  it("active linked activity still shows deactivate (not activate)", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={linkedActivity} />);
    expect(screen.getByTestId("deactivate-button")).toBeInTheDocument();
    expect(screen.queryByTestId("activate-button")).not.toBeInTheDocument();
  });
});

// ── Edit legacy (heredada) activity ──────────────────────────────────────

describe("ActivityCodeForm — edit legacy (0513-114)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows delete button (not deactivate) for a legacy activity", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={legacyActivity} />);
    expect(screen.queryByTestId("deactivate-button")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /common\.delete/i })).toBeInTheDocument();
  });

  it("code field is editable for legacy activity in edit mode", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={legacyActivity} />);
    expect(screen.queryByTestId("activity-code-readonly")).not.toBeInTheDocument();
  });

  it("shows the is_active toggle for legacy activities", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={legacyActivity} />);
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });
});
