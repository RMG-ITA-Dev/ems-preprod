// Cancel-chain state for the L2 ⇄ Employee-Gantt navigation loop.

import { describe, it, expect } from "vitest";
import { captureReturnNav, onwardReturnState } from "../returnNav";

describe("captureReturnNav", () => {
  it("returns null for non-object / null location.state", () => {
    expect(captureReturnNav(null)).toBeNull();
    expect(captureReturnNav(undefined)).toBeNull();
    expect(captureReturnNav("a string")).toBeNull();
    expect(captureReturnNav(42)).toBeNull();
  });

  it("returns null when neither returnTo nor returnState is present", () => {
    expect(captureReturnNav({})).toBeNull();
    expect(captureReturnNav({ unrelated: "x" })).toBeNull();
  });

  it("captures a returnTo string", () => {
    expect(captureReturnNav({ returnTo: "/scheduler" })).toEqual({
      returnTo: "/scheduler",
      returnState: null,
    });
  });

  it("captures a nested returnState object", () => {
    const nested = { returnTo: "/scheduler/engagement/e1", returnState: null };
    expect(captureReturnNav({ returnState: nested })).toEqual({
      returnTo: null,
      returnState: nested,
    });
  });

  it("ignores a non-string returnTo and a non-object returnState defensively", () => {
    expect(captureReturnNav({ returnTo: 42, returnState: "bad" })).toBeNull();
  });
});

describe("onwardReturnState", () => {
  it("records the current path+search as returnTo and threads the captured chain", () => {
    const captured = { returnTo: "/scheduler", returnState: null };
    expect(onwardReturnState("/scheduler/engagement/e1?zoom=months", captured)).toEqual({
      returnTo: "/scheduler/engagement/e1?zoom=months",
      returnState: captured,
    });
  });

  it("threads a null captured chain (bookmarked/direct-URL caller)", () => {
    expect(onwardReturnState("/scheduler/staff/s1", null)).toEqual({
      returnTo: "/scheduler/staff/s1",
      returnState: null,
    });
  });

  it("round-trips a two-hop loop: L2 → Staff → back to L2 restores the original chain", () => {
    // L2 has no inbound state (direct URL) → captures null.
    const l2Captured = captureReturnNav(null);
    // L2 hops to Staff, carrying its own URL + captured chain.
    const onward = onwardReturnState("/scheduler/engagement/e1", l2Captured);
    // Staff captures that inbound state on mount.
    const staffCaptured = captureReturnNav(onward);
    expect(staffCaptured).toEqual(onward);
    // Staff's Cancel restores returnTo=/scheduler/engagement/e1 with returnState=null —
    // the L2 remounts with no further chain, exactly matching the original direct-URL case.
    expect(staffCaptured?.returnTo).toBe("/scheduler/engagement/e1");
    expect(staffCaptured?.returnState).toBeNull();
  });
});
