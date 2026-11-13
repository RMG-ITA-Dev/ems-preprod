import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * 1028-218: IndustryForm edita `industries.status` ('active' | 'inactive').
 * - Alta: arranca en Activo.
 * - Edición: se hidrata con el valor guardado, así un cambio de nombre no reactiva una inactiva.
 * - El estado viaja siempre en el payload de create y update.
 */

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
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = vi.fn();
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const createMutateAsync = vi.hoisted(() => vi.fn());
const updateMutateAsync = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/mutations", () => ({
  useCreateIndustry: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateIndustry: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useDeleteIndustry: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { IndustryForm } from "@/components/forms/IndustryForm";
import type { Industry } from "@/hooks/useEmsData";

const activeIndustry: Industry = {
  industry_id: "i1",
  industry_name: "Banking",
  fiscal_year_end: "December 31",
  status: "active",
};

const inactiveIndustry: Industry = {
  industry_id: "i2",
  industry_name: "(RETIRADO) Chemicals",
  fiscal_year_end: "March 31",
  status: "inactive",
};

const statusSelect = () => screen.getByRole("combobox", { name: /common\.status/ });

async function chooseStatus(user: ReturnType<typeof userEvent.setup>, option: "status.active" | "status.inactive") {
  await user.click(statusSelect());
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("IndustryForm — status (1028-218)", () => {
  beforeEach(() => {
    createMutateAsync.mockReset().mockResolvedValue({});
    updateMutateAsync.mockReset().mockResolvedValue({});
  });

  it("create: defaults to active and submits status 'active'", async () => {
    const user = userEvent.setup();
    render(<IndustryForm open onOpenChange={vi.fn()} industry={null} />);

    expect(statusSelect()).toHaveTextContent("status.active");

    await user.type(screen.getByPlaceholderText("industry.placeholder"), "Mining");
    await user.click(screen.getByRole("combobox", { name: /industry\.fiscalYearEnd/ }));
    await user.click(await screen.findByRole("option", { name: "December 31" }));
    await user.click(screen.getByRole("button", { name: "industry.createIndustry" }));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith({
        industry_name: "Mining",
        fiscal_year_end: "December 31",
        status: "active",
      }),
    );
  });

  it("create: choosing inactive submits status 'inactive'", async () => {
    const user = userEvent.setup();
    render(<IndustryForm open onOpenChange={vi.fn()} industry={null} />);

    await user.type(screen.getByPlaceholderText("industry.placeholder"), "Mining");
    await user.click(screen.getByRole("combobox", { name: /industry\.fiscalYearEnd/ }));
    await user.click(await screen.findByRole("option", { name: "March 31" }));
    await chooseStatus(user, "status.inactive");
    await user.click(screen.getByRole("button", { name: "industry.createIndustry" }));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith({
        industry_name: "Mining",
        fiscal_year_end: "March 31",
        status: "inactive",
      }),
    );
  });

  it("edit: an inactive industry stays inactive when only the name changes", async () => {
    const user = userEvent.setup();
    render(<IndustryForm open onOpenChange={vi.fn()} industry={inactiveIndustry} />);

    expect(statusSelect()).toHaveTextContent("status.inactive");

    const name = screen.getByPlaceholderText("industry.placeholder");
    await user.clear(name);
    await user.type(name, "Chemicals (old)");
    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() =>
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "i2",
        data: { industry_name: "Chemicals (old)", fiscal_year_end: "March 31", status: "inactive" },
      }),
    );
  });

  it("edit: active → inactive keeps name and fiscal year-end", async () => {
    const user = userEvent.setup();
    render(<IndustryForm open onOpenChange={vi.fn()} industry={activeIndustry} />);

    await chooseStatus(user, "status.inactive");
    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() =>
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "i1",
        data: { industry_name: "Banking", fiscal_year_end: "December 31", status: "inactive" },
      }),
    );
  });

  it("edit: inactive → active reactivates", async () => {
    const user = userEvent.setup();
    render(<IndustryForm open onOpenChange={vi.fn()} industry={inactiveIndustry} />);

    await chooseStatus(user, "status.active");
    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() =>
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "i2",
        data: { industry_name: "(RETIRADO) Chemicals", fiscal_year_end: "March 31", status: "active" },
      }),
    );
  });

  it("edit: a row without status is shown as active (DB default)", () => {
    const { status: _omit, ...withoutStatus } = activeIndustry;
    render(<IndustryForm open onOpenChange={vi.fn()} industry={withoutStatus as Industry} />);

    expect(statusSelect()).toHaveTextContent("status.active");
  });

  it("reopening in create mode after an inactive industry resets status to active", () => {
    const { rerender } = render(<IndustryForm open onOpenChange={vi.fn()} industry={inactiveIndustry} />);
    expect(statusSelect()).toHaveTextContent("status.inactive");

    rerender(<IndustryForm open={false} onOpenChange={vi.fn()} industry={inactiveIndustry} />);
    rerender(<IndustryForm open onOpenChange={vi.fn()} industry={null} />);

    expect(statusSelect()).toHaveTextContent("status.active");
  });

  it("cancel submits no mutation", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<IndustryForm open onOpenChange={onOpenChange} industry={inactiveIndustry} />);

    await chooseStatus(user, "status.active");
    await user.click(screen.getByRole("button", { name: "common.cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });
});
