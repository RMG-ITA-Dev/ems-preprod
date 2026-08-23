import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

// Radix UI Sheet uses ResizeObserver internally
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

/**
 * 0602-136: TaxonomyForm
 * - Create/Edit: code is editable in both modes (unlike ServiceForm's read-only code)
 * - Zod: rejects code > 10 chars or a code already in usedCodes (case-insensitive,
 *   excluding the row currently being edited)
 * - Deactivate: toggling active→inactive shows confirmation AlertDialog
 * - Service selector defaults to "Global"
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useServices: () => ({ data: [] }),
}));

const updateMutateAsync = vi.hoisted(() => vi.fn());
const createMutateAsync = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/mutations", () => ({
  useCreateTaxonomy: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateTaxonomy: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));

import { TaxonomyForm } from "@/components/forms/TaxonomyForm";
import type { Taxonomy } from "@/hooks/useEmsData";

const editTaxonomy: Taxonomy = {
  taxonomy_id: "t2",
  code: "AA1007",
  name: "Continued audit",
  practica_id: null,
  is_active: true,
  created_at: "",
};

const usedCodes = ["AA1006", "AA1007"];

describe("TaxonomyForm — render (0602-136)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the sheet title for create mode", () => {
    render(<TaxonomyForm open={true} onOpenChange={vi.fn()} taxonomy={null} usedCodes={usedCodes} />);
    expect(screen.getByText("taxonomy.newTaxonomy")).toBeInTheDocument();
  });

  it("shows the sheet title for edit mode", () => {
    render(<TaxonomyForm open={true} onOpenChange={vi.fn()} taxonomy={editTaxonomy} usedCodes={usedCodes} />);
    expect(screen.getByText("taxonomy.editTaxonomy")).toBeInTheDocument();
  });

  it("code input is editable (not disabled) in create mode", () => {
    render(<TaxonomyForm open={true} onOpenChange={vi.fn()} taxonomy={null} usedCodes={usedCodes} />);
    expect(screen.getByPlaceholderText("taxonomy.codePlaceholder")).not.toBeDisabled();
  });

  it("code input is editable (not disabled) in edit mode", () => {
    render(<TaxonomyForm open={true} onOpenChange={vi.fn()} taxonomy={editTaxonomy} usedCodes={usedCodes} />);
    const codeInput = screen.getByPlaceholderText("taxonomy.codePlaceholder");
    expect(codeInput).not.toBeDisabled();
    expect(codeInput).toHaveValue("AA1007");
  });

  it("code input has maxLength 10", () => {
    render(<TaxonomyForm open={true} onOpenChange={vi.fn()} taxonomy={null} usedCodes={usedCodes} />);
    expect(screen.getByPlaceholderText("taxonomy.codePlaceholder")).toHaveAttribute("maxLength", "10");
  });
});

describe("TaxonomyForm — code uniqueness (0602-136)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMutateAsync.mockResolvedValue({});
    updateMutateAsync.mockResolvedValue({});
  });

  it("rejects a duplicate code (case-insensitive) on create", async () => {
    const user = userEvent.setup();
    render(<TaxonomyForm open={true} onOpenChange={vi.fn()} taxonomy={null} usedCodes={usedCodes} />);

    await user.type(screen.getByPlaceholderText("taxonomy.codePlaceholder"), "aa1006");
    await user.type(screen.getByPlaceholderText("taxonomy.namePlaceholder"), "Duplicate");
    await user.click(screen.getByRole("button", { name: "taxonomy.createTaxonomy" }));

    await waitFor(() => expect(screen.getByText("taxonomy.codeInUse")).toBeInTheDocument());
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("allows keeping the current row's own code when editing", async () => {
    const user = userEvent.setup();
    render(<TaxonomyForm open={true} onOpenChange={vi.fn()} taxonomy={editTaxonomy} usedCodes={usedCodes} />);

    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce());
    expect(screen.queryByText("taxonomy.codeInUse")).not.toBeInTheDocument();
  });
});

describe("TaxonomyForm — deactivation confirmation (0602-136)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMutateAsync.mockResolvedValue({});
  });

  it("shows AlertDialog before calling mutateAsync when active→inactive", async () => {
    const user = userEvent.setup();
    render(<TaxonomyForm open={true} onOpenChange={vi.fn()} taxonomy={editTaxonomy} usedCodes={usedCodes} />);

    const activeSwitch = screen.getByRole("switch", { name: /common.active/i });
    await user.click(activeSwitch);

    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    expect(screen.getByText("taxonomy.deactivateConfirmTitle")).toBeInTheDocument();
    expect(updateMutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "common.confirm" }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce());
  });
});

describe("TaxonomyForm — service selector (0602-136)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("defaults to Global when creating a new taxonomy", () => {
    render(<TaxonomyForm open={true} onOpenChange={vi.fn()} taxonomy={null} usedCodes={usedCodes} />);
    expect(screen.getAllByText("taxonomy.global").length).toBeGreaterThan(0);
  });
});
