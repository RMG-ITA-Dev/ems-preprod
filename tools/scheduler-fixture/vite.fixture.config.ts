// Vite config for the one-time offline runtime assertion / adapter
// contract fixture (plan §1.3, §13.0d). Build:
//   npx vite build --config tools/scheduler-fixture/vite.fixture.config.ts
// then run assert-offline.mjs (requires playwright-core OUTSIDE the repo —
// no permanent Playwright devDependency, plan D6).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const REPO = path.resolve(__dirname, "../..");

export default defineConfig({
  root: __dirname,
  publicDir: path.join(REPO, "public"),
  plugins: [react()],
  css: { postcss: path.join(REPO, "postcss.config.js") },
  resolve: { alias: { "@": path.join(REPO, "src") } },
  build: { outDir: path.join(__dirname, "dist"), emptyOutDir: true },
});
