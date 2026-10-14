import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// B3c: el conteo de encargos que se calcula en el navegador solo es verdadero si el usuario lee TODOS los encargos
// (alcance firm o department de engagement.read). Con alcance por asignación o sin permiso, la RLS devuelve un
// subconjunto y la pantalla no debe presentarlo como real.

let mockPermissions: Record<string, string | null> = {};
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: (k: string) => Object.prototype.hasOwnProperty.call(mockPermissions, k),
    scope: (k: string) => mockPermissions[k] ?? null,
  }),
}));

import { useCanSeeAllEngagements } from "../useCanSeeAllEngagements";

const run = (perms: Record<string, string | null>) => {
  mockPermissions = perms;
  return renderHook(() => useCanSeeAllEngagements()).result.current;
};

describe("useCanSeeAllEngagements (B3c)", () => {
  beforeEach(() => {
    mockPermissions = {};
  });

  it.each([["firm"], ["department"]])("alcance %s: lee todos los encargos", (s) => {
    expect(run({ "engagement.read": s })).toBe(true);
  });

  it.each([["assigned_engagements"], ["assigned_clients"], ["none"]])(
    "alcance %s: ve solo un subconjunto, no es un conteo real",
    (s) => {
      expect(run({ "engagement.read": s })).toBe(false);
    },
  );

  it("sin engagement.read (senior, semisenior, asistente): false", () => {
    expect(run({ "staff.read": "none" })).toBe(false);
  });
});
