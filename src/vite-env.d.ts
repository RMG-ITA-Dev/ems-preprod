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
