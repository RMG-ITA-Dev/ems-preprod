import { afterEach, describe, expect, it, vi } from "vitest";
import { isSchedulerEnabled } from "../schedulerFeature";

// Fase 7 (plan v2 §B.1, "Tests to Add").
describe("isSchedulerEnabled (Fase 7, plan v2 §B.1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true only for the exact literal "true"', () => {
    vi.stubEnv("VITE_SCHEDULER_ENABLED", "true");
    expect(isSchedulerEnabled()).toBe(true);
  });

  const falsy = [undefined, "false", "1", "TRUE", "", "yes"];
  for (const value of falsy) {
    it(`returns false for ${JSON.stringify(value)}`, () => {
      if (value === undefined) {
        vi.stubEnv("VITE_SCHEDULER_ENABLED", undefined as unknown as string);
      } else {
        vi.stubEnv("VITE_SCHEDULER_ENABLED", value);
      }
      expect(isSchedulerEnabled()).toBe(false);
    });
  }

  it("is read per-call, not frozen at import time (guards against refactoring to a module constant)", () => {
    vi.stubEnv("VITE_SCHEDULER_ENABLED", "true");
    expect(isSchedulerEnabled()).toBe(true);

    vi.stubEnv("VITE_SCHEDULER_ENABLED", "false");
    expect(isSchedulerEnabled()).toBe(false);
  });
});
