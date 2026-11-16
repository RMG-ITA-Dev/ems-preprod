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
  society: "Ruizmier Pelaez S.R.L.", // FEAT 0714-155: resolved society name, not an i18n key
  showGoToWorkMatrix: true, // 0722-157: caller resolves this from funcion === Cliente
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
    expect(screen.getByText("Ruizmier Pelaez S.R.L.")).toBeInTheDocument();
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

  // 0722-157 (feedback): la Matriz de Trabajo solo aplica a encargos de función Cliente —
  // el caller (EngagementForm) resuelve showGoToWorkMatrix a partir de funcion, este
  // componente solo obedece el flag.
  it("hides the 'Ir a Matriz de Trabajo' button when showGoToWorkMatrix is false", () => {
    render(<EngagementCreatedDialog {...baseProps} showGoToWorkMatrix={false} />);
    expect(screen.queryByRole("button", { name: "engagement.goToWorkMatrix" })).not.toBeInTheDocument();
    // The other two actions stay unaffected.
    expect(screen.getByRole("button", { name: "common.close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "engagement.createAnother" })).toBeInTheDocument();
  });

  // 1112-228: "Crear orden de trabajo" para encargos administrativos. El caller resuelve
  // workOrderAction (resolveCreatedWorkOrderAction); este componente solo lo obedece.
  describe("work order action (1112-228)", () => {
    const adminProps = {
      ...baseProps,
      funcion: "engagement.funcion_admin",
      showGoToWorkMatrix: false,
      onCreateWorkOrder: vi.fn(),
    };

    it("'create' shows the button and the hint, keeping Close and Create another", () => {
      render(<EngagementCreatedDialog {...adminProps} workOrderAction="create" />);
      expect(screen.getByRole("button", { name: "engagement.createWorkOrder" })).toBeInTheDocument();
      expect(screen.getByText("engagement.createWorkOrderHint")).toBeInTheDocument();
      expect(screen.queryByText("engagement.createWorkOrderBlockedHint")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "common.close" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "engagement.createAnother" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "engagement.goToWorkMatrix" })).not.toBeInTheDocument();
    });

    it("'create' button calls onCreateWorkOrder once", async () => {
      const user = userEvent.setup();
      render(<EngagementCreatedDialog {...adminProps} workOrderAction="create" />);
      await user.click(screen.getByRole("button", { name: "engagement.createWorkOrder" }));
      expect(adminProps.onCreateWorkOrder).toHaveBeenCalledTimes(1);
    });

    it("'blocked' shows only the blocked hint, without the button", () => {
      render(<EngagementCreatedDialog {...adminProps} workOrderAction="blocked" />);
      expect(screen.queryByRole("button", { name: "engagement.createWorkOrder" })).not.toBeInTheDocument();
      expect(screen.getByText("engagement.createWorkOrderBlockedHint")).toBeInTheDocument();
      expect(screen.queryByText("engagement.createWorkOrderHint")).not.toBeInTheDocument();
    });

    it("defaults to 'none': no button and no hint", () => {
      render(<EngagementCreatedDialog {...baseProps} />);
      expect(screen.queryByRole("button", { name: "engagement.createWorkOrder" })).not.toBeInTheDocument();
      expect(screen.queryByText("engagement.createWorkOrderHint")).not.toBeInTheDocument();
      expect(screen.queryByText("engagement.createWorkOrderBlockedHint")).not.toBeInTheDocument();
      // Client flow unchanged.
      expect(screen.getByRole("button", { name: "engagement.goToWorkMatrix" })).toBeInTheDocument();
    });
  });
});
