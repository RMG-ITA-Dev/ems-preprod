import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLanguage } from "../useLanguage";

// Mutable language state for controlling i18n.language per-test
let mockLanguage = "en";
const mockChangeLanguage = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      get language() { return mockLanguage; },
      changeLanguage: mockChangeLanguage,
    },
    t: (key: string) => key,
  }),
}));

// Mock useGlobalSettings
vi.mock("@/hooks/useEmsData", () => ({
  useGlobalSettings: vi.fn(),
}));

import { useGlobalSettings } from "@/hooks/useEmsData";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useLanguage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLanguage = "en";
    mockChangeLanguage.mockClear();  // HC-03: explicit intent
  });

  it("returns current language and loading state", () => {
    vi.mocked(useGlobalSettings).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);

    const { result } = renderHook(() => useLanguage(), {
      wrapper: createWrapper(),
    });

    expect(result.current.currentLanguage).toBe("en");
    expect(result.current.isLoading).toBe(true);
    expect(typeof result.current.changeLanguage).toBe("function");
  });

  it("syncs language from global settings", async () => {
    vi.mocked(useGlobalSettings).mockReturnValue({
      data: [
        { setting_key: "LANGUAGE", setting_value: "es", description: null },
      ],
      isLoading: false,
    } as any);

    renderHook(() => useLanguage(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockChangeLanguage).toHaveBeenCalledWith("es");
    });
  });

  it("does not change language if already matches", () => {
    mockLanguage = "es";  // Simulates i18n already set to "es"

    vi.mocked(useGlobalSettings).mockReturnValue({
      data: [
        { setting_key: "LANGUAGE", setting_value: "es", description: null },
      ],
      isLoading: false,
    } as any);

    renderHook(() => useLanguage(), { wrapper: createWrapper() });

    expect(mockChangeLanguage).not.toHaveBeenCalled();  // Real assertion
  });

  it("exposes changeLanguage function", () => {
    vi.mocked(useGlobalSettings).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useLanguage(), {
      wrapper: createWrapper(),
    });

    result.current.changeLanguage("es");
    expect(mockChangeLanguage).toHaveBeenCalledWith("es");
  });

  it("handles missing language setting gracefully", () => {
    vi.mocked(useGlobalSettings).mockReturnValue({
      data: [
        { setting_key: "OTHER_SETTING", setting_value: "value", description: null },
      ],
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useLanguage(), {
      wrapper: createWrapper(),
    });

    // Should not throw and should return current language
    expect(result.current.currentLanguage).toBe("en");
  });
});
