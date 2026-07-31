import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Fase 3 (issue §16): ignorar únicamente el bundle SVAR vendorizado y
    // el fixture de verificación offline — no todo src/components/scheduler/**,
    // que sí debe lintarse como el resto del código propio.
    ignores: [
      "dist",
      "coverage",
      "src/components/scheduler/vendor/**",
      "tools/scheduler-fixture/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowExportNames: [
            "useTheme",
            "useDashboard",
            "useAuth",
            "useFormField",
            "useSidebar",
            "shouldSkipTimerLeaveConfirm",
            "formSchema",
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: [
      "**/__tests__/**/*.{ts,tsx}",
      "**/*.test.{ts,tsx}",
      "src/test/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Fase 3 (issue §5, §16): el bundle SVAR vendorizado solo puede
    // importarse desde GanttCanvas.tsx (el único chokepoint permitido).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/scheduler/GanttCanvas.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/vendor/svar-gantt", "**/vendor/svar-gantt/**"],
              message:
                "The vendored SVAR Gantt bundle may only be imported by src/components/scheduler/GanttCanvas.tsx.",
            },
          ],
        },
      ],
    },
  },
);
