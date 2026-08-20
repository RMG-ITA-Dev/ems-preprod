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
 * 0817-177: ActivityCodeForm — every activity belongs to a práctica.
 * - Every activity is service-linked: code is always read-only/auto-generated.
 * - Create (free selector): práctica required, no "Global" option.
 * - Create (lockService): práctica fixed/read-only, pre-selected from the
 *   unified Settings tab's shared selector.
 * - Edit: práctica always read-only; deactivate/reactivate preserved.
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, _opts?: object) => k, i18n: { language: "en" } }),
}));

const createMutateAsync = vi.hoisted(() => vi.fn());
const updateMutateAsync = vi.hoisted(() => vi.fn());
const deactivateMutateAsync = vi.hoisted(() => vi.fn());
const reactivateMutateAsync = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/mutations", () => ({
  useCreateActivityCode: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateActivityCode: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useDeactivateServiceActivity: () => ({ mutateAsync: deactivateMutateAsync, isPending: false }),
  useReactivateServiceActivity: () => ({ mutateAsync: reactivateMutateAsync, isPending: false }),
}));

const mockServices = [
  { service_id: "s1", name: "Auditoría", code: 1, abbreviation: "AUD", allows_rates_activities: true, is_active: true, created_at: "" },
  { service_id: "s2", name: "Consultoría", code: 2, abbreviation: "CON", allows_rates_activities: true, is_active: true, created_at: "" },
];

const mockAllActivities = vi.hoisted(() => ({ current: [] as any[] }));

vi.mock("@/hooks/useEmsData", () => ({
  useServices: () => ({ data: mockServices }),
  useAllActivityCodes: () => ({ data: mockAllActivities.current }),
}));

import { ActivityCodeForm } from "@/components/forms/ActivityCodeForm";
import type { ActivityCode } from "@/hooks/useEmsData";

const linkedActivity: ActivityCode = {
  activity_id: "act-linked",
  activity_code: "AUD-A1",
  description: "Audit Planning",
  is_active: true,
  service_id: "s1",
  entity_type: "A",
  service: { service_id: "s1", name: "Auditoría", abbreviation: "AUD", code: 1, allows_rates_activities: true, is_active: true, created_at: "" },
};

// 0817-177 (review follow-up): one of the 8 legacy codes backfilled to a
// práctica by the require-practice migration. Predates the {abrev}-A{n}
// ordinal scheme, so deactivate_service_activity rejects it server-side.
const legacyActivity: ActivityCode = {
  activity_id: "act-legacy-adm",
  activity_code: "ADM",
  description: "Administration",
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

describe("ActivityCodeForm — Zod schema (0817-177)", () => {
  const schema = z.object({
    description: z.string().min(1, "Description is required"),
    service_id: z.string().min(1, "validation.categoryServiceRequired"),
  });

  it("rejects an empty service_id (práctica is required)", () => {
    const r = schema.safeParse({ description: "Audit Step 3", service_id: "" });
    expect(r.success).toBe(false);
  });

  it("accepts a non-empty service_id", () => {
    const r = schema.safeParse({ description: "Audit Step 3", service_id: "s1" });
    expect(r.success).toBe(true);
  });

  it("rejects empty description", () => {
    const r = schema.safeParse({ description: "", service_id: "s1" });
    expect(r.success).toBe(false);
  });
});

// ── New activity — free selector (no serviceId/lockService prop) ──────────

describe("ActivityCodeForm — create, free selector (0817-177)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the práctica selector when creating without a locked service", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={null} />);
    expect(screen.getByTestId("activity-service-select")).toBeInTheDocument();
    expect(screen.queryByTestId("activity-service-readonly")).not.toBeInTheDocument();
  });

  it("there is no 'Global'/unset option in the selector", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={null} />);
    expect(screen.queryByText("activity.global")).not.toBeInTheDocument();
  });

  it("code field is always read-only, even before a práctica is selected", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={null} />);
    expect(screen.getByTestId("activity-code-readonly")).toBeDisabled();
  });

  it("submit calls createMutation with service_id/entity_type after selecting a práctica", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue({});

    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={null} />);

    selectNativeValue("s1");
    await waitFor(() => expect(screen.getByTestId("activity-code-readonly")).toHaveValue("AUD-A?"));

    await user.type(screen.getByPlaceholderText("activity.descriptionPlaceholder"), "Audit Step");
    await user.click(screen.getByRole("button", { name: "activity.createActivity" }));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ service_id: "s1", entity_type: "A", description: "Audit Step" })
      )
    );
  });
});

// ── New activity — lockService (unified Settings tab, 0817-177) ──────────

describe("ActivityCodeForm — create with lockService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the práctica read-only and pre-selected, without a selector", async () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={null} serviceId="s1" lockService />);

    expect(screen.queryByTestId("activity-service-select")).not.toBeInTheDocument();
    const readonly = screen.getByTestId("activity-service-readonly") as HTMLInputElement;
    expect(readonly).toBeDisabled();
    await waitFor(() => expect(readonly.value).toContain("Auditoría"));
  });

  it("code is already read-only/auto-generated preview without touching anything", async () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={null} serviceId="s1" lockService />);
    await waitFor(() => expect(screen.getByTestId("activity-code-readonly")).toHaveValue("AUD-A?"));
  });

  it("submit calls createMutation with the locked service_id", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue({});

    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={null} serviceId="s1" lockService />);
    await waitFor(() => expect(screen.getByTestId("activity-code-readonly")).toHaveValue("AUD-A?"));

    await user.type(screen.getByPlaceholderText("activity.descriptionPlaceholder"), "Audit Step");
    await user.click(screen.getByRole("button", { name: "activity.createActivity" }));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ service_id: "s1", entity_type: "A", description: "Audit Step" })
      )
    );
  });
});

// ── Soft recommendation (≥ 9 activities) ──────────────────────────────────

describe("ActivityCodeForm — recommended max hint (0513-114)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAllActivities.current = [];
  });

  it("does NOT show the hint when the service has fewer than 9 active activities", async () => {
    mockAllActivities.current = [
      { activity_id: "a1", service_id: "s1", is_active: true, activity_code: "AUD-A1", description: "x", entity_type: "A" },
    ];
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={null} />);
    selectNativeValue("s1");
    await waitFor(() => expect(screen.getByTestId("activity-code-readonly")).toHaveValue("AUD-A?"));
    expect(screen.queryByTestId("activity-recommended-max")).not.toBeInTheDocument();
  });

  it("shows the non-blocking hint when the service already has 9 active activities, submit still works", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue({});
    mockAllActivities.current = Array.from({ length: 9 }, (_, i) => ({
      activity_id: `a${i + 1}`,
      service_id: "s1",
      is_active: true,
      activity_code: `AUD-A${i + 1}`,
      description: `desc ${i + 1}`,
      entity_type: "A",
    }));

    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={null} />);
    selectNativeValue("s1");
    await waitFor(() => expect(screen.getByTestId("activity-recommended-max")).toBeInTheDocument());

    // The create button is still enabled and works.
    await user.type(screen.getByPlaceholderText("activity.descriptionPlaceholder"), "Tenth activity");
    await user.click(screen.getByRole("button", { name: "activity.createActivity" }));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ service_id: "s1", entity_type: "A", description: "Tenth activity" })
      )
    );
  });
});

// ── Edit service-linked activity (every activity, since 0817-177) ────────

describe("ActivityCodeForm — edit (0817-177)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows deactivate button for an active activity", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={linkedActivity} />);
    expect(screen.getByTestId("deactivate-button")).toBeInTheDocument();
    expect(screen.queryByTestId("activate-button")).not.toBeInTheDocument();
  });

  it("code is read-only and shows the existing code", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={linkedActivity} />);
    const codeInput = screen.getByTestId("activity-code-readonly") as HTMLInputElement;
    expect(codeInput).toBeDisabled();
    expect(codeInput.value).toBe("AUD-A1");
  });

  it("shows the práctica read-only (immutable), not a selector", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={linkedActivity} />);
    expect(screen.queryByTestId("activity-service-select")).not.toBeInTheDocument();
    const readonly = screen.getByTestId("activity-service-readonly") as HTMLInputElement;
    expect(readonly).toBeDisabled();
    expect(readonly.value).toContain("Auditoría");
  });

  it("submit only sends description (práctica never included in the update payload)", async () => {
    const user = userEvent.setup();
    updateMutateAsync.mockResolvedValue({});

    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={linkedActivity} />);
    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    const payload = updateMutateAsync.mock.calls[0][0];
    expect(payload.data).toEqual({ description: "Audit Planning" });
    expect(payload.data).not.toHaveProperty("service_id");
  });

  it("hides the deactivate button for a legacy activity code (review 0817-177)", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={legacyActivity} />);
    expect(screen.queryByTestId("deactivate-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("activate-button")).not.toBeInTheDocument();
  });

  it("still allows saving the description of a legacy activity code", async () => {
    const user = userEvent.setup();
    updateMutateAsync.mockResolvedValue({});

    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={legacyActivity} />);
    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0].data).toEqual({ description: "Administration" });
  });
});

// ── Reactivate inactive activity ──────────────────────────────────────────

describe("ActivityCodeForm — reactivate inactive (0513-114)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows activate button (not deactivate) for an inactive activity", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={inactiveLinkedActivity} />);
    expect(screen.getByTestId("activate-button")).toBeInTheDocument();
    expect(screen.queryByTestId("deactivate-button")).not.toBeInTheDocument();
  });

  it("confirming activate calls the reactivate mutation with the activity id", async () => {
    const user = userEvent.setup();
    reactivateMutateAsync.mockResolvedValue({});

    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={inactiveLinkedActivity} />);

    await user.click(screen.getByTestId("activate-button"));
    const confirmButtons = await screen.findAllByRole("button", { name: "activity.activate" });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(reactivateMutateAsync).toHaveBeenCalledWith("act-linked-inactive")
    );
  });

  it("active activity still shows deactivate (not activate)", () => {
    render(<ActivityCodeForm open={true} onOpenChange={vi.fn()} activityCode={linkedActivity} />);
    expect(screen.getByTestId("deactivate-button")).toBeInTheDocument();
    expect(screen.queryByTestId("activate-button")).not.toBeInTheDocument();
  });
});
