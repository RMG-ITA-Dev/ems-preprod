// Explicit-export bundle entry (Phase 4 plan §1.1). Only these three
// symbols form the EMS adapter contract. Explicit exports SHRINK the
// bundle but do NOT fully eliminate it: SVAR's package architecture
// retains small internal Editor/Menu/Toolbar/grid-store contributions
// (~11 KB — tree shaking cannot drop live class methods; plan §1.0
// finding 3, PR #214 review P2-02). The XLSX worker is removed by
// verified transform T2, and verify.mjs enforces a byte budget plus an
// allowlist of runtime-contributing packages so this surface cannot
// silently grow.
export { Gantt, Willow, WillowDark } from "@svar-ui/react-gantt";
import "@svar-ui/react-gantt/style.css";
