// Fase 7 (plan v2 §B.1): operative gate for the Scheduler feature. Default
// OFF — the PR lands in `development` with VITE_SCHEDULER_ENABLED absent,
// so the Scheduler stays invisible until the backend (migrations + both
// Edge Functions) is confirmed available in that environment and the
// variable is set there. See docs/scheduler/fase_7/scheduler-fase-7-habilitacion-y-rollback.md.
//
// A function, not a module-level constant: reading `import.meta.env` once at
// import time (the anti-pattern in src/lib/logger.ts:8) would make this
// un-stubbable by `vi.stubEnv` at test time and would freeze the decision at
// the first import regardless of when the env actually resolves.
//
// Fail-closed: only the exact literal "true" enables. Absent, "", "1",
// "TRUE", "yes", or anything else disables.
export function isSchedulerEnabled(): boolean {
  return import.meta.env.VITE_SCHEDULER_ENABLED === "true";
}
