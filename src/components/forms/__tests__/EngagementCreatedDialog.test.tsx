import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test/utils";

/**
 * BUG 0603-140 (enhancement): post-creation confirmation modal.
 * 0625-149: service prop now receives a catalog name (e.g. "Auditoría") instead of an i18n key.
 * The component is presentational, so it can be tested directly without driving a
 * full form submit (which is infeasible in this harness — empty entity mocks + Radix
 * Select in jsdom).
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

import { EngagementCreatedDialog } from "@/components/forms/EngagementCreatedDialog";

const baseProps = {
  open: true,
  code: "2027.121.007",
  name: "Audit FY2027",
  clientName: "ACME Corp",
  anioFiscal: 2027,
  service: "Auditoría",           // 0625-149: catalog name, not an i18n key
  funcion: "engagement.funcion_cli",
  status: "status.active",
  onClose: vi.fn(),
  onCreateAnother: vi.fn(),
  onGoToWorkMatrix: vi.fn(),
};

describe("EngagementCreatedDialog (BUG 0603-140 enhancement)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the enriched title, generated code and summary values", () => {
    render(<EngagementCreatedDialog {...baseProps} />);
    expect(screen.getByText("engagement.codeCreatedTitle")).toBeInTheDocument();
    expect(screen.getByText("engagement.codeGeneratedLabel")).toBeInTheDocument();
    expect(screen.getByText("2027.121.007")).toBeInTheDocument();
    expect(screen.getByText("engagement.summaryTitle")).toBeInTheDocument();
    expect(screen.getByText("Audit FY2027")).toBeInTheDocument();
    expect(screen.getByText("ACME Corp")).toBeInTheDocument();
    expect(screen.getByText("2027")).toBeInTheDocument();
    expect(screen.getByText("Auditoría")).toBeInTheDocument();
    expect(screen.getByText("engagement.funcion_cli")).toBeInTheDocument();
    expect(screen.getByText("status.active")).toBeInTheDocument();
  });

  it("renders the three footer actions", () => {
    render(<EngagementCreatedDialog {...baseProps} />);
    expect(screen.getByRole("button", { name: "common.close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "engagement.createAnother" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "engagement.goToWorkMatrix" })).toBeInTheDocument();
  });

  it("Close button calls onClose", async () => {
    const user = userEvent.setup();
    render(<EngagementCreatedDialog {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "common.close" }));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("Create another button calls onCreateAnother", async () => {
    const user = userEvent.setup();
    render(<EngagementCreatedDialog {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "engagement.createAnother" }));
    expect(baseProps.onCreateAnother).toHaveBeenCalledTimes(1);
  });

  it("Go to Work Matrix button calls onGoToWorkMatrix", async () => {
    const user = userEvent.setup();
    render(<EngagementCreatedDialog {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "engagement.goToWorkMatrix" }));
    expect(baseProps.onGoToWorkMatrix).toHaveBeenCalledTimes(1);
  });

  it("Copy code button writes the code to the clipboard", async () => {
    const user = userEvent.setup(); // installs a clipboard stub on navigator
    const writeSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<EngagementCreatedDialog {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "engagement.copyCode" }));
    expect(writeSpy).toHaveBeenCalledWith("2027.121.007");
  });
});
