import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    // jsdom rendering of the heavier forms (EngagementForm/WorkOrderForm) plus multiple
    // Radix Select interactions runs slower than Vitest's 5s default here, so give tests
    // and hooks more headroom to avoid false "Test timed out in 5000ms" failures.
    testTimeout: 20000,
    hookTimeout: 20000,
    // Fase 7 (plan v2 §B.5): the 181+ existing tests were written against a
    // Scheduler that's reachable — keep that true under the new default-OFF
    // flag so none of them need touching. Tests for the flag itself use
    // vi.stubEnv to override this per-case.
    env: {
      VITE_SCHEDULER_ENABLED: "true",
    },
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "src/test/"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
