import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * BUG 0828-185 (plan_v2 §c.3) — EngagementEdit ya no puede asumir que todo id de la URL está en
 * la lista: `usePortfolioEngagements()` (por rol/creación, no por asignación) hace que un
 * deep-link a un encargo fuera del portafolio del usuario sea COMÚN, no un caso raro. Sin la
 * rama "no encontrado", `engagements?.find(...)` devuelve `undefined`, que EngagementForm
 * interpreta como modo CREACIÓN silencioso — nunca debe pasar en la ruta /engagements/:id.
 */

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({ blocker: { state: "unblocked" as const }, allowNextNavigation: vi.fn() }),
}));

let mockEngagements: Array<{ engagement_id: string }> | undefined;
let mockIsLoading = false;
vi.mock("@/hooks/usePortfolioEngagements", () => ({
  usePortfolioEngagements: () => ({ data: mockEngagements, isLoading: mockIsLoading }),
}));

const mockEngagementFormProps = vi.fn();
vi.mock("@/components/forms/EngagementForm", () => ({
  EngagementForm: (props: any) => {
    mockEngagementFormProps(props);
    return <div data-testid="engagement-form-stub">{props.engagement ? props.engagement.engagement_id : "NO-ENGAGEMENT"}</div>;
  },
}));

import EngagementEdit from "@/pages/EngagementEdit";

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/engagements/${id}`]}>
      <Routes>
        <Route path="/engagements/:id" element={<EngagementEdit />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("EngagementEdit — deep-link fuera del portafolio (0828-185)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockEngagements = [{ engagement_id: "eng-visible" } as any];
  });

  it("mientras carga, no renderiza el formulario ni el aviso de no-disponible", () => {
    mockIsLoading = true;
    renderAt("eng-visible");
    expect(screen.queryByTestId("engagement-form-stub")).not.toBeInTheDocument();
    expect(screen.queryByText("engagement.unavailable")).not.toBeInTheDocument();
  });

  it("id presente en el portafolio: renderiza EngagementForm con el encargo encontrado", () => {
    renderAt("eng-visible");
    expect(screen.getByTestId("engagement-form-stub")).toHaveTextContent("eng-visible");
    expect(mockEngagementFormProps).toHaveBeenCalledWith(
      expect.objectContaining({ engagement: expect.objectContaining({ engagement_id: "eng-visible" }) })
    );
  });

  it("id ausente del portafolio: muestra el aviso de no-disponible, NUNCA el formulario (no cae a modo creación)", () => {
    renderAt("eng-hidden-by-portfolio-rule");
    expect(screen.getByText("engagement.unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("engagement-form-stub")).not.toBeInTheDocument();
    expect(mockEngagementFormProps).not.toHaveBeenCalled();
  });

  it("id ausente: el botón Cancelar navega de vuelta a /engagements", async () => {
    const user = userEvent.setup();
    renderAt("eng-hidden-by-portfolio-rule");
    await user.click(screen.getByText("common.cancel"));
    expect(mockNavigate).toHaveBeenCalledWith("/engagements");
  });

  it("portafolio vacío (sin datos aún resueltos post-loading): también muestra no-disponible, no creación", () => {
    mockEngagements = [];
    renderAt("cualquier-id");
    expect(screen.getByText("engagement.unavailable")).toBeInTheDocument();
    expect(mockEngagementFormProps).not.toHaveBeenCalled();
  });
});
