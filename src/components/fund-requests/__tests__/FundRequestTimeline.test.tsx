import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, opts?: { name?: string }) => (opts?.name ? `${k}:${opts.name}` : k),
    i18n: { language: "es" },
  }),
}));

// ── Import under test (after all vi.mock hoists) ───────────────────────────────
import { FundRequestTimeline } from "../FundRequestTimeline";
import type { FundRequestEvent } from "@/hooks/useFundRequestEvents";

const base: FundRequestEvent = {
  event_id: "e1",
  seq: 1,
  fund_request_id: "fr1",
  entity: "request",
  fr_wo_id: null,
  wo_id: null,
  fre_id: null,
  action: "disbursed",
  from_status: "aprobado_gerente",
  to_status: "fondos_entregados",
  actor_staff_id: "s1",
  notes: "efectivo",
  amount: 1000,
  created_at: new Date(2026, 9, 8, 9, 15).toISOString(),
  actor: { staff_id: "s1", first_name: "Ana", last_name: "Paz", short_name: "Ana P" },
};

describe("FundRequestTimeline", () => {
  it("shows the action, who did it, when, the notes and the amount", () => {
    render(<FundRequestTimeline events={[base]} />);
    expect(screen.getByText("fundRequestEvent.actions.disbursed")).toBeInTheDocument();
    expect(screen.getByText(/fundRequestEvent\.by:Ana P · 08\/10\/2026 09:15/)).toBeInTheDocument();
    expect(screen.getByText("efectivo")).toBeInTheDocument();
    expect(screen.getByText("1.000,00 BOB")).toBeInTheDocument();
  });

  it("shows the system as actor when the event has none (automatic action)", () => {
    render(<FundRequestTimeline events={[{ ...base, actor: null, actor_staff_id: null }]} />);
    expect(
      screen.getByText(/fundRequestEvent\.by:fundRequestEvent\.system/),
    ).toBeInTheDocument();
  });

  it("labels work-order events with the work order code", () => {
    render(
      <FundRequestTimeline
        events={[{ ...base, entity: "work_order", wo_id: "wo-1", action: "wo_approved", amount: null }]}
        workOrderLabel={(id) => (id === "wo-1" ? "12-06" : undefined)}
      />,
    );
    expect(screen.getByText("12-06")).toBeInTheDocument();
  });

  it("renders events in the order received and an empty state", () => {
    const { rerender } = render(
      <FundRequestTimeline
        events={[
          { ...base, event_id: "a", action: "created", amount: null, notes: null },
          { ...base, event_id: "b", action: "submitted", amount: null, notes: null },
        ]}
      />,
    );
    const items = screen.getAllByTestId("fund-request-event");
    expect(items[0]).toHaveTextContent("fundRequestEvent.actions.created");
    expect(items[1]).toHaveTextContent("fundRequestEvent.actions.submitted");

    rerender(<FundRequestTimeline events={[]} />);
    expect(screen.getByText("fundRequestEvent.empty")).toBeInTheDocument();
  });
});
