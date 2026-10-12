import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// B3c: un timer sin importar cuyo encargo ya no es cargable (cerrado/bloqueado) o que el usuario no puede leer
// (senior, semisenior: useEngagements() = []) debe seguir mostrando su encargo actual en el selector. La etiqueta
// la trae useTimerEntries() por la RPC de pertenencia; el encargo falla cerrado (sin funcion: actividad bloqueada).

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useParams: () => ({ id: "timer-1" }), useNavigate: () => vi.fn() };
});
vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({ blocker: { state: "unblocked" }, allowNextNavigation: vi.fn(), isDirty: false }),
}));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ currentLanguage: "en" }) }));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ENTRY = {
  timer_id: "timer-1",
  started_at: new Date("2026-04-20T08:00:00").toISOString(),
  ended_at: new Date("2026-04-20T16:00:00").toISOString(),
  duration_minutes: 480,
  is_imported: false,
  imported_to_time_id: null,
  has_explicit_times: true,
  engagement_id: "eng-closed",
  activity_id: "aud-1",
  description: "",
  // etiqueta resuelta por list_own_timer_engagement_labels (pertenencia del registro)
  engagement: { engagement_code: "E-CLO", engagement_name: "Closed Eng" },
};

vi.mock("@/hooks/useTimerEntries", () => ({
  useTimerEntries: () => ({ data: [ENTRY], isFetched: true }),
  useUpdateTimerEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTimerEntry: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useEngagements: () => ({ data: [] }), // senior/semisenior: la RLS no les devuelve ningún encargo
  useActivityCodes: () => ({
    data: [
      {
        activity_id: "aud-1",
        activity_code: "AUD-1",
        description: "Audit work",
        is_active: true,
        is_system: false,
        service: { code: 1 },
      },
    ],
  }),
}));
vi.mock("@/hooks/useApprovedEngagements", () => ({ useApprovedEngagements: () => ({ data: [] }) }));
vi.mock("@/hooks/useAdminActivity", () => ({ useAdminActivityId: () => "adm-1" }));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }) => (
    <select
      data-testid="ui-select"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

import TrackerEdit from "../TrackerEdit";

describe("TrackerEdit — encargo actual que el usuario no lee (B3c)", () => {
  it("lo muestra en el selector con la etiqueta del registro, aunque no venga de useEngagements ni esté aprobado", () => {
    render(<TrackerEdit />);
    const [engagementSelect] = screen.getAllByTestId("ui-select") as HTMLSelectElement[];
    const option = within(engagementSelect).getByRole("option", { name: "E-CLO - Closed Eng" }) as HTMLOptionElement;
    expect(option.value).toBe("eng-closed");
    expect(engagementSelect.value).toBe("eng-closed");
  });

  it("falla cerrado: sin funcion conocida la actividad queda bloqueada y se avisa que no está aprobado", () => {
    render(<TrackerEdit />);
    const [, activitySelect] = screen.getAllByTestId("ui-select") as HTMLSelectElement[];
    expect(activitySelect).toBeDisabled();
    expect(screen.getByText("tracker.woNotApprovedEdit")).toBeInTheDocument();
  });
});
