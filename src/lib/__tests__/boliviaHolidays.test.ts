import { describe, it, expect } from "vitest";
import {
  computeEaster,
  getBoliviaNationalHolidays,
  NATIONAL_HOLIDAY_NAMES,
  normalizeHolidayName,
} from "../boliviaHolidays";

describe("computeEaster", () => {
  const cases: [number, string][] = [
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2028, "2028-04-16"],
  ];
  it.each(cases)("year %i → %s", (year, expected) => {
    expect(computeEaster(year).toISOString().slice(0, 10)).toBe(expected);
  });
});

describe("getBoliviaNationalHolidays — moveable dates", () => {
  it("2025: Carnaval, Viernes Santo, Corpus Christi", () => {
    // Easter 2025 = 2025-04-20
    const holidays = getBoliviaNationalHolidays(2025);
    const byName = Object.fromEntries(holidays.map((h) => [h.name, h.date]));
    expect(byName["Lunes de Carnaval"]).toBe("2025-03-03");  // Easter-48
    expect(byName["Martes de Carnaval"]).toBe("2025-03-04"); // Easter-47
    expect(byName["Viernes Santo"]).toBe("2025-04-18");      // Easter-2
    expect(byName["Corpus Christi"]).toBe("2025-06-19");     // Easter+60
  });

  it("2026: Carnaval, Viernes Santo, Corpus Christi", () => {
    // Easter 2026 = 2026-04-05
    const holidays = getBoliviaNationalHolidays(2026);
    const byName = Object.fromEntries(holidays.map((h) => [h.name, h.date]));
    expect(byName["Lunes de Carnaval"]).toBe("2026-02-16");  // Easter-48
    expect(byName["Martes de Carnaval"]).toBe("2026-02-17"); // Easter-47
    expect(byName["Viernes Santo"]).toBe("2026-04-03");      // Easter-2
    expect(byName["Corpus Christi"]).toBe("2026-06-04");     // Easter+60
  });
});

describe("getBoliviaNationalHolidays — structure", () => {
  it("returns 13 holidays per year (11 national + 2 departmental)", () => {
    expect(getBoliviaNationalHolidays(2027)).toHaveLength(13);
  });

  it("returns sorted dates", () => {
    const dates = getBoliviaNationalHolidays(2027).map((h) => h.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("fixed holidays are always on the correct day", () => {
    const byName = Object.fromEntries(
      getBoliviaNationalHolidays(2027).map((h) => [h.name, h.date])
    );
    expect(byName["Año Nuevo"]).toBe("2027-01-01");
    expect(byName["Día del Estado Plurinacional"]).toBe("2027-01-22");
    expect(byName["Día del Trabajo"]).toBe("2027-05-01");
    expect(byName["Año Nuevo Andino Amazónico"]).toBe("2027-06-21");
    expect(byName["Día de la Independencia"]).toBe("2027-08-06");
    expect(byName["Día de los Difuntos"]).toBe("2027-11-02");
    expect(byName["Navidad"]).toBe("2027-12-25");
  });

  it("BUG 0526-122: the 11 national holidays carry oficina=0", () => {
    const nationalNames = [
      "Año Nuevo", "Día del Estado Plurinacional", "Lunes de Carnaval",
      "Martes de Carnaval", "Viernes Santo", "Día del Trabajo", "Corpus Christi",
      "Año Nuevo Andino Amazónico", "Día de la Independencia", "Día de los Difuntos", "Navidad",
    ];
    const byName = Object.fromEntries(
      getBoliviaNationalHolidays(2027).map((h) => [h.name, h.oficina])
    );
    nationalNames.forEach((name) => expect(byName[name]).toBe(0));
  });

  it("BUG 0526-122: La Paz (16-jul, oficina=1) and Santa Cruz (24-sep, oficina=2) are generated", () => {
    const byName = Object.fromEntries(
      getBoliviaNationalHolidays(2027).map((h) => [h.name, h])
    );
    expect(byName["Aniversario del Departamento de La Paz"]).toMatchObject({
      date: "2027-07-16", oficina: 1,
    });
    expect(byName["Aniversario del Departamento de Santa Cruz"]).toMatchObject({
      date: "2027-09-24", oficina: 2,
    });
  });

  it("BUG 0526-122: La Paz/Santa Cruz transfer to Monday when falling on Sunday", () => {
    // 2028: Jul 16 = Sunday, Sep 24 = Sunday.
    const byName = Object.fromEntries(
      getBoliviaNationalHolidays(2028).map((h) => [h.name, h.date])
    );
    expect(byName["Aniversario del Departamento de La Paz"]).toBe("2028-07-17");
    expect(byName["Aniversario del Departamento de Santa Cruz"]).toBe("2028-09-25");
  });
});

describe("NATIONAL_HOLIDAY_NAMES", () => {
  it("contains all 11 canonical national names, excluding departmentals", () => {
    expect(NATIONAL_HOLIDAY_NAMES.size).toBe(11);
    expect(NATIONAL_HOLIDAY_NAMES.has("Corpus Christi")).toBe(true);
    expect(NATIONAL_HOLIDAY_NAMES.has("Viernes Santo")).toBe(true);
    expect(NATIONAL_HOLIDAY_NAMES.has("Lunes de Carnaval")).toBe(true);
    expect(NATIONAL_HOLIDAY_NAMES.has("Martes de Carnaval")).toBe(true);
    expect(NATIONAL_HOLIDAY_NAMES.has("Aniversario del Departamento de La Paz")).toBe(false);
    expect(NATIONAL_HOLIDAY_NAMES.has("Aniversario del Departamento de Santa Cruz")).toBe(false);
  });

  it("does NOT contain old-format names from the Replicar feature", () => {
    expect(NATIONAL_HOLIDAY_NAMES.has("Feriado - Corpus Christi")).toBe(false);
    expect(NATIONAL_HOLIDAY_NAMES.has("Carnaval 2026")).toBe(false);
    expect(NATIONAL_HOLIDAY_NAMES.has("Corpus Christi (Adicional)")).toBe(false);
  });
});

describe("normalizeHolidayName", () => {
  it("strips 'Feriado - ' prefix", () => {
    expect(normalizeHolidayName("Feriado - Corpus Christi")).toBe("Corpus Christi");
    expect(normalizeHolidayName("Feriado - Viernes Santo")).toBe("Viernes Santo");
    expect(normalizeHolidayName("Feriado - Día del Trabajo")).toBe("Día del Trabajo");
  });

  it("does NOT strip '(Adicional)' suffix — custom extension must be preserved", () => {
    expect(normalizeHolidayName("Feriado - Corpus Christi (Adicional)")).toBe(
      "Corpus Christi (Adicional)"
    );
    expect(NATIONAL_HOLIDAY_NAMES.has("Corpus Christi (Adicional)")).toBe(false);
  });

  it("leaves non-prefixed names untouched", () => {
    expect(normalizeHolidayName("Corpus Christi")).toBe("Corpus Christi");
    expect(normalizeHolidayName("Carnaval 2026")).toBe("Carnaval 2026");
  });
});

describe("Monday transfer rule", () => {
  // 2023: Jan 1 = Sunday, Jan 22 = Sunday, Aug 6 = Sunday.
  it("default (ON): fixed holidays on Sunday shift to Monday", () => {
    const holidays = getBoliviaNationalHolidays(2023);
    const byName = Object.fromEntries(holidays.map((h) => [h.name, h.date]));
    expect(byName["Año Nuevo"]).toBe("2023-01-02");                    // Sun 01-01 → Mon 01-02
    expect(byName["Día del Estado Plurinacional"]).toBe("2023-01-23"); // Sun 01-22 → Mon 01-23
    expect(byName["Día de la Independencia"]).toBe("2023-08-07");      // Sun 08-06 → Mon 08-07
  });

  it("explicit OFF: Sunday holidays keep their calendar date", () => {
    const holidays = getBoliviaNationalHolidays(2023, { applyMondayTransfer: false });
    const byName = Object.fromEntries(holidays.map((h) => [h.name, h.date]));
    expect(byName["Año Nuevo"]).toBe("2023-01-01");
    expect(byName["Día del Estado Plurinacional"]).toBe("2023-01-22");
    expect(byName["Día de la Independencia"]).toBe("2023-08-06");
  });

  it("moveable holidays are never transferred (day of week is fixed by definition)", () => {
    const on  = getBoliviaNationalHolidays(2023);
    const off = getBoliviaNationalHolidays(2023, { applyMondayTransfer: false });
    ["Lunes de Carnaval", "Martes de Carnaval", "Viernes Santo", "Corpus Christi"].forEach((name) => {
      expect(on.find((h) => h.name === name)?.date).toBe(
        off.find((h) => h.name === name)?.date,
      );
    });
  });
});
