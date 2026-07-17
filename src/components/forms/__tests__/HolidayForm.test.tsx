import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * BUG 0526-122: HolidayForm gains an oficina selector (Todas/La Paz/Santa Cruz),
 * reusing the same component/options as EngagementForm.tsx.
 */

// Radix UI uses ResizeObserver and pointer events not supported by jsdom.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, _opts?: object) => k, i18n: { language: "en" } }),
}));

const createMutateAsync = vi.hoisted(() => vi.fn());
const updateMutateAsync = vi.hoisted(() => vi.fn());
const deleteMutateAsync = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/mutations/useHolidayMutations", () => ({
  useCreateHoliday: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateHoliday: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useDeleteHoliday: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1" } }),
}));

import { HolidayForm } from "@/components/forms/HolidayForm";
import type { Holiday } from "@/hooks/useHolidays";

const laPazHoliday: Holiday = {
  holiday_id: "h-lp",
  holiday_date: "2026-07-16",
  holiday_name: "Aniversario del Departamento de La Paz",
  oficina: 1,
  created_by: "staff-1",
  created_at: "",
  updated_at: "",
};

// Helper: change Radix UI Select via the hidden native <select> element.
function selectNativeValue(value: string) {
  const nativeSelect = document.querySelector('select[aria-hidden="true"]') as HTMLSelectElement | null;
  if (!nativeSelect) throw new Error("Radix native select not found in document");
  fireEvent.change(nativeSelect, { target: { value } });
}

describe("HolidayForm — oficina (BUG 0526-122)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("defaults oficina to Todas (0) when creating a new holiday", () => {
    render(<HolidayForm open={true} onOpenChange={vi.fn()} holiday={null} />);
    const nativeSelect = document.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
    expect(nativeSelect.value).toBe("0");
  });

  it("hydrates the oficina selector from the existing holiday when editing", () => {
    render(<HolidayForm open={true} onOpenChange={vi.fn()} holiday={laPazHoliday} />);
    const nativeSelect = document.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
    expect(nativeSelect.value).toBe("1");
  });

  it("create: submits oficina in the payload after selecting La Paz", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue({});
    render(<HolidayForm open={true} onOpenChange={vi.fn()} holiday={null} />);

    // Pick a date via the Calendar popover (holiday_date is required).
    // The button's accessible name comes from the associated FormLabel, not its own text.
    await user.click(screen.getByRole("button", { name: /holiday\.date/ }));
    const dayCells = screen.getAllByRole("gridcell", { name: "15" });
    await user.click(dayCells[0]);

    await user.type(screen.getByPlaceholderText("holiday.name"), "Feriado de Prueba");
    selectNativeValue("1");

    await user.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ holiday_name: "Feriado de Prueba", oficina: 1, created_by: "staff-1" })
      )
    );
  });

  it("edit: submits the updated oficina in the payload", async () => {
    const user = userEvent.setup();
    updateMutateAsync.mockResolvedValue({});
    render(<HolidayForm open={true} onOpenChange={vi.fn()} holiday={laPazHoliday} />);

    selectNativeValue("2");
    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() =>
      expect(updateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ holiday_id: "h-lp", oficina: 2 })
      )
    );
  });
});
