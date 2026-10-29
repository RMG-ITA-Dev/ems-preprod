import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { format } from "date-fns";
import { ManualEntryDialog } from "../ManualEntryDialog";

// BUG 1028-217: la Carga Manual pide los encargos para la fecha elegida (misma regla que la
// Hoja de Tiempo) y, si el encargo seleccionado no cubre la fecha nueva, limpia la selección.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

const TODAY = format(new Date(), "yyyy-MM-dd");
const OTHER_DAY = new Date(2020, 0, 15);

const ENGAGEMENTS = [
  {
    engagement_id: "eng-today",
    engagement_code: "E-TODAY",
    engagement_name: "Capacitación de hoy",
    funcion: 0,
    practica: null,
    start_date: TODAY,
    end_date: TODAY,
    engagement_state_override: 7,
  },
];

const refDates: Array<string | undefined> = [];

// Devuelve siempre la misma lista (sin recortar por fecha) para que la opción siga en el
// <select>: así un value "" prueba que el diálogo limpió la selección, no que la opción se fue.
vi.mock("@/hooks/useManualEntryEngagements", () => ({
  useManualEntryEngagements: (refDate?: string) => {
    refDates.push(refDate);
    return { data: ENGAGEMENTS };
  },
}));

vi.mock("@/hooks/useEmsData", () => ({
  useActivityCodes: () => ({
    data: [{ activity_id: "adm-1", activity_code: "ADM", description: "Administrative", is_active: true, is_system: true }],
  }),
}));

vi.mock("@/hooks/useAdminActivity", () => ({
  useAdminActivityId: () => "adm-1",
}));

vi.mock("@/components/tracker/EngagementCombobox", () => ({
  EngagementCombobox: ({
    engagements,
    value,
    onValueChange,
  }: {
    engagements: Array<{ engagement_id: string; engagement_name: string }>;
    value: string;
    onValueChange: (id: string) => void;
  }) => (
    <select data-testid="engagement-select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="" />
      {engagements.map((eng) => (
        <option key={eng.engagement_id} value={eng.engagement_id}>
          {eng.engagement_name}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect: (d: Date) => void }) => (
    <button type="button" data-testid="pick-other-day" onClick={() => onSelect(OTHER_DAY)} />
  ),
}));

describe("ManualEntryDialog — encargos por fecha (BUG 1028-217)", () => {
  beforeEach(() => {
    refDates.length = 0;
  });

  it("asks for today's engagements and clears the selection when the date leaves its range", () => {
    render(<ManualEntryDialog open onOpenChange={vi.fn()} onSubmit={vi.fn()} />);
    expect(refDates).toContain(TODAY);

    const select = screen.getByTestId("engagement-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "eng-today" } });
    expect(select.value).toBe("eng-today");

    fireEvent.click(screen.getByTestId("pick-other-day"));

    expect(refDates).toContain(format(OTHER_DAY, "yyyy-MM-dd"));
    expect(screen.getByText("Capacitación de hoy")).toBeInTheDocument();
    expect((screen.getByTestId("engagement-select") as HTMLSelectElement).value).toBe("");
  });
});
