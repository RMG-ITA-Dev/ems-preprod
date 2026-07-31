import "@testing-library/jest-dom";
import { vi } from "vitest";

// Provide a working localStorage mock for jsdom environments that lack it
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock, configurable: true, writable: true });

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock i18n
vi.mock("@/i18n", () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) => {
      if (options?.entity) {
        return `${key} - ${options.entity}`;
      }
      return key;
    },
  },
}));

// Mock Supabase client
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(),
      })),
      upsert: vi.fn(),
    })),
    rpc: vi.fn(),
    // Fase 3 — Scheduler: src/hooks/scheduler/{schedulerData,schedulerGapsData}.ts
    // call supabase.functions.invoke("scheduler-data" | "scheduler-gaps", ...).
    // Individual tests override this with mockResolvedValueOnce/mockImplementation.
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
  },
}));
