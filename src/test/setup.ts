import "@testing-library/jest-dom";
import { vi } from "vitest";

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
  },
}));
