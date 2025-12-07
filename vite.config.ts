// Build version: 2025-12-07 - Force dependency re-optimization
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
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
    ],
  },
}));
