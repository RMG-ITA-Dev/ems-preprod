import { describe, expect, it } from "vitest";
import { administrativeRowsForViewer, administrativeSearchKeys } from "../AdministrativeEngagements";

const row = (anio_fiscal: number | null) => ({
  engagement_id: String(anio_fiscal),
  engagement_code: null,
  engagement_name: "Administrativo",
  funcion: 0,
  society_id: "society",
  society_name: "Sociedad",
  client_id: "client",
  client_name: "Cliente",
  oficina: null,
  practica: null,
  practica_name: null,
  anio_fiscal,
  start_date: null,
  end_date: null,
  status: "active",
});

describe("administrativeRowsForViewer", () => {
  const rows = [row(2025), row(2026), row(2027), row(null)];

  it("keeps the operational list complete for users that can create", () => {
    expect(administrativeRowsForViewer(rows, true, 2026)).toEqual(rows);
  });

  it("hides historical and incomplete-fiscal-year rows for read-only viewers", () => {
    expect(administrativeRowsForViewer(rows, false, 2026)).toEqual([row(2026), row(2027)]);
  });
});

describe("administrativeSearchKeys", () => {
  it("lets the operational list search by client and society", () => {
    expect(administrativeSearchKeys(true)).toEqual([
      "engagement_code",
      "engagement_name",
      "client_name",
      "society_name",
    ]);
  });

  it("does not let read-only viewers search by fields their columns hide", () => {
    const keys = administrativeSearchKeys(false);
    expect(keys).toEqual(["engagement_code", "engagement_name"]);
    expect(keys).not.toContain("client_name");
    expect(keys).not.toContain("society_name");
  });
});
