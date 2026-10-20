// Cobranzas Fase 8 — el contenido del Excel que se baja de la pantalla de Cobranzas.
//
// Se prueba el armado de la planilla y no la escritura del archivo: lo que importa es qué
// columnas salen, en qué orden y con qué tipo. El Analista de Cobranzas todavía no entregó su
// planilla, así que estas aserciones son el contrato provisional contra el que se la va a
// contrastar cuando llegue.

import { describe, it, expect } from "vitest";
import { buildCollectionsSheet, type CollectionsExportHeaders } from "@/lib/collectionsExport";
import type { CollectionsRow } from "@/hooks/useCollections";

const headers: CollectionsExportHeaders = {
  client: "Cliente",
  taxId: "NIT",
  engagement: "Encargo",
  manager: "Gerente",
  installment: "Cuota",
  type: "Tipo",
  amount: "Monto",
  toCollect: "Por cobrar",
  exchangeDifference: "Dif. de cambio",
  currency: "Moneda",
  agreedDate: "Fecha acordada",
  currentDate: "Fecha vigente",
  status: "Estado",
  daysOverdue: "Días de atraso",
  contactName: "Contacto",
  contactEmail: "Correo",
  contactPhone: "Teléfono",
  sheetName: "Cobranzas",
  typeFee: "Honorarios",
  typeExpense: "Gastos ejecutados",
  statusLabel: (row) => (row.calendar_state === "overdue" ? "En mora" : row.status),
};

const baseRow: CollectionsRow = {
  installment_id: "i1",
  installment_number: 2,
  installment_type: "fee",
  wo_id: "wo1",
  engagement_id: "e1",
  engagement_code: "RM-001",
  engagement_name: "Auditoría 2026",
  client_id: "c1",
  client_legal_name: "Cliente Uno S.A.",
  unique_tax_id: "123456",
  society_id: "s1",
  practica: 1,
  manager_id: "m1",
  manager_name: "Ana Gerente",
  amount: 1234.5,
  adjustments_total: 0,
  amount_effective: 1234.5,
  exchange_difference_bob: 0,
  currency: "BOB",
  status: "Invoiced",
  calendar_state: "overdue",
  confirmation_status: "sin_gestionar",
  agreed_invoice_date: "2026-05-01",
  agreed_payment_date: "2026-06-01",
  invoice_date_vigente: "2026-05-01",
  due_date_vigente: "2026-06-05",
  collection_invoice_date: "2026-05-03",
  payment_date_actual: null,
  fecha_relevante: "2026-06-05",
  days_overdue: 10,
  was_rescheduled: true,
  has_notes: true,
  contact: {
    full_name: "Tesorería",
    email: "pagos@cliente.test",
    phone: "777",
    contact_type: "cobranza",
  },
};

describe("buildCollectionsSheet", () => {
  it("abre con la fila de encabezados, en el orden de la pantalla", () => {
    const sheet = buildCollectionsSheet([], headers);
    expect(sheet).toHaveLength(1);
    expect(sheet[0]).toEqual([
      "Cliente", "NIT", "Encargo", "Gerente", "Cuota", "Tipo",
      "Monto", "Por cobrar", "Dif. de cambio", "Moneda",
      "Fecha acordada", "Fecha vigente", "Estado", "Días de atraso",
      "Contacto", "Correo", "Teléfono",
    ]);
  });

  it("escribe el monto y los días de atraso como NÚMERO, no como texto", () => {
    // Lo primero que alguien hace con este archivo es sumar la columna. Si el monto viaja
    // como texto, Excel no la suma hasta convertir la columna entera a mano.
    const [, row] = buildCollectionsSheet([baseRow], headers);
    expect(row[6]).toBe(1234.5);
    expect(typeof row[6]).toBe("number");
    expect(row[13]).toBe(10);
    expect(typeof row[13]).toBe("number");
  });

  it("lleva la fecha ACORDADA y la VIGENTE por separado", () => {
    // La diferencia entre las dos es justamente lo que hay que explicar al conciliar: si solo
    // fuera una, una cuota reprogramada se vería como si siempre hubiera vencido ese día.
    const [, row] = buildCollectionsSheet([baseRow], headers);
    expect(row[10]).toBe("2026-06-01");
    expect(row[11]).toBe("2026-06-05");
  });

  it("para una cuota sin facturar, la fecha acordada es la de FACTURACIÓN", () => {
    const pending: CollectionsRow = { ...baseRow, status: "Pending", calendar_state: "billing_late", fecha_relevante: "2026-05-01" };
    const [, row] = buildCollectionsSheet([pending], headers);
    expect(row[10]).toBe("2026-05-01");
  });

  it("distingue la fila de gastos ejecutados de una cuota de honorarios", () => {
    const expense: CollectionsRow = { ...baseRow, installment_type: "expense_reimbursement" };
    expect(buildCollectionsSheet([baseRow], headers)[1][5]).toBe("Honorarios");
    expect(buildCollectionsSheet([expense], headers)[1][5]).toBe("Gastos ejecutados");
  });

  it("usa la etiqueta de estado de la pantalla, no el estado crudo", () => {
    // Una cuota facturada y vencida se lee "En mora" en la pantalla; el archivo tiene que
    // decir lo mismo, o las dos cosas dejan de poder contrastarse.
    const [, row] = buildCollectionsSheet([baseRow], headers);
    expect(row[12]).toBe("En mora");
    const onTrack: CollectionsRow = { ...baseRow, calendar_state: "on_track" };
    expect(buildCollectionsSheet([onTrack], headers)[1][12]).toBe("Invoiced");
  });

  it("deja las celdas del contacto vacías cuando el cliente no tiene ninguno", () => {
    const sinContacto: CollectionsRow = { ...baseRow, contact: null };
    const [, row] = buildCollectionsSheet([sinContacto], headers);
    expect(row.slice(14)).toEqual(["", "", ""]);
  });

  it("respeta el orden en que vinieron las filas", () => {
    // El archivo tiene que poder leerse en paralelo con la pantalla, línea a línea.
    const segunda: CollectionsRow = { ...baseRow, installment_id: "i2", client_legal_name: "Aaa Primero S.A." };
    const sheet = buildCollectionsSheet([baseRow, segunda], headers);
    expect(sheet[1][0]).toBe("Cliente Uno S.A.");
    expect(sheet[2][0]).toBe("Aaa Primero S.A.");
  });

  it("junta el código y el nombre del encargo, y tolera que falte uno", () => {
    expect(buildCollectionsSheet([baseRow], headers)[1][2]).toBe("RM-001 — Auditoría 2026");
    const sinCodigo: CollectionsRow = { ...baseRow, engagement_code: null };
    expect(buildCollectionsSheet([sinCodigo], headers)[1][2]).toBe("Auditoría 2026");
  });

  it("lleva el monto acordado y lo que queda por cobrar en columnas distintas", () => {
    // Conciliar contra el banco se hace contra lo que queda por cobrar; discutir con el
    // cliente, contra lo acordado. Una sola columna obligaría a elegir cuál de las dos cosas
    // puede hacerse con el archivo.
    const conDescuento: CollectionsRow = { ...baseRow, adjustments_total: -234.5, amount_effective: 1000 };
    const [, row] = buildCollectionsSheet([conDescuento], headers);
    expect(row[6]).toBe(1234.5);
    expect(row[7]).toBe(1000);
  });

  it("la diferencia de cambio tiene su propia columna, porque va en Bs", () => {
    // La cuota puede estar en USD y la diferencia siempre en Bs: sumarlas a la misma columna
    // daría un número que no significa nada.
    const conDiferencia: CollectionsRow = { ...baseRow, currency: "USD", exchange_difference_bob: 45 };
    const [, row] = buildCollectionsSheet([conDiferencia], headers);
    expect(row[8]).toBe(45);
    expect(row[9]).toBe("USD");
  });

  it("un monto nulo sale como 0 y no como celda vacía", () => {
    const sinMonto: CollectionsRow = { ...baseRow, amount: null, amount_effective: 0 };
    expect(buildCollectionsSheet([sinMonto], headers)[1][6]).toBe(0);
  });
});
