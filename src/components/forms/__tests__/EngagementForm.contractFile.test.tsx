import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/utils";
import { toast } from "sonner";

// The admin-only "Timesheet Policy" section (rendered whenever isAdmin is mocked true)
// includes a Radix Switch, which needs ResizeObserver — not implemented by jsdom.
beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
});

/**
 * BUG 0625-151: Mandatory scanned contract (single PDF, 5MB) on engagement creation.
 * Required only for client engagements (not internal). Upload happens on file
 * selection (before the engagement exists); after create, a single update links it.
 * Download is restricted to Admin or the engagement's assigned partner/manager.
 */

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

// Stable (module-level) empty arrays — a fresh `[]` literal returned on every call would give
// EngagementForm's effects a new `allServices`/`allTaxonomies` reference on every render, which
// never lets their dependency arrays settle and hangs the test in an infinite render loop.
const emptyClients: never[] = [];
const emptyServices: never[] = [];
const emptyTaxonomies: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: emptyClients }),
  useServices: () => ({ data: emptyServices }),
  useTaxonomies: () => ({ data: emptyTaxonomies }),
}));

const emptyStaffList: never[] = [];
vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partners: emptyStaffList,
    partnerOptions: emptyStaffList,
    managerOptions: emptyStaffList,
    allActiveStaff: emptyStaffList,
    hasPartnerCategory: true,
    hasManagerCategory: true,
  }),
}));

const mockCreateMutateAsync = vi.fn();
vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const mockUseUserRole = vi.fn();
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => mockUseUserRole(),
}));

const mockUseCurrentStaff = vi.fn();
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => mockUseCurrentStaff(),
}));

const mockUpload = vi.fn();
const mockRemove = vi.fn();
const mockCreateSignedUrl = vi.fn();

// BUG 0625-151 (Codex review): contract_file_path is now linked atomically inside
// create_engagement_with_code (see useEngagementMutations.codeGeneration.test.tsx for the
// RPC payload assertion), not via a separate supabase.from("engagements").update() call —
// so this mock no longer needs to stub `.from(...)`, only Storage.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        remove: mockRemove,
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  },
}));

import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";

function makePdfFile(name = "contrato.pdf", sizeBytes = 1024) {
  return new File([new Uint8Array(sizeBytes)], name, { type: "application/pdf" });
}

const mockEngagement: Engagement = {
  engagement_id: "eng-1",
  client_id: "client-1",
  engagement_name: "Audit FY2027",
  engagement_code: "2027.121.001",
  partner_id: "staff-partner",
  manager_id: "staff-manager",
  status: "active",
  start_date: "2026-10-01",
  end_date: "2027-09-30",
  created_at: "2026-05-22T00:00:00Z",
  work_order_required: true,
  activity_required: true,
  is_internal: false,
  approval_required: true,
  oficina: 1,
  practica: 2,
  funcion: 1,
  anio_fiscal: 2027,
  sqr_id: null,
  encargado_id: null,
  specialist_it_id: null,
  specialist_tax_id: null,
  contract_file_path: "contracts/123-abc.pdf",
};

describe("EngagementForm — contract file upload (BUG 0625-151)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserRole.mockReturnValue({ isAdmin: false });
    mockUseCurrentStaff.mockReturnValue({ staffRecord: null });
    mockUpload.mockResolvedValue({ data: { path: "contracts/123-abc.pdf" }, error: null });
    mockRemove.mockResolvedValue({ data: null, error: null });
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: "https://example.com/signed" }, error: null });
  });

  it("renders the required 'Contrato Escaneado' upload control for a new client engagement", () => {
    render(<EngagementForm />);
    expect(screen.getByText("engagement.contractScanned *")).toBeInTheDocument();
    expect(screen.getByText("engagement.uploadContract")).toBeInTheDocument();
  });

  it("rejects a non-PDF file without uploading", async () => {
    render(<EngagementForm />);
    const input = document.getElementById("engagement-contract-upload") as HTMLInputElement;
    const badFile = new File(["x"], "contrato.docx", { type: "application/msword" });
    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("engagement.invalidContractFileType");
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rejects a PDF over 5MB without uploading", async () => {
    render(<EngagementForm />);
    const input = document.getElementById("engagement-contract-upload") as HTMLInputElement;
    const bigFile = makePdfFile("contrato.pdf", 6 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("engagement.contractFileTooLarge");
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("uploads a valid PDF immediately (on selection) and shows the filename with a remove control", async () => {
    render(<EngagementForm />);
    const input = document.getElementById("engagement-contract-upload") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdfFile("contrato-cliente.pdf")] } });

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
    expect(mockUpload.mock.calls[0][0]).toMatch(/^contracts\/.*\.pdf$/);
    await waitFor(() => expect(screen.getByText("contrato-cliente.pdf")).toBeInTheDocument());
  });

  it("removing the staged file deletes the storage object and shows the upload control again", async () => {
    render(<EngagementForm />);
    const input = document.getElementById("engagement-contract-upload") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdfFile()] } });
    await waitFor(() => expect(screen.getByText("contrato.pdf")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("engagement.removeContract"));

    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(["contracts/123-abc.pdf"]));
    expect(screen.getByText("engagement.uploadContract")).toBeInTheDocument();
  });

  it("does not render the contract section in edit mode when there is no uploaded contract", () => {
    render(<EngagementForm engagement={{ ...mockEngagement, contract_file_path: null }} />);
    expect(screen.queryByText("engagement.contractScanned")).not.toBeInTheDocument();
  });

  it("edit mode: shows the download action when the current staff matches the assigned partner", async () => {
    mockUseCurrentStaff.mockReturnValue({ staffRecord: { staff_id: "staff-partner" } });
    render(<EngagementForm engagement={mockEngagement} />);
    const downloadButton = screen.getByText("engagement.downloadContract");
    expect(downloadButton).toBeInTheDocument();

    fireEvent.click(downloadButton);
    await waitFor(() => {
      expect(mockCreateSignedUrl).toHaveBeenCalledWith("contracts/123-abc.pdf", 300);
    });
  });

  it("edit mode: hides the download action for staff who are neither admin nor assigned", () => {
    mockUseCurrentStaff.mockReturnValue({ staffRecord: { staff_id: "staff-other" } });
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.queryByText("engagement.downloadContract")).not.toBeInTheDocument();
    expect(screen.queryByText("engagement.contractScanned")).not.toBeInTheDocument();
  });

  it("edit mode: shows the download action for admins regardless of assignment", () => {
    mockUseUserRole.mockReturnValue({ isAdmin: true });
    mockUseCurrentStaff.mockReturnValue({ staffRecord: { staff_id: "staff-other" } });
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.getByText("engagement.downloadContract")).toBeInTheDocument();
  });
});

describe("EngagementForm contract-required predicate (BUG 0625-151, pure logic mirror)", () => {
  // Mirrors the exact guard added to onSubmit in EngagementForm.tsx: block create-mode
  // submission only for client engagements missing an already-uploaded contract path.
  function isContractMissing(isEdit: boolean, isInternal: boolean, contractFilePath: string | null): boolean {
    return !isEdit && !isInternal && !contractFilePath;
  }

  it("blocks create submission for a client engagement with no uploaded file", () => {
    expect(isContractMissing(false, false, null)).toBe(true);
  });

  it("does not block create submission once a file has been uploaded", () => {
    expect(isContractMissing(false, false, "contracts/1-a.pdf")).toBe(false);
  });

  it("does not require a contract for internal engagements, even without a file", () => {
    expect(isContractMissing(false, true, null)).toBe(false);
  });

  it("does not apply the check in edit mode", () => {
    expect(isContractMissing(true, false, null)).toBe(false);
  });
});
