import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ExchangeRateIndicator } from "../ExchangeRateIndicator";

// Bug 0722-156 (Fase 1) — design updated 2026-09-05: compra always rendered (no
// `hidden sm:flex`, per operator decision overriding the feat/tc-ui mockup's mobile-hidden
// class); trigger is a focusable/tappable <button> so mobile users can reach the venta
// detail by tap, not just hover/focus.

const mockUseLatestExchangeRate = vi.fn();
vi.mock("@/hooks/useExchangeRate", () => ({
  useLatestExchangeRate: () => mockUseLatestExchangeRate(),
}));

let mockLanguage = "en";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}::${JSON.stringify(opts)}` : key),
    i18n: { get language() { return mockLanguage; } },
  }),
}));

function renderIndicator() {
  return render(
    <TooltipProvider>
      <ExchangeRateIndicator />
    </TooltipProvider>,
  );
}

describe("ExchangeRateIndicator", () => {
  afterEach(() => {
    mockLanguage = "en";
  });

  it("renders nothing while loading (no flash of unavailable state)", () => {
    mockUseLatestExchangeRate.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = renderIndicator();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the translated unavailable state when data is empty — never crashes the header", () => {
    mockUseLatestExchangeRate.mockReturnValue({ data: null, isLoading: false, isError: false });
    renderIndicator();
    expect(screen.getByText("header.exchangeRate.unavailable")).toBeInTheDocument();
  });

  it("renders the translated unavailable state on query error — never crashes the header", () => {
    mockUseLatestExchangeRate.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderIndicator();
    expect(screen.getByText("header.exchangeRate.unavailable")).toBeInTheDocument();
  });

  it("always renders the compra chip (no mobile-hidden class)", () => {
    mockUseLatestExchangeRate.mockReturnValue({
      data: { compra: 11.57, venta: 11.67, fecha_vigencia: "2026-08-26", fuente: "Banco Central de Bolivia", estado: "vigente" },
      isLoading: false,
      isError: false,
    });
    const { container } = renderIndicator();
    expect(screen.getByText("Bs 11.57")).toBeInTheDocument();
    // The approved feat/tc-ui mockup hid this on mobile via `hidden sm:flex` — the operator
    // decision (2026-09-05) overrides that: the trigger must carry no `hidden` class.
    const trigger = container.querySelector("button");
    expect(trigger?.className).not.toMatch(/\bhidden\b/);
  });

  it("formats compra per locale (en-US vs es-BO)", () => {
    mockUseLatestExchangeRate.mockReturnValue({
      data: { compra: 11.57, venta: 11.67, fecha_vigencia: "2026-08-26", fuente: "BCB", estado: "vigente" },
      isLoading: false,
      isError: false,
    });
    const { unmount } = renderIndicator();
    expect(screen.getByText("Bs 11.57")).toBeInTheDocument();
    unmount();

    mockLanguage = "es";
    renderIndicator();
    expect(screen.getByText("Bs 11,57")).toBeInTheDocument();
  });

  it("reveals venta/fecha/fuente/estado in the tooltip on tap (mobile — no hover)", async () => {
    mockUseLatestExchangeRate.mockReturnValue({
      data: { compra: 11.57, venta: 11.67, fecha_vigencia: "2026-08-26", fuente: "Banco Central de Bolivia", estado: "vigente" },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderIndicator();

    await user.click(screen.getByText("Bs 11.57"));

    // Radix Tooltip renders the content twice (visible popper + a visually-hidden a11y
    // copy for screen readers) — getAllByText, then check the first match's text.
    await waitFor(() => {
      expect(screen.getAllByText(/header\.exchangeRate\.venta/).length).toBeGreaterThan(0);
    });
    const ventaText = screen.getAllByText(/header\.exchangeRate\.venta/)[0].textContent ?? "";
    expect(ventaText).toContain("11.67");

    const dateText = screen.getAllByText(/header\.exchangeRate\.effectiveDate/)[0].textContent ?? "";
    expect(dateText).toContain("26/08/2026");
    expect(dateText).toContain("Banco Central de Bolivia");

    expect(screen.getAllByText("header.exchangeRate.status.vigente").length).toBeGreaterThan(0);
  });

  it("shows the stale status key when estado is stale", async () => {
    mockUseLatestExchangeRate.mockReturnValue({
      data: { compra: 11.57, venta: 11.67, fecha_vigencia: "2026-08-25", fuente: "BCB", estado: "stale" },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderIndicator();
    await user.click(screen.getByText("Bs 11.57"));
    await waitFor(() => {
      expect(screen.getAllByText("header.exchangeRate.status.stale").length).toBeGreaterThan(0);
    });
  });
});
