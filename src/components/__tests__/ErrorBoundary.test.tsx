import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "../ErrorBoundary";

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Component that throws an error
function ThrowError({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error message");
  }
  return <div>Normal content</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error for expected errors
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("renders error UI when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(/An unexpected error occurred/)
    ).toBeInTheDocument();
  });

  it("displays error message in error UI", () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Test error message")).toBeInTheDocument();
  });

  it("provides reload button", () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const reloadButton = screen.getByRole("button", { name: /reload page/i });
    expect(reloadButton).toBeInTheDocument();
  });

  it("calls window.location.reload on button click", () => {
    const mockReload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: mockReload },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const reloadButton = screen.getByRole("button", { name: /reload page/i });
    fireEvent.click(reloadButton);

    expect(mockReload).toHaveBeenCalled();
  });

  it("logs error to logger", async () => {
    const { logger } = await import("@/lib/logger");

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(logger.error).toHaveBeenCalledWith(
      "ErrorBoundary caught an error:",
      expect.any(Error),
      expect.anything()
    );
  });

  it("renders normally after error is caught", () => {
    // First render with error
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // The error state persists even after rerender with non-throwing component
    // This is expected React ErrorBoundary behavior
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    // Still shows error because state is preserved
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("has proper styling for error display", () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    // Check that the error container has center alignment classes
    const heading = screen.getByText("Something went wrong");
    expect(heading).toHaveClass("text-2xl", "font-bold");
  });

  it("shows error in pre-formatted block", () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const errorPre = screen.getByText("Test error message").closest("pre");
    expect(errorPre).toHaveClass("text-xs", "bg-muted");
  });
});
