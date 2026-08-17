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

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

// EngagementForm itself is exercised elsewhere; here we only need a way to trigger its
// onGoToWorkMatrix callback with a fabricated engagement id, mirroring what a real create +
// "Ir a Matriz de Trabajo" click would pass.
vi.mock("@/components/forms/EngagementForm", () => ({
  EngagementForm: ({ onGoToWorkMatrix }: any) => (
    <button type="button" onClick={() => onGoToWorkMatrix?.("eng-123")}>
      go-to-work-matrix
    </button>
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
