import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import es from "@/locales/es.json";
import en from "@/locales/en.json";

// Traducciones REALES de es.json / en.json (no claves crudas): AC-04 pide el orden "en español e
// inglés", y AC-05 mira los placeholders reales.
const i18nState = vi.hoisted(() => ({ lang: "es" as "es" | "en" }));

vi.mock("react-i18next", async () => {
  const esJson = (await import("@/locales/es.json")).default as Record<string, unknown>;
  const enJson = (await import("@/locales/en.json")).default as Record<string, unknown>;
  const lookup = (tree: Record<string, unknown>, key: string): string | undefined => {
    const v = key.split(".").reduce<unknown>(
      (acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined),
      tree,
    );
    return typeof v === "string" ? v : undefined;
  };
  return {
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, string>) => {
        const found = lookup(i18nState.lang === "es" ? esJson : enJson, key) ?? key;
        return found.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(opts?.[name] ?? ""));
      },
      i18n: { language: i18nState.lang },
    }),
  };
});

// Radix Select necesita APIs de PointerEvent que jsdom no trae: elementos nativos.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectGroup: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectLabel: () => null,
  SelectScrollUpButton: () => null,
  SelectScrollDownButton: () => null,
  SelectSeparator: () => null,
}));

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as any).ResizeObserver = MockResizeObserver;
  (Element.prototype as any).scrollIntoView = vi.fn();
});

import { WorkOrderRiskSection, WorkOrderRiskNoteBanner } from "../WorkOrderRiskSection";

const FULL = {
  ceacCompletedAt: "2026-05-01",
  ceacNumber: "CEAC-9",
  sanCompletedAt: "2026-04-15",
  sanApprovalId: "SAN-7",
  riskLevel: "Bajo",
};

function renderSection(over: Partial<React.ComponentProps<typeof WorkOrderRiskSection>> = {}) {
  return render(
    <WorkOrderRiskSection approvalStatus="Draft" isSubmitting={false} {...over} />,
  );
}

const before = (a: HTMLElement, b: HTMLElement) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe.each(["es", "en"] as const)("WorkOrderRiskSection — SAN antes que CEAC (%s, AC-04)", (lang) => {
  const L = lang === "es" ? es : en;

  it("las fechas y los códigos muestran SAN a la izquierda y CEAC a la derecha", () => {
    i18nState.lang = lang;
    renderSection({ onRiskAssessmentChange: vi.fn() });

    expect(before(screen.getByText(L.workOrders.sanDate), screen.getByText(L.workOrders.ceacDate))).toBe(true);
    expect(
      before(screen.getByText(L.workOrders.sanApprovalId), screen.getByText(L.workOrders.ceacNumber)),
    ).toBe(true);
    // La fila de fechas va antes que la de códigos.
    expect(
      before(screen.getByText(L.workOrders.ceacDate), screen.getByText(L.workOrders.sanApprovalId)),
    ).toBe(true);
  });

  it("en solo lectura mantiene el mismo orden", () => {
    i18nState.lang = lang;
    renderSection({ approvalStatus: "Pending_Approval", riskStatus: "Pending", ...FULL });

    expect(before(screen.getByText(L.workOrders.sanDate), screen.getByText(L.workOrders.ceacDate))).toBe(true);
    expect(
      before(screen.getByText(L.workOrders.sanApprovalId), screen.getByText(L.workOrders.ceacNumber)),
    ).toBe(true);
  });
});

describe("WorkOrderRiskSection — captura de SAN y CEAC", () => {
  const editable = () => {
    i18nState.lang = "es";
    const onChange = vi.fn();
    const { container } = renderSection({ onRiskAssessmentChange: onChange });
    const textInputs = container.querySelectorAll<HTMLInputElement>('input[type="text"]');
    const [sanId, ceacNo] = Array.from(textInputs);
    return { onChange, container, sanId, ceacNo };
  };

  it("el primer campo de fecha es SAN y el segundo CEAC", () => {
    i18nState.lang = "es";
    const onChange = vi.fn();
    const { container } = renderSection({ onRiskAssessmentChange: onChange });
    const [first, second] = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]'));

    fireEvent.change(first, { target: { value: "2026-05-01" } });
    fireEvent.change(second, { target: { value: "2026-05-02" } });

    expect(onChange).toHaveBeenNthCalledWith(1, "sanCompletedAt", "2026-05-01");
    expect(onChange).toHaveBeenNthCalledWith(2, "ceacCompletedAt", "2026-05-02");
  });

  it("acepta cualquier texto: letras, guiones y símbolos, sin mensaje de formato (AC-01)", () => {
    const { onChange, sanId, ceacNo, container } = editable();

    fireEvent.change(sanId, { target: { value: "ABC-12/x_#" } });
    fireEvent.change(ceacNo, { target: { value: "ceac.Ñ-9!" } });

    expect(onChange).toHaveBeenCalledWith("sanApprovalId", "ABC-12/x_#");
    expect(onChange).toHaveBeenCalledWith("ceacNumber", "ceac.Ñ-9!");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("un espacio escrito o pegado desaparece, en cualquier posición (AC-02)", () => {
    const { onChange, sanId, ceacNo } = editable();

    fireEvent.change(sanId, { target: { value: " AB C-1 " } });
    fireEvent.change(ceacNo, { target: { value: "12 34\t56\n78" } });

    expect(onChange).toHaveBeenCalledWith("sanApprovalId", "ABC-1");
    expect(onChange).toHaveBeenCalledWith("ceacNumber", "12345678");
  });

  it("un valor de solo espacios queda vacío (null), nunca un código en blanco (AC-02)", () => {
    const { onChange, sanId, ceacNo } = editable();

    fireEvent.change(sanId, { target: { value: "   " } });
    fireEvent.change(ceacNo, { target: { value: " " } });

    expect(onChange).toHaveBeenCalledWith("sanApprovalId", null);
    expect(onChange).toHaveBeenCalledWith("ceacNumber", null);
  });

  it("los placeholders de SAN y CEAC están vacíos y no existen los mensajes de formato (AC-05)", () => {
    for (const lang of ["es", "en"] as const) {
      i18nState.lang = lang;
      const { container, unmount } = renderSection({ onRiskAssessmentChange: vi.fn() });
      const texts = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="text"]'));
      expect(texts).toHaveLength(2);
      for (const input of texts) expect(input.getAttribute("placeholder") ?? "").toBe("");
      unmount();
    }
    // Las claves se arman por partes para que un grep por su nombre solo encuentre código vivo.
    // Los placeholders vacíos tampoco existen como clave: el parity test prohíbe hojas en blanco, y sin clave no hay atributo.
    const removedKeys = ["ceacNumber" + "Invalid", "sanApprovalId" + "Invalid", "ceacNumber" + "Placeholder", "sanApprovalId" + "Placeholder"];
    for (const L of [es, en]) {
      for (const key of removedKeys) expect(key in L.workOrders).toBe(false);
    }
  });
});

describe("WorkOrderRiskSection — solo lectura", () => {
  it("sin callbacks de edición no hay campos editables y se ven los valores", () => {
    i18nState.lang = "es";
    const { container } = renderSection({
      approvalStatus: "Pending_Approval",
      riskStatus: "Pending",
      ...FULL,
    });

    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(screen.getByText("SAN-7")).toBeInTheDocument();
    expect(screen.getByText("CEAC-9")).toBeInTheDocument();
    expect(screen.getByText("15/04/2026")).toBeInTheDocument();
    expect(screen.getByText("01/05/2026")).toBeInTheDocument();
  });

  it("aun en Borrador, sin onRiskAssessmentChange la tarjeta no se puede editar", () => {
    i18nState.lang = "es";
    const { container } = renderSection({ approvalStatus: "Draft", ...FULL });
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });
});

describe("WorkOrderRiskSection — acciones de Riesgos", () => {
  const pending = {
    approvalStatus: "Pending_Approval" as const,
    riskStatus: "Pending",
    canApproveRisk: true,
  };

  it("aprobación normal con los datos completos: botón Aprobar y botón Rechazar", async () => {
    i18nState.lang = "es";
    const onApproveRisk = vi.fn();
    renderSection({ ...pending, ...FULL, onApproveRisk, onRejectRisk: vi.fn() });

    await userEvent.click(screen.getByText(es.workOrders.approveRisk));
    expect(onApproveRisk).toHaveBeenCalledTimes(1);
    expect(screen.getByText(es.workOrders.rejectRisk)).toBeInTheDocument();
  });

  it("el rechazo pide notas en un diálogo y las manda recortadas (o null si van vacías)", async () => {
    i18nState.lang = "es";
    const onRejectRisk = vi.fn();
    renderSection({ ...pending, ...FULL, onApproveRisk: vi.fn(), onRejectRisk });
    const user = userEvent.setup();

    await user.click(screen.getByText(es.workOrders.rejectRisk));
    const dialog = screen.getByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), "  Falta documentación  ");
    await user.click(within(dialog).getByText(es.workOrders.rejectRisk));
    expect(onRejectRisk).toHaveBeenCalledWith("Falta documentación");

    await user.click(screen.getByText(es.workOrders.rejectRisk));
    await user.click(within(screen.getByRole("alertdialog")).getByText(es.workOrders.rejectRisk));
    expect(onRejectRisk).toHaveBeenLastCalledWith(null);
  });

  it("emergencia: sin revisión previa solo aparece el paso 1", () => {
    i18nState.lang = "es";
    renderSection({
      ...pending,
      onApproveEmergencyReview: vi.fn(),
      onApproveEmergencyPartner: vi.fn(),
      onRejectRisk: vi.fn(),
    });
    expect(screen.getByText(es.workOrders.approveRiskAssistant)).toBeInTheDocument();
    expect(screen.queryByText(es.workOrders.approveRiskPartner)).not.toBeInTheDocument();
  });

  describe("paso 2 de emergencia solo con canSignEmergency (AC-20, D-38, H-6)", () => {
    const step2 = {
      ...pending,
      emergencyReviewAt: "2026-06-19T10:00:00Z",
      onApproveEmergencyReview: vi.fn(),
      onApproveEmergencyPartner: vi.fn(),
      onRejectRisk: vi.fn(),
    };

    it("con canSignEmergency el botón del paso 2 aparece y firma", async () => {
      i18nState.lang = "es";
      const onApproveEmergencyPartner = vi.fn();
      renderSection({ ...step2, canSignEmergency: true, onApproveEmergencyPartner });

      await userEvent.click(screen.getByText(es.workOrders.approveRiskPartner));
      expect(onApproveEmergencyPartner).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(es.workOrders.approveRiskAssistant)).not.toBeInTheDocument();
    });

    it("sin canSignEmergency el botón del paso 2 no aparece, pero conserva Rechazar (AC-17)", () => {
      i18nState.lang = "es";
      renderSection({ ...step2, canSignEmergency: false });

      expect(screen.queryByText(es.workOrders.approveRiskPartner)).not.toBeInTheDocument();
      expect(screen.queryByText(es.workOrders.approveRiskAssistant)).not.toBeInTheDocument();
      expect(screen.getByText(es.workOrders.rejectRisk)).toBeInTheDocument();
    });

    it("sin canSignEmergency y con el paso 1 hecho, el banner avisa que falta la firma del Socio de Riesgos y que aún puede rechazar (es y en)", () => {
      i18nState.lang = "es";
      const { unmount } = renderSection({ ...step2, canSignEmergency: false });
      expect(screen.getByTestId("risk-emergency-awaiting-partner")).toHaveTextContent(
        es.workOrders.emergencyAwaitingPartner,
      );
      expect(es.workOrders.emergencyAwaitingPartner).toMatch(/Socio de Riesgos/);
      expect(es.workOrders.emergencyAwaitingPartner).toMatch(/rechazar/);
      unmount();

      i18nState.lang = "en";
      renderSection({ ...step2, canSignEmergency: false });
      expect(screen.getByTestId("risk-emergency-awaiting-partner")).toHaveTextContent(
        en.workOrders.emergencyAwaitingPartner,
      );
      expect(en.workOrders.emergencyAwaitingPartner).toMatch(/Risk Partner/);
      expect(en.workOrders.emergencyAwaitingPartner).toMatch(/reject/);
    });

    it("con canSignEmergency no hay banner (esa persona firma el paso 2)", () => {
      i18nState.lang = "es";
      renderSection({ ...step2, canSignEmergency: true });
      expect(screen.queryByTestId("risk-emergency-awaiting-partner")).not.toBeInTheDocument();
    });

    it("sin el paso 1 hecho no hay banner aunque no pueda firmar", () => {
      i18nState.lang = "es";
      renderSection({ ...step2, emergencyReviewAt: null, canSignEmergency: false });
      expect(screen.queryByTestId("risk-emergency-awaiting-partner")).not.toBeInTheDocument();
    });
  });

  it("sin canApproveRisk no hay ninguna acción de Riesgos (AC-28)", () => {
    i18nState.lang = "es";
    renderSection({
      ...pending,
      ...FULL,
      canApproveRisk: false,
      onApproveRisk: vi.fn(),
      onRejectRisk: vi.fn(),
    });
    expect(screen.queryByText(es.workOrders.approveRisk)).not.toBeInTheDocument();
    expect(screen.queryByText(es.workOrders.rejectRisk)).not.toBeInTheDocument();
  });

  it("con la pista ya Aprobada o Rechazada no se ofrecen acciones", () => {
    i18nState.lang = "es";
    for (const riskStatus of ["Approved", "Rejected"]) {
      const { unmount } = renderSection({
        ...pending,
        ...FULL,
        riskStatus,
        onApproveRisk: vi.fn(),
        onRejectRisk: vi.fn(),
      });
      expect(screen.queryByText(es.workOrders.approveRisk)).not.toBeInTheDocument();
      expect(screen.queryByText(es.workOrders.rejectRisk)).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("WorkOrderRiskNoteBanner", () => {
  it("muestra la nota solo con la pista Rechazada", () => {
    i18nState.lang = "es";
    const { rerender } = render(<WorkOrderRiskNoteBanner riskStatus="Rejected" riskNote="Falta el CEAC" />);
    expect(screen.getByText("Falta el CEAC", { exact: false })).toBeInTheDocument();

    rerender(<WorkOrderRiskNoteBanner riskStatus="Pending" riskNote="Falta el CEAC" />);
    expect(screen.queryByText("Falta el CEAC", { exact: false })).not.toBeInTheDocument();

    rerender(<WorkOrderRiskNoteBanner riskStatus="Rejected" riskNote={null} />);
    expect(screen.queryByText(es.workOrders.riskRejectionNoteLabel)).not.toBeInTheDocument();
  });
});
