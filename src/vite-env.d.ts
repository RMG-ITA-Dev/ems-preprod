/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  /** Fase 7 (plan v2 §B): Scheduler gating flag. Fail-closed — absent or any
   *  value other than the exact literal "true" leaves the Scheduler disabled.
   *  See src/lib/schedulerFeature.ts. */
  readonly VITE_SCHEDULER_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** `version` de package.json, inyectada por `define` en vite.config.ts y en
 *  vitest.config.ts. Es un reemplazo literal en build, no una variable en runtime:
 *  no existe en `import.meta.env` ni se puede leer dinámicamente. */
declare const __APP_VERSION__: string;
