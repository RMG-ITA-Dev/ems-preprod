import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  aggregateStaffHours,
  buildCsvString,
  downloadCsv,
  type RawTimeEntryRow,
} from "@/lib/encargoHoursDetailExport";

function makeRow(overrides: Partial<RawTimeEntryRow> & { staff_id: string }): RawTimeEntryRow {
  return {
    hours_logged: 1,
    period: { year: 2026, week_number: 10, week_start_date: "2026-03-02" },
    staff: {
      first_name: "Ana",
      last_name: "Gomez",
      category: { category_name: "Senior", display_order: 3 },
    },
    ...overrides,
  };
}

const defaultHeaders = {
  staffName: "Nombre",
  category: "Categoría",
  year: "Año",
  week: "Semana",
  loadedHours: "Horas cargadas",
};

// ─── aggregateStaffHours ───────────────────────────────────────────────────

describe("aggregateStaffHours", () => {
  // Test 1
  it("returns one row with correct fields for a single entry", () => {
    const raw = [makeRow({ staff_id: "s1", hours_logged: 4.5 })];
    const result = aggregateStaffHours(raw);
    expect(result).toHaveLength(1);
    expect(result[0].staffId).toBe("s1");
    expect(result[0].staffName).toBe("Ana Gomez");
    expect(result[0].categoryName).toBe("Senior");
    expect(result[0].year).toBe(2026);
    expect(result[0].weekNumber).toBe(10);
    expect(result[0].hoursLoaded).toBeCloseTo(4.5);
  });

  // Test 2
  it("sums hours for two entries from the same staff and week", () => {
    const raw = [
      makeRow({ staff_id: "s1", hours_logged: 3 }),
      makeRow({ staff_id: "s1", hours_logged: 5 }),
    ];
    const result = aggregateStaffHours(raw);
    expect(result).toHaveLength(1);
    expect(result[0].hoursLoaded).toBeCloseTo(8);
  });

  // Test 3
  it("returns two rows for two entries with different staff in the same week", () => {
    const raw = [
      makeRow({ staff_id: "s1", hours_logged: 3 }),
      makeRow({
        staff_id: "s2",
        hours_logged: 2,
        staff: {
          first_name: "Luis",
          last_name: "Perez",
          category: { category_name: "Gerente", display_order: 2 },
        },
      }),
    ];
    const result = aggregateStaffHours(raw);
    expect(result).toHaveLength(2);
  });

  // Test 4
  it("returns a row with null year and weekNumber when period is null", () => {
    const raw = [makeRow({ staff_id: "s1", period: null })];
    const result = aggregateStaffHours(raw);
    expect(result).toHaveLength(1);
    expect(result[0].year).toBeNull();
    expect(result[0].weekNumber).toBeNull();
  });

  // Test 5
  it("sorts by year ASC NULLS LAST, weekNumber ASC NULLS LAST, categoryDisplayOrder ASC, staffName ASC", () => {
    const raw = [
      // null period — should be last
      makeRow({ staff_id: "s3", period: null, staff: { first_name: "Carlos", last_name: "Z", category: { category_name: "Senior", display_order: 3 } } }),
      // 2026 W20
      makeRow({ staff_id: "s2", period: { year: 2026, week_number: 20, week_start_date: "2026-05-11" }, staff: { first_name: "Betty", last_name: "M", category: { category_name: "Gerente", display_order: 2 } } }),
      // 2026 W10 — Gerente (order 2) before Senior (order 3)
      makeRow({ staff_id: "s4", period: { year: 2026, week_number: 10, week_start_date: "2026-03-02" }, staff: { first_name: "Diego", last_name: "A", category: { category_name: "Gerente", display_order: 2 } } }),
      makeRow({ staff_id: "s1", period: { year: 2026, week_number: 10, week_start_date: "2026-03-02" }, staff: { first_name: "Ana", last_name: "G", category: { category_name: "Senior", display_order: 3 } } }),
    ];
    const result = aggregateStaffHours(raw);
    expect(result[0].staffId).toBe("s4"); // 2026 W10 Gerente
    expect(result[1].staffId).toBe("s1"); // 2026 W10 Senior
    expect(result[2].staffId).toBe("s2"); // 2026 W20 Gerente
    expect(result[3].staffId).toBe("s3"); // null period last
  });
});

// ─── buildCsvString ────────────────────────────────────────────────────────

describe("buildCsvString", () => {
  const sampleRow = {
    staffId: "s1",
    staffName: "Ana Gomez",
    categoryName: "Senior",
    categoryDisplayOrder: 3,
    year: 2026,
    weekNumber: 10,
    hoursLoaded: 4.5,
  };

  // Test 6
  it("first line equals double-quoted header values", () => {
    const csv = buildCsvString([sampleRow], defaultHeaders);
    const lines = csv.slice(1).split('\r\n'); // strip BOM
    expect(lines[0]).toBe('"Nombre","Categoría","Año","Semana","Horas cargadas"');
  });

  // Test 7
  it("data row renders year, weekNumber, and hoursLoaded.toFixed(1) correctly", () => {
    const csv = buildCsvString([sampleRow], defaultHeaders);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[1]).toContain('"2026"');
    expect(lines[1]).toContain('"10"');
    expect(lines[1]).toContain('"4.5"');
  });

  // Test 8
  it("renders — for null year and weekNumber columns", () => {
    const nullRow = { ...sampleRow, year: null, weekNumber: null };
    const csv = buildCsvString([nullRow], defaultHeaders);
    const lines = csv.slice(1).split('\r\n');
    // year and week columns
    expect(lines[1]).toContain('"—","—"');
  });

  // Test 9
  it("wraps staff name containing comma in double quotes so CSV columns stay intact", () => {
    const commaRow = { ...sampleRow, staffName: "Smith, John" };
    const csv = buildCsvString([commaRow], defaultHeaders);
    const lines = csv.slice(1).split('\r\n');
    // The name cell must be quoted; splitting on unquoted commas would break otherwise
    expect(lines[1]).toContain('"Smith, John"');
  });

  // Test 10
  it("escapes internal double quotes as double-double-quotes", () => {
    const quoteRow = { ...sampleRow, staffName: 'Say "Hi"' };
    const csv = buildCsvString([quoteRow], defaultHeaders);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[1]).toContain('"Say ""Hi"""');
  });

  // Test 11
  it("output string begins with UTF-8 BOM (\\uFEFF)", () => {
    const csv = buildCsvString([sampleRow], defaultHeaders);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});

// ─── downloadCsv ──────────────────────────────────────────────────────────

describe("downloadCsv", () => {
  // Test 12
  it("creates an anchor, sets download attribute, clicks it, and revokes the object URL", () => {
    const mockUrl = "blob:mock";
    const createObjectURL = vi.fn(() => mockUrl);
    const revokeObjectURL = vi.fn();
    const click = vi.fn();

    const mockAnchor = {
      href: "",
      setAttribute: vi.fn(),
      click,
    } as unknown as HTMLAnchorElement;

    vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURL);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeObjectURL);
    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => mockAnchor);
    vi.spyOn(document.body, "removeChild").mockImplementation(() => mockAnchor);

    downloadCsv("content", "test.csv");

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(mockAnchor.setAttribute).toHaveBeenCalledWith("download", "test.csv");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(mockUrl);
  });
});
