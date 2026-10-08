// Build version: 2025-12-13v2 - Force rebuild for CarteraTab import fix
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "node:fs";
import { componentTagger } from "lovable-tagger";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8")) as {
  version: string;
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Se consume en AppSidebar (chip de versión). El tipo está en src/vite-env.d.ts y
  // vitest.config.ts repite esta clave: sin eso, cualquier test que monte AppSidebar
  // muere con `__APP_VERSION__ is not defined`.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: "::",
    port: 8080,
  },
  preview: {
    allowedHosts: ["ems-test.up.railway.app"],
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: [
      // Date/Time - large with locale sub-modules
      'date-fns',
      'date-fns/locale',
      // Visualization - large bundle
      'recharts',
      // i18n - large with dynamic imports
      'i18next',
      'react-i18next',
      // Radix UI - critical/high-usage components
      '@radix-ui/react-dialog',
      '@radix-ui/react-select',
      '@radix-ui/react-popover',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-slot',
      '@radix-ui/react-tabs',
    ],
  },
}));
