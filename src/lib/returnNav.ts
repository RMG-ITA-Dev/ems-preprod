// Phase 7 (D-P7-17; PR #233 R2 review P2-01): Cancel-chain state for the
// L2 ⇄ Employee-Gantt navigation loop.
//
// Each page captures its inbound location.state ONCE on mount (D-P7-12 —
// setSearchParams replace-navigations null the state). A Cancel that
// navigates back with only a STRING would remount the caller with no
// state, so ITS next Cancel forgets its own original caller (the R2
// two-hop reproduction). The fix is a small serializable stack: every
// onward hop records the current URL as `returnTo` and the hopping
// page's own captured state as `returnState`; every Cancel restores
// `returnState` alongside the `returnTo` navigation. Pure and
// unit-testable; no React imports.

export interface ReturnNavState {
  returnTo?: string | null;
  returnState?: ReturnNavState | null;
}

/** Read an inbound location.state defensively (history state is
 *  untyped and survives reloads). Returns null when nothing usable. */
export function captureReturnNav(locationState: unknown): ReturnNavState | null {
  if (typeof locationState !== "object" || locationState === null) return null;
  const s = locationState as Record<string, unknown>;
  const returnTo = typeof s.returnTo === "string" ? s.returnTo : null;
  const returnState =
    typeof s.returnState === "object" ? (s.returnState as ReturnNavState | null) : null;
  if (returnTo === null && returnState === null) return null;
  return { returnTo, returnState };
}

/** The state an onward hop pushes: come back to `currentPathAndSearch`,
 *  and when you do, restore my own captured chain. */
export function onwardReturnState(
  currentPathAndSearch: string,
  captured: ReturnNavState | null
): ReturnNavState {
  return { returnTo: currentPathAndSearch, returnState: captured };
}
