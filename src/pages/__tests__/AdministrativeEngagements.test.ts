import { describe, expect, it } from "vitest";
import {
  administrativeRowsForViewer,
  administrativeSearchKeys,
  currentBoliviaFiscalYear,
} from "../AdministrativeEngagements";

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

// Review fix (Codex): el corte del cliente usaba `new Date()` del navegador mientras
// list_administrative_engagements() recorta con la fecha de La Paz. En un dispositivo por
// delante de Bolivia (Europa/Asia) el 1 de octubre llega horas antes, el FY se adelanta y el
// filtro escondia justo las filas del FY vigente que el RPC acababa de devolver.
describe("currentBoliviaFiscalYear", () => {
  // 2026-10-01 02:00 UTC = 2026-09-30 22:00 en La Paz (UTC-4): todavia FY 2026.
  // El mismo instante ya es 1 de octubre en Europa (UTC+2) y en Asia.
  it("sigue en el FY vigente mientras en Bolivia no cambio de mes, aunque el UTC ya sea octubre", () => {
    expect(currentBoliviaFiscalYear(new Date("2026-10-01T02:00:00Z"))).toBe(2026);
  });

  it("salta al FY siguiente recien cuando octubre empieza en Bolivia", () => {
    expect(currentBoliviaFiscalYear(new Date("2026-10-01T04:00:00Z"))).toBe(2027);
  });

  it("septiembre en Bolivia es el FY en curso", () => {
    expect(currentBoliviaFiscalYear(new Date("2026-09-15T12:00:00Z"))).toBe(2026);
  });

  it("enero en Bolivia sigue en el FY que arranco en octubre", () => {
    expect(currentBoliviaFiscalYear(new Date("2027-01-15T12:00:00Z"))).toBe(2027);
  });
});
