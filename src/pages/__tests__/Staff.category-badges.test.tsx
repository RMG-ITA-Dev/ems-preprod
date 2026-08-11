import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// Bug 0603-138: the Categoría column used an English-keyed color map, so only
// "Senior" (identical in EN/ES) received a colored badge while the Spanish
// categories (Socio, Gerente, Asistente) stayed neutral. The fix renders every
// category badge with the same neutral `variant="outline"` style. These tests
// pin that uniformity so a per-category color map cannot be reintroduced.

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as any).ResizeObserver = MockResizeObserver;

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, // desktop: render the table, not the mobile cards
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, scope: () => null, isLoading: false }),
}));

// Defined via vi.hoisted so the fixture is initialized before the hoisted
// vi.mock factory below runs (the factory closes over `staffRows`).
const { staffRows } = vi.hoisted(() => {
  const makeStaffRow = (id: string, firstName: string, categoryName: string) => ({
    staff_id: id,
    first_name: firstName,
    last_name: "Tester",
    short_name: firstName,
    initials: firstName.slice(0, 2).toUpperCase(),
    email: `${firstName.toLowerCase()}@firm.com`,
    is_active: true,
    auth_user_id: null,
    category_id: `cat-${categoryName}`,
    category: { category_id: `cat-${categoryName}`, category_name: categoryName },
  });

  return {
    staffRows: [
      makeStaffRow("s1", "Carlos", "Socio"),
      makeStaffRow("s2", "Maria", "Gerente"),
      makeStaffRow("s3", "Luis", "Senior"),
      makeStaffRow("s4", "Ana", "Asistente"),
    ],
  };
});

vi.mock("@/hooks/useEmsData", () => ({
  useStaffFull: () => ({ data: staffRows, isLoading: false }),
  useEngagements: () => ({ data: [] }),
  useCategories: () => ({
    data: [
      { category_id: "cat-Socio", category_name: "Socio" },
      { category_id: "cat-Gerente", category_name: "Gerente" },
      { category_id: "cat-Senior", category_name: "Senior" },
      { category_id: "cat-Asistente", category_name: "Asistente" },
    ],
  }),
}));

import Staff from "@/pages/Staff";

const renderStaff = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Staff />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

// Find the category badge element (a div whose text content is exactly the
// category name) for a given category.
const getCategoryBadge = (name: string): HTMLElement => {
  const matches = screen
    .getAllByText(name)
    .filter((el) => el.tagName === "DIV" && el.textContent?.trim() === name);
  expect(matches.length).toBeGreaterThan(0);
  return matches[0];
};

describe("Staff page – category badge uniformity (bug 0603-138)", () => {
  it("renders all four category badges", () => {
    renderStaff();
    expect(getCategoryBadge("Socio")).toBeInTheDocument();
    expect(getCategoryBadge("Gerente")).toBeInTheDocument();
    expect(getCategoryBadge("Senior")).toBeInTheDocument();
    expect(getCategoryBadge("Asistente")).toBeInTheDocument();
  });

  it("does not apply the old info color to the Senior badge", () => {
    renderStaff();
    const senior = getCategoryBadge("Senior");
    expect(senior.className).not.toMatch(/bg-info/);
    expect(senior.className).not.toMatch(/text-info/);
    expect(senior.className).not.toMatch(/border-info/);
  });

  it("gives every category badge the same className", () => {
    renderStaff();
    const socio = getCategoryBadge("Socio").className;
    const gerente = getCategoryBadge("Gerente").className;
    const senior = getCategoryBadge("Senior").className;
    const asistente = getCategoryBadge("Asistente").className;

    expect(senior).toBe(socio);
    expect(gerente).toBe(socio);
    expect(asistente).toBe(socio);
  });
});
