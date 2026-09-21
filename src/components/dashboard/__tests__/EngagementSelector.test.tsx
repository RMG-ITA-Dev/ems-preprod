import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EngagementSelector } from "../EngagementSelector";
import type { DashboardEngagementItem } from "@/components/dashboard/tabs/encargoOverviewTypes";

// dash_encargo (bugs/dashboard/encargo/plan_v2.md §9.3): EngagementSelector pasa a ser
// presentacional (options/value/onChange/isLoading vía props) -- ya NO consulta Supabase ni
// depende de useDashboardAccess/useCurrentStaff/useDashboard (list_dashboard_engagements()
// resuelve el alcance en el servidor). No se mockea supabase ni ningún hook de dashboard: si
// el componente los importara por error, este archivo fallaría al no encontrar el mock.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Polyfills for Radix UI Select which requires APIs not implemented in jsdom (mismo patrón
// que StaffHoursDetailDialog.test.tsx).
if (typeof window !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => undefined;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
}

const OPTIONS: DashboardEngagementItem[] = [
  { engagement_id: "e1", engagement_code: "E-001", engagement_name: "Encargo Uno", client_legal_name: "Cliente A", end_date: null },
  { engagement_id: "e2", engagement_code: "E-002", engagement_name: "Encargo Dos", client_legal_name: "Cliente B", end_date: null },
];

describe("EngagementSelector (presentacional)", () => {
  it("(a) 0 opciones -> noEngagements", async () => {
    render(<EngagementSelector options={[]} value={null} onChange={vi.fn()} isLoading={false} />);
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.getByText("dashboard.encargo.noEngagements")).toBeInTheDocument();
  });

  it("(b) N opciones -> N SelectItem en el orden recibido", async () => {
    render(<EngagementSelector options={OPTIONS} value={null} onChange={vi.fn()} isLoading={false} />);
    await userEvent.click(screen.getByRole("combobox"));
    const items = screen.getAllByRole("option");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("E-001");
    expect(items[1]).toHaveTextContent("E-002");
  });

  it("(c) elegir uno llama onChange", async () => {
    const onChange = vi.fn();
    render(<EngagementSelector options={OPTIONS} value={null} onChange={onChange} isLoading={false} />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: /E-002/ }));
    expect(onChange).toHaveBeenCalledWith("e2");
  });

  it("(d) value que no está en options no rompe el render", () => {
    expect(() =>
      render(<EngagementSelector options={OPTIONS} value="not-in-list" onChange={vi.fn()} isLoading={false} />),
    ).not.toThrow();
  });

  it("isLoading=true -> skeleton, sin combobox", () => {
    render(<EngagementSelector options={[]} value={null} onChange={vi.fn()} isLoading />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
