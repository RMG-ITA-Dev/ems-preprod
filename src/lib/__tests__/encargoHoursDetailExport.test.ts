import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from 'xlsx';
import {
  aggregateStaffHours,
  groupByCategory,
  downloadXlsx,
  type RawTimeEntryRow,
} from "@/lib/encargoHoursDetailExport";

vi.mock('xlsx', () => ({
  utils: {
    book_new: vi.fn(() => ({})),
    aoa_to_sheet: vi.fn((data: unknown[][]) => ({ __data: data })),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

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
  subtotal: "Subtotal",
};

const sampleRow = {
  staffId: "s1",
  staffName: "Ana Gomez",
  categoryName: "Senior",
  categoryDisplayOrder: 3,
  year: 2026,
  weekNumber: 10,
  hoursLoaded: 3,
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

// ─── groupByCategory ────────────────────────────────────────────────────────

describe("groupByCategory", () => {
  // Test 6
  it("returns one group per unique category", () => {
    const rows = [
      { ...sampleRow, staffId: "s1", hoursLoaded: 3 },
      { ...sampleRow, staffId: "s2", hoursLoaded: 5 },
      { ...sampleRow, staffId: "s3", categoryName: "Gerente", categoryDisplayOrder: 2, hoursLoaded: 2 },
    ];
    const groups = groupByCategory(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0].categoryName).toBe("Senior");
    expect(groups[1].categoryName).toBe("Gerente");
  });

  // Test 7
  it("sums hours correctly per category group", () => {
    const rows = [
      { ...sampleRow, staffId: "s1", hoursLoaded: 3 },
      { ...sampleRow, staffId: "s2", hoursLoaded: 5 },
      { ...sampleRow, staffId: "s3", categoryName: "Gerente", categoryDisplayOrder: 2, hoursLoaded: 2 },
    ];
    const groups = groupByCategory(rows);
    const senior = groups.find(g => g.categoryName === "Senior")!;
    const gerente = groups.find(g => g.categoryName === "Gerente")!;
    expect(senior.subtotal).toBeCloseTo(8);
    expect(gerente.subtotal).toBeCloseTo(2);
  });

  // Test 8
  it("preserves input row order (first-seen category appears first)", () => {
    const rows = [
      { ...sampleRow, staffId: "s3", categoryName: "Gerente", categoryDisplayOrder: 2, hoursLoaded: 2 },
      { ...sampleRow, staffId: "s1", hoursLoaded: 3 },
    ];
    const groups = groupByCategory(rows);
    expect(groups[0].categoryName).toBe("Gerente");
    expect(groups[1].categoryName).toBe("Senior");
  });
});

// ─── downloadXlsx ──────────────────────────────────────────────────────────

describe("downloadXlsx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const seniorRow1 = { ...sampleRow, staffId: "s1", staffName: "Ana Gomez", hoursLoaded: 3 };
  const seniorRow2 = { ...sampleRow, staffId: "s2", staffName: "Luis Perez", hoursLoaded: 5 };

  // Test 9
  it("first row equals header columns in order", () => {
    downloadXlsx([seniorRow1], defaultHeaders, "test.xlsx");
    const data = vi.mocked(XLSX.utils.aoa_to_sheet).mock.calls[0][0] as (string | number)[][];
    expect(data[0]).toEqual(["Nombre", "Categoría", "Año", "Semana", "Horas cargadas"]);
  });

  // Test 10
  it("inserts subtotal row after each category's data rows", () => {
    downloadXlsx([seniorRow1, seniorRow2], defaultHeaders, "test.xlsx");
    const data = vi.mocked(XLSX.utils.aoa_to_sheet).mock.calls[0][0] as (string | number)[][];
    // index 0: header; index 1: Ana; index 2: Luis; index 3: subtotal
    const subtotalCell = data[3][1] as string;
    expect(subtotalCell).toContain("Senior");
    expect(subtotalCell).toContain("Subtotal");
  });

  // Test 11
  it("subtotal numeric value equals category hour sum", () => {
    downloadXlsx([seniorRow1, seniorRow2], defaultHeaders, "test.xlsx");
    const data = vi.mocked(XLSX.utils.aoa_to_sheet).mock.calls[0][0] as (string | number)[][];
    expect(data[3][4]).toBeCloseTo(8);
  });

  // Test 12
  it("calls XLSX.writeFile with the correct filename", () => {
    downloadXlsx([seniorRow1], defaultHeaders, "horas_SSU-001_detalle.xlsx");
    expect(vi.mocked(XLSX.writeFile)).toHaveBeenCalledWith(expect.anything(), "horas_SSU-001_detalle.xlsx");
  });
});
