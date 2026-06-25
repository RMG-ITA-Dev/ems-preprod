import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

const capturedProps: Record<string, unknown>[] = [];

vi.mock("sonner", () => ({
  Toaster: (props: Record<string, unknown>) => {
    capturedProps.push(props);
    return null;
  },
}));

import { Toaster } from "../sonner";

function renderToaster() {
  capturedProps.length = 0;
  render(
    <ThemeProvider>
      <Toaster />
    </ThemeProvider>
  );
  return capturedProps[0] ?? {};
}

describe("Toaster wrapper (sonner.tsx)", () => {
  beforeEach(() => {
    capturedProps.length = 0;
  });

  it("enables Sonner close button", () => {
    const props = renderToaster();
    expect(props.closeButton).toBe(true);
  });

  it("positions close button top-right", () => {
    const props = renderToaster();
    const closeButtonClass = (props.toastOptions as { classNames?: { closeButton?: string } })
      ?.classNames?.closeButton ?? "";
    expect(closeButtonClass).toContain("!left-auto");
    expect(closeButtonClass).toContain("!right-0");
  });

  it("forwards existing styling options", () => {
    const props = renderToaster();
    const classNames = (props.toastOptions as { classNames?: Record<string, string> })
      ?.classNames ?? {};
    expect(classNames.toast).toBeTruthy();
    expect(classNames.description).toBeTruthy();
    expect(classNames.actionButton).toBeTruthy();
    expect(classNames.cancelButton).toBeTruthy();
  });

  it("enables richColors for severity-based toast styling", () => {
    const props = renderToaster();
    expect(props.richColors).toBe(true);
  });

  it("sets explicit duration to 4000ms", () => {
    const props = renderToaster();
    expect(props.duration).toBe(4000);
  });

  it("renders without throwing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderToaster()).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
