import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// B3c: el conteo de encargos por persona sale de useEngagements(), que con la RLS de engagements devuelve solo lo
// que el usuario puede ver. Solo es real si los lee todos; si no, la fila muestra «-» (no un 0 o un número parcial).

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

let mockEngagementScope: string | null = "firm";
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: (k: string) => (k === "engagement.read" ? mockEngagementScope !== null : true),
    scope: (k: string) => (k === "engagement.read" ? mockEngagementScope : null),
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useStaffFull: () => ({
    data: [
      {
        staff_id: "s1",
        first_name: "Carlos",
        last_name: "Tester",
        short_name: "Carlos",
        initials: "CT",
        email: "c@firm.com",
        is_active: true,
        auth_user_id: null,
        category_id: "cat-1",
        category: { category_id: "cat-1", category_name: "Socio" },
      },
    ],
    isLoading: false,
  }),
  useEngagements: () => ({
    data: [
      { engagement_id: "e1", partner_id: "s1" },
      { engagement_id: "e2", manager_id: "s1" },
    ],
  }),
  useCategories: () => ({ data: [{ category_id: "cat-1", category_name: "Socio" }] }),
}));

import Staff from "@/pages/Staff";

const renderStaff = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Staff />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("Staff — conteo de encargos por persona (B3c)", () => {
  beforeEach(() => {
    mockEngagementScope = "firm";
  });

  it("quien lee todos los encargos ve el conteo real", () => {
    renderStaff();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.queryByTitle("staff.engagementsHidden")).not.toBeInTheDocument();
  });

  it("alcance por asignación (gerente, socio, hr_*): «-» con aviso, no un conteo parcial", () => {
    mockEngagementScope = "assigned_engagements";
    renderStaff();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.getAllByTitle("staff.engagementsHidden").length).toBeGreaterThan(0);
  });

  it("sin engagement.read: «-» con aviso", () => {
    mockEngagementScope = null;
    renderStaff();
    expect(screen.getAllByTitle("staff.engagementsHidden").length).toBeGreaterThan(0);
  });
});
