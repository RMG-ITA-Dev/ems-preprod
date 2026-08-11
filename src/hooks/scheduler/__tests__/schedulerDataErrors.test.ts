// Unit tests for the scheduler-data error contract (Phase 4 plan §4,
// F-09): the pure mapping from invoke outcomes to typed errors. The
// Unavailable-vs-Empty distinction is what keeps a missing deployment
// from rendering as a fake empty schedule.

import { describe, expect, it } from "vitest";
import {
  isSchedulerAuthFailure,
  mapInvokeFailure,
  SchedulerDataError,
  SchedulerUnavailableError,
} from "../schedulerData";

describe("mapInvokeFailure", () => {
  it("fetch-level failure → Unavailable", () => {
    expect(mapInvokeFailure("FunctionsFetchError", undefined, null)).toBeInstanceOf(
      SchedulerUnavailableError
    );
  });

  it("gateway 404 WITHOUT the EMS envelope → Unavailable (not deployed)", () => {
    expect(
      mapInvokeFailure("FunctionsHttpError", 404, { code: 404, message: "Function not found" })
    ).toBeInstanceOf(SchedulerUnavailableError);
    expect(mapInvokeFailure("FunctionsHttpError", 404, null)).toBeInstanceOf(
      SchedulerUnavailableError
    );
  });

  it("the function's own 404 WITH the envelope stays a typed data error", () => {
    const err = mapInvokeFailure("FunctionsHttpError", 404, {
      error: { code: "not_found", message: "Engagement not found" },
    });
    expect(err).toBeInstanceOf(SchedulerDataError);
    expect((err as SchedulerDataError).code).toBe("not_found");
    expect((err as SchedulerDataError).status).toBe(404);
  });

  it("403 envelope → SchedulerDataError(forbidden)", () => {
    const err = mapInvokeFailure("FunctionsHttpError", 403, {
      error: { code: "forbidden", message: "This role has no Scheduler visibility" },
    });
    expect(err).toBeInstanceOf(SchedulerDataError);
    expect((err as SchedulerDataError).code).toBe("forbidden");
  });

  it("500 without a parseable body → SchedulerDataError(unknown)", () => {
    const err = mapInvokeFailure("FunctionsHttpError", 500, null);
    expect(err).toBeInstanceOf(SchedulerDataError);
    expect((err as SchedulerDataError).code).toBe("unknown");
    expect((err as SchedulerDataError).status).toBe(500);
  });
});

describe("isSchedulerAuthFailure (deterministic no-retry classification)", () => {
  it("matches the typed 401 envelope, a code-only unauthorized (2xx body), and a bare gateway 401", () => {
    expect(
      isSchedulerAuthFailure(new SchedulerDataError("unauthorized", "Invalid token", 401))
    ).toBe(true);
    expect(isSchedulerAuthFailure(new SchedulerDataError("unauthorized", "x"))).toBe(true);
    expect(isSchedulerAuthFailure(new SchedulerDataError("unknown", "denied", 401))).toBe(true);
  });

  it("never matches non-auth failures, Unavailable, or non-instances", () => {
    expect(isSchedulerAuthFailure(new SchedulerDataError("forbidden", "no", 403))).toBe(false);
    expect(isSchedulerAuthFailure(new SchedulerDataError("bad_request", "bad", 400))).toBe(false);
    expect(isSchedulerAuthFailure(new SchedulerDataError("query_failed", "boom", 500))).toBe(false);
    expect(isSchedulerAuthFailure(new SchedulerUnavailableError())).toBe(false);
    expect(isSchedulerAuthFailure(new Error("401 unauthorized"))).toBe(false);
    expect(isSchedulerAuthFailure({ code: "unauthorized", status: 401 })).toBe(false);
    expect(isSchedulerAuthFailure(null)).toBe(false);
  });
});
