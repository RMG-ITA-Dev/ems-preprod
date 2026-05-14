import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as customRender } from "@/test/utils";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { CopyFromEngagementDialog } from "../CopyFromEngagementDialog";

const mockOnApply = vi.fn();
const mockOnOpenChange = vi.fn();

const mockUseWorksheets = vi.fn(() => ({
  data: null,
  isLoading: false,
}));

const mockUseWorksheetById = vi.fn(() => ({
  data: null,
  isLoading: false,
}));

vi.mock("@/hooks/useWorksheetData", async () => {
  return {
    useWorksheets: () => mockUseWorksheets(),
    useWorksheetById: () => mockUseWorksheetById(),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("CopyFromEngagementDialog", () => {
  beforeEach(() => {
    mockOnApply.mockClear();
    mockOnOpenChange.mockClear();
    mockUseWorksheets.mockClear();
    mockUseWorksheetById.mockClear();
  });

  it("renders when open=true and hides when open=false", () => {
    mockUseWorksheets.mockReturnValue({
      data: [
        {
          id: "ws-2",
          engagement: {
            engagement_code: "ENG-001",
            engagement_name: "Test Engagement",
            client: { client_legal_name: "Test Client" },
            status: "draft",
          },
        },
      ],
      isLoading: false,
    });

    const { rerender } = customRender(
      <CopyFromEngagementDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        currentWorksheetId="ws-1"
        onApply={mockOnApply}
      />
    );

    expect(screen.getByText("workMatrix.copyDialogTitle")).toBeInTheDocument();

    rerender(
      <CopyFromEngagementDialog
        open={false}
        onOpenChange={mockOnOpenChange}
        currentWorksheetId="ws-1"
        onApply={mockOnApply}
      />
    );

    expect(screen.queryByText("workMatrix.copyDialogTitle")).not.toBeInTheDocument();
  });

  it("displays worksheet list with engagement code and name", () => {
    mockUseWorksheets.mockReturnValue({
      data: [
        {
          id: "ws-2",
          engagement: {
            engagement_code: "ENG-001",
            engagement_name: "Client ABC Project",
            client: { client_legal_name: "ABC Corp" },
            status: "draft",
          },
        },
      ],
      isLoading: false,
    });

    customRender(
      <CopyFromEngagementDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        currentWorksheetId="ws-1"
        onApply={mockOnApply}
      />
    );

    expect(screen.getByText(/ENG-001/)).toBeInTheDocument();
    expect(screen.getByText(/Client ABC Project/)).toBeInTheDocument();
    expect(screen.getByText(/ABC Corp/)).toBeInTheDocument();
  });

  it("filters worksheets by search text (code, name, client)", async () => {
    mockUseWorksheets.mockReturnValue({
      data: [
        {
          id: "ws-2",
          engagement: {
            engagement_code: "ENG-001",
            engagement_name: "ABC Project",
            client: { client_legal_name: "ABC Corp" },
            status: "draft",
          },
        },
        {
          id: "ws-3",
          engagement: {
            engagement_code: "ENG-002",
            engagement_name: "XYZ Project",
            client: { client_legal_name: "XYZ Inc" },
            status: "draft",
          },
        },
      ],
      isLoading: false,
    });

    customRender(
      <CopyFromEngagementDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        currentWorksheetId="ws-1"
        onApply={mockOnApply}
      />
    );

    const searchInput = screen.getByPlaceholderText("workMatrix.copySearchPlaceholder");
    fireEvent.change(searchInput, { target: { value: "XYZ" } });

    await waitFor(() => {
      expect(screen.getByText(/ENG-002/)).toBeInTheDocument();
      expect(screen.queryByText(/ENG-001/)).not.toBeInTheDocument();
    });
  });

  it("excludes current worksheet from list", () => {
    mockUseWorksheets.mockReturnValue({
      data: [
        {
          id: "ws-1",
          engagement: {
            engagement_code: "ENG-CURRENT",
            engagement_name: "Current",
            client: { client_legal_name: "Current" },
            status: "draft",
          },
        },
        {
          id: "ws-2",
          engagement: {
            engagement_code: "ENG-OTHER",
            engagement_name: "Other",
            client: { client_legal_name: "Other" },
            status: "draft",
          },
        },
      ],
      isLoading: false,
    });

    customRender(
      <CopyFromEngagementDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        currentWorksheetId="ws-1"
        onApply={mockOnApply}
      />
    );

    expect(screen.queryByText(/ENG-CURRENT/)).not.toBeInTheDocument();
    expect(screen.getByText(/ENG-OTHER/)).toBeInTheDocument();
  });

  it("disables copy button when totalHours === 0 or no selection", async () => {
    mockUseWorksheets.mockReturnValue({
      data: [
        {
          id: "ws-2",
          engagement: {
            engagement_code: "ENG-001",
            engagement_name: "Test",
            client: { client_legal_name: "Client" },
            status: "draft",
          },
        },
      ],
      isLoading: false,
    });

    customRender(
      <CopyFromEngagementDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        currentWorksheetId="ws-1"
        onApply={mockOnApply}
      />
    );

    const copyButton = screen.getByRole("button", { name: /workMatrix.copyConfirmButton/ });
    expect(copyButton).toBeDisabled();
  });

  it("shows no hours message when totalHours === 0", () => {
    mockUseWorksheets.mockReturnValue({
      data: [
        {
          id: "ws-2",
          engagement: {
            engagement_code: "ENG-EMPTY",
            engagement_name: "Empty Matrix",
            client: { client_legal_name: "Empty Client" },
            status: "draft",
          },
        },
      ],
      isLoading: false,
    });

    mockUseWorksheetById.mockReturnValue({
      data: {
        id: "ws-2",
        cells: [],
      },
      isLoading: false,
    });

    customRender(
      <CopyFromEngagementDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        currentWorksheetId="ws-1"
        onApply={mockOnApply}
      />
    );

    fireEvent.click(screen.getByText(/ENG-EMPTY/));

    expect(screen.getByTestId("copy-no-hours-alert")).toBeInTheDocument();
    expect(screen.getByText(/workMatrix.copyNoHours/)).toBeInTheDocument();
  });

  it("calls onApply with source cells and closes dialog on confirm", async () => {
    mockUseWorksheets.mockReturnValue({
      data: [
        {
          id: "ws-2",
          engagement: {
            engagement_code: "ENG-001",
            engagement_name: "Test",
            client: { client_legal_name: "Client" },
            status: "draft",
          },
        },
      ],
      isLoading: false,
    });

    mockUseWorksheetById.mockReturnValue({
      data: {
        id: "ws-2",
        cells: [
          {
            id: "cell-1",
            worksheet_id: "ws-2",
            category_id: "cat-1",
            activity_id: "act-1",
            budget_hours: 8,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
      isLoading: false,
    });

    customRender(
      <CopyFromEngagementDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        currentWorksheetId="ws-1"
        onApply={mockOnApply}
      />
    );

    fireEvent.click(screen.getByText(/ENG-001/));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /workMatrix.copyConfirmButton/ })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /workMatrix.copyConfirmButton/ }));

    expect(mockOnApply).toHaveBeenCalled();
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes dialog on cancel button click", () => {
    mockUseWorksheets.mockReturnValue({
      data: [],
      isLoading: false,
    });

    customRender(
      <CopyFromEngagementDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        currentWorksheetId="ws-1"
        onApply={mockOnApply}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /common.cancel/ }));

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });
});
