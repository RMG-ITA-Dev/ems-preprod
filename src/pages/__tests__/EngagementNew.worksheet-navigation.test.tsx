import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * FEAT 0722-157: "Ir a Matriz de Trabajo" must carry the just-created engagement's id into
 * /worksheets/new so the user doesn't have to search for it again. EngagementNew.tsx wires
 * EngagementForm's onGoToWorkMatrix(engagementId?) to navigate("/worksheets/new?engagement=<id>"),
 * still calling allowNextNavigation() first so the page-leave guard doesn't block it.
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockAllowNextNavigation = vi.fn();
vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({
    blocker: { state: "unblocked" as const },
    allowNextNavigation: mockAllowNextNavigation,
    isDirty: false,
  }),
}));

vi.mock("@/components/ui/leave-page-dialog", () => ({ LeavePageDialog: () => null }));

let mockRoleKey: string | undefined = "manager";
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ roleKey: mockRoleKey }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

// EngagementForm itself is exercised elsewhere; here we only need a way to trigger its
// onGoToWorkMatrix callback with a fabricated engagement id, mirroring what a real create +
// "Ir a Matriz de Trabajo" click would pass.
// BUG 0922-195 (Defecto 2): also surfaces the `initialClientId` prop EngagementNew forwards, so
// the tests below can assert on what actually crossed the boundary from the URL's ?client_id=.
vi.mock("@/components/forms/EngagementForm", () => ({
  EngagementForm: ({ administrativeMode, initialClientId, onGoToWorkMatrix, onCreateWorkOrder }: any) => (
    <>
      <div data-testid="administrative-mode">{String(!!administrativeMode)}</div>
      <div data-testid="initial-client-id">{initialClientId ?? ""}</div>
      <button type="button" onClick={() => onGoToWorkMatrix?.("eng-123")}>
        go-to-work-matrix
      </button>
      <button type="button" onClick={() => onCreateWorkOrder?.("eng-123")}>
        create-work-order
      </button>
    </>
  ),
}));

import EngagementNew from "../EngagementNew";

describe("EngagementNew — 'Ir a Matriz de Trabajo' navigation (0722-157)", () => {
  it("navigates to /worksheets/new with the created engagement preselected, after unlocking navigation", async () => {
    render(
      <MemoryRouter>
        <EngagementNew />
      </MemoryRouter>
    );

    screen.getByText("go-to-work-matrix").click();

    expect(mockAllowNextNavigation).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/worksheets/new?engagement=eng-123");
  });
});

// 1112-228: "Crear orden de trabajo" desde la confirmación de un encargo administrativo lleva el
// id recién creado a /work-orders/new, liberando antes el candado de salida.
describe("EngagementNew — 'Crear orden de trabajo' navigation (1112-228)", () => {
  it("unlocks navigation, then navigates to /work-orders/new with the created engagement", () => {
    mockAllowNextNavigation.mockClear();
    mockNavigate.mockClear();
    render(
      <MemoryRouter initialEntries={["/engagements/new?mode=administrative"]}>
        <EngagementNew />
      </MemoryRouter>
    );

    screen.getByText("create-work-order").click();

    expect(mockAllowNextNavigation).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/work-orders/new?engagement=eng-123");
    expect(mockAllowNextNavigation.mock.invocationCallOrder[0]).toBeLessThan(
      mockNavigate.mock.invocationCallOrder[0],
    );
  });
});

// BUG 0922-195 (Defecto 2): ClientEngagementsTable.tsx:245 navega a este componente con
// ?client_id=... (deep-link cliente -> "Nuevo Encargo"); EngagementNew.tsx lo descartaba y
// EngagementForm nunca lo recibía, dejando Cliente vacío pese a la URL.
describe("EngagementNew — forwards ?client_id as initialClientId (BUG 0922-195)", () => {
  it("/engagements/new?client_id=client-1 forwards initialClientId=\"client-1\" to EngagementForm", () => {
    render(
      <MemoryRouter initialEntries={["/engagements/new?client_id=client-1"]}>
        <EngagementNew />
      </MemoryRouter>
    );

    expect(screen.getByTestId("initial-client-id")).toHaveTextContent("client-1");
  });

  // Non-regression: administrative-mode navigation (no client_id in the URL) must keep working
  // exactly as before — initialClientId stays undefined and "Ir a Matriz de Trabajo" is untouched.
  it("administrative-mode navigation without a client_id in the URL is unaffected", () => {
    render(
      <MemoryRouter initialEntries={["/engagements/new?mode=administrative"]}>
        <EngagementNew />
      </MemoryRouter>
    );

    expect(screen.getByTestId("initial-client-id")).toHaveTextContent("");

    screen.getByText("go-to-work-matrix").click();
    expect(mockAllowNextNavigation).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/worksheets/new?engagement=eng-123");
  });
});

// El Analista de Talento Humano solo crea encargos Administrativa/Capacitación/Calidad
// (decisión del operador 2026-10-27): el alta es administrativa aunque la URL no lo pida.
describe("EngagementNew — hr_analyst always creates administrative engagements", () => {
  it("forces administrativeMode for hr_analyst without ?mode=administrative", () => {
    mockRoleKey = "hr_analyst";
    try {
      render(
        <MemoryRouter initialEntries={["/engagements/new"]}>
          <EngagementNew />
        </MemoryRouter>
      );
      expect(screen.getByTestId("administrative-mode")).toHaveTextContent("true");
    } finally {
      mockRoleKey = "manager";
    }
  });

  it("keeps the client flow for other roles without ?mode=administrative", () => {
    render(
      <MemoryRouter initialEntries={["/engagements/new"]}>
        <EngagementNew />
      </MemoryRouter>
    );
    expect(screen.getByTestId("administrative-mode")).toHaveTextContent("false");
  });
});

// 1110-220 plan_v3 (N1): el alta administrativa es solo de Sistemas y Talento Humano. Para el resto
// `?mode=administrative` se ignora: el trigger enforce_engagement_profile_scope rechazaría 0/2/3.
describe("EngagementNew — solo Talento Humano y Sistemas dan de alta administrativos (1110-220)", () => {
  it.each(["manager", "ita_manager", "tax_manager"])(
    "ignores ?mode=administrative for %s",
    (roleKey) => {
      mockRoleKey = roleKey;
      try {
        render(
          <MemoryRouter initialEntries={["/engagements/new?mode=administrative"]}>
            <EngagementNew />
          </MemoryRouter>
        );
        expect(screen.getByTestId("administrative-mode")).toHaveTextContent("false");
      } finally {
        mockRoleKey = "manager";
      }
    },
  );

  it.each(["admin", "hr_manager"])(
    "honors ?mode=administrative for %s",
    (roleKey) => {
      mockRoleKey = roleKey;
      try {
        render(
          <MemoryRouter initialEntries={["/engagements/new?mode=administrative"]}>
            <EngagementNew />
          </MemoryRouter>
        );
        expect(screen.getByTestId("administrative-mode")).toHaveTextContent("true");
      } finally {
        mockRoleKey = "manager";
      }
    },
  );

  // 1110-220 plan_v3 (N9): el Gerente de TH tampoco crea Cliente; su alta es siempre administrativa.
  it("forces administrativeMode for hr_manager without ?mode=administrative", () => {
    mockRoleKey = "hr_manager";
    try {
      render(
        <MemoryRouter initialEntries={["/engagements/new"]}>
          <EngagementNew />
        </MemoryRouter>
      );
      expect(screen.getByTestId("administrative-mode")).toHaveTextContent("true");
    } finally {
      mockRoleKey = "manager";
    }
  });
});
