import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8")) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],
  // Espejo del `define` de vite.config.ts. Vitest no lee ese archivo, así que sin esta
  // clave cualquier test que monte AppSidebar falla con `__APP_VERSION__ is not defined`.
  // Sale del mismo package.json para que no haya dos versiones que mantener.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
      // Los módulos compartidos de las edge functions que no tocan APIs de Deno ni importan
      // por URL — plantillas y firma de webhook — se prueban acá y no con `deno test`, para
      // no sumar un segundo corredor de tests al proyecto. Los archivos que sí usan Deno
      // (index.ts de cada función, mail-graph.ts) quedan fuera a propósito.
      "supabase/functions/_shared/__tests__/**/*.{test,spec}.ts",
    ],
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
