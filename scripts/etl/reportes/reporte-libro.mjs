// Libro .xlsx de los reportes de verificación Legacy ↔ EMS (hojas Léame, OT, Cuotas y Observaciones). Solo escribe el archivo indicado.
// Las columnas grises (lado EMS) quedan vacías hasta la carga en Test o producción; las diferencias (Δ) se calculan solas al completarlas.
import ExcelJS from "exceljs";
import { formatDate } from "./reporte-datos.mjs";

const COLORS = Object.freeze({ identificacion: "1F3864", honorarios: "2E75B6", horas: "548235", riesgos: "C55A11", ems: "7F7F7F", cuota: "1F3864", alertaRoja: "FDE9E7", alertaAmarilla: "FFF2CC", alertaNaranja: "FCE4D6", gris: "F2F2F2", linea: "BFBFBF" });
const MONEY = "#,##0.00"; const HOURS = "#,##0.##"; const PERCENT = "0.00%"; const DATE = "dd/mm/yyyy";
const THIN = { style: "thin", color: { argb: `FF${COLORS.linea}` } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const fill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } });
const toDate = (iso) => (iso ? new Date(`${iso}T00:00:00Z`) : null);
const columnLetter = (index) => { let n = index; let letter = ""; while (n > 0) { const rest = (n - 1) % 26; letter = String.fromCharCode(65 + rest) + letter; n = Math.floor((n - 1) / 26); } return letter; };

function styleHeader(cell, hex) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = fill(hex); cell.border = BORDER;
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

// definition: { key, header, width, group, format?, kind?, ems? } ; los grupos pintan la banda superior de la hoja OT.
const OT_COLUMNS = [
  { key: "cot", header: "COT", width: 13, group: "identificacion" },
  { key: "cliente", header: "Cliente", width: 38, group: "identificacion" },
  { key: "servicio", header: "Servicio", width: 32, group: "identificacion" },
  { key: "practica", header: "Práctica", width: 15, group: "identificacion" },
  { key: "sociedad", header: "Sociedad", width: 18, group: "identificacion" },
  { key: "gestion", header: "Gestión", width: 9, group: "identificacion", align: "center" },
  { key: "socio", header: "Socio", width: 26, group: "identificacion" },
  { key: "gerente", header: "Gerente (Legacy)", width: 26, group: "identificacion" },
  { key: "finVigencia", header: "Fin de vigencia", width: 13, group: "identificacion", format: DATE, kind: "date" },
  { key: "moneda", header: "Moneda", width: 9, group: "honorarios", align: "center" },
  { key: "tc", header: "TC de la OT", width: 9, group: "honorarios", format: "0.00" },
  { key: "presupuestadoUsd", header: "Presupuestado (USD)", width: 15, group: "honorarios", format: MONEY },
  { key: "gastos", header: "Gastos presupuestados (moneda OT)", width: 16, group: "honorarios", format: MONEY },
  { key: "totalAcordado", header: "Total acordado original (moneda OT)", width: 17, group: "honorarios", format: MONEY },
  { key: "estandarUsd", header: "Honorario estándar (USD)", width: 15, group: "honorarios", format: MONEY },
  { key: "estandarMoneda", header: "Honorario estándar (moneda OT)", width: 16, group: "honorarios", format: MONEY },
  { key: "realizacion", header: "Realización % (Legacy)", width: 13, group: "honorarios", format: PERCENT },
  { key: "horasPresupuestadas", header: "Horas presupuestadas", width: 13, group: "horas", format: HOURS },
  { key: "horasEjecutadas", header: "Horas ejecutadas aprobadas (hasta 30/10)", width: 16, group: "horas", format: HOURS },
  { key: "usoHoras", header: "% de uso de horas", width: 11, group: "horas", format: PERCENT },
  { key: "nivelRiesgo", header: "Nivel de riesgo", width: 12, group: "riesgos", align: "center" },
  { key: "ceacNumero", header: "N.º CEAC", width: 11, group: "riesgos", align: "center" },
  { key: "ceacFecha", header: "Fecha CEAC", width: 12, group: "riesgos", format: DATE, kind: "date" },
  { key: "sanNumero", header: "N.º SAN", width: 13, group: "riesgos", align: "center" },
  { key: "sanFecha", header: "Fecha SAN", width: 12, group: "riesgos", format: DATE, kind: "date" },
  { key: "emsCodigo", header: "Código EMS", width: 14, group: "ems", ems: true },
  { key: "emsGerente", header: "Gerente (EMS)", width: 26, group: "ems", ems: true },
  { key: "emsTotal", header: "Total EMS con impuestos (moneda OT)", width: 17, group: "ems", format: MONEY, ems: true },
  { key: "emsGastos", header: "Gastos EMS", width: 13, group: "ems", format: MONEY, ems: true },
  { key: "emsEstandar", header: "Honorario estándar EMS", width: 15, group: "ems", format: MONEY, ems: true },
  { key: "emsRealizacion", header: "Realización % (EMS)", width: 13, group: "ems", format: PERCENT, ems: true },
  { key: "emsHorasPresupuestadas", header: "Horas presupuestadas EMS", width: 13, group: "ems", format: HOURS, ems: true },
  { key: "emsHorasImportadas", header: "Horas importadas EMS (lote d41)", width: 15, group: "ems", format: HOURS, ems: true },
  { key: "difTotal", header: "Δ Total (EMS − Legacy)", width: 15, group: "ems", format: MONEY, formula: ({ L }) => `IF(${L.emsTotal}="","",${L.emsTotal}-${L.totalAcordado})` },
  { key: "difRealizacion", header: "Δ Realización (puntos)", width: 13, group: "ems", format: "0.00%", formula: ({ L }) => `IF(${L.emsRealizacion}="","",${L.emsRealizacion}-${L.realizacion})` },
  { key: "difHorasPresupuestadas", header: "Δ Horas presupuestadas", width: 13, group: "ems", format: HOURS, formula: ({ L }) => `IF(${L.emsHorasPresupuestadas}="","",${L.emsHorasPresupuestadas}-${L.horasPresupuestadas})` },
  { key: "difHorasImportadas", header: "Δ Horas importadas", width: 13, group: "ems", format: HOURS, formula: ({ L }) => `IF(${L.emsHorasImportadas}="","",${L.emsHorasImportadas}-${L.horasEjecutadas})` },
];
const OT_GROUPS = [["identificacion", "Identificación"], ["honorarios", "Honorarios"], ["horas", "Horas"], ["riesgos", "Riesgos (lo que se migra)"], ["ems", "EMS (se completa tras la carga en Test o producción)"]];

const CUOTA_COLUMNS = [
  { key: "cot", header: "COT", width: 13 }, { key: "cliente", header: "Cliente", width: 36 }, { key: "gerente", header: "Gerente (Legacy)", width: 26 },
  { key: "moneda", header: "Moneda", width: 9, align: "center" }, { key: "numero", header: "N.º de cuota", width: 9, align: "center" }, { key: "tipo", header: "Tipo de fila", width: 25 },
  { key: "porcentaje", header: "% de la cuota", width: 10, format: "0.0000", align: "right" }, { key: "fechaFactura", header: "Fecha de factura acordada", width: 13, format: DATE, kind: "date" },
  { key: "monto", header: "Monto de la cuota (moneda OT)", width: 17, format: MONEY }, { key: "tcPlan", header: "TC del plan (solo USD)", width: 10, format: "0.00" },
  { key: "fechaPago", header: "Fecha de pago (factura + 30 días hábiles)", width: 15, format: DATE, kind: "date" }, { key: "vencida", header: "Vencida al 06/11/2026", width: 11, align: "center" },
  { key: "textoLegacy", header: "Texto del Legacy", width: 38 }, { key: "fechaAtipica", header: "Bandera: fecha atípica", width: 48 }, { key: "posibleCausa", header: "Posible causa (inferencia)", width: 30 },
  { key: "facturadaPorTexto", header: "Bandera: facturada por texto", width: 12, align: "center" }, { key: "tcDistinto", header: "Bandera: TC distinto de 6,96", width: 12, align: "center" },
  { key: "emsMonto", header: "Monto EMS", width: 15, format: MONEY, ems: true }, { key: "emsEstado", header: "Estado EMS", width: 13, ems: true }, { key: "emsFechaPago", header: "Fecha de pago EMS", width: 14, format: DATE, ems: true },
  { key: "difMonto", header: "Δ Monto (EMS − Legacy)", width: 15, format: MONEY, formula: ({ L }) => `IF(${L.emsMonto}="","",${L.emsMonto}-${L.monto})` },
];

const withHeaders = (columns, headers) => columns.map((column) => (headers[column.key] ? { ...column, header: headers[column.key] } : column));
function letters(columns) { return Object.fromEntries(columns.map((column, index) => [column.key, columnLetter(index + 1)])); }

function writeDataSheet(workbook, name, columns, rows, { headerRow, groupBand = null, valueOf }) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", xSplit: 1, ySplit: headerRow }], properties: { tabColor: { argb: `FF${COLORS.cuota}` } } });
  const L = letters(columns);
  columns.forEach((column, index) => { sheet.getColumn(index + 1).width = column.width; });
  if (groupBand) {
    for (const [group, label] of groupBand) {
      const indexes = columns.map((column, index) => (column.group === group ? index + 1 : 0)).filter(Boolean); if (!indexes.length) continue;
      const start = indexes[0]; const end = indexes.at(-1); if (end > start) sheet.mergeCells(1, start, 1, end);
      const cell = sheet.getCell(1, start); cell.value = label; styleHeader(cell, COLORS[group]); cell.alignment = { vertical: "middle", horizontal: "center" };
      for (let c = start; c <= end; c += 1) sheet.getCell(1, c).fill = fill(COLORS[group]);
    }
    sheet.getRow(1).height = 20;
  }
  const header = sheet.getRow(headerRow); header.height = 48;
  columns.forEach((column, index) => { const cell = header.getCell(index + 1); cell.value = column.header; styleHeader(cell, column.ems || column.formula ? COLORS.ems : (column.group ? COLORS[column.group] : COLORS.cuota)); });
  rows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(headerRow + 1 + rowIndex);
    columns.forEach((column, index) => {
      const cell = excelRow.getCell(index + 1);
      if (column.formula) cell.value = { formula: column.formula({ L: Object.fromEntries(Object.entries(L).map(([key, letter]) => [key, `${letter}${headerRow + 1 + rowIndex}`])) }) };
      else { const value = valueOf(row, column); cell.value = column.kind === "date" ? toDate(value) : (value === "" ? null : value); }
      if (column.format) cell.numFmt = column.format;
      cell.border = BORDER;
      if (column.align) cell.alignment = { horizontal: column.align, vertical: "top" }; else cell.alignment = { vertical: "top", wrapText: column.width >= 30 };
      if (column.ems || column.formula) cell.fill = fill(COLORS.gris);
    });
  });
  const lastRow = headerRow + Math.max(rows.length, 1);
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: columns.length } };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return { sheet, L, lastRow };
}

export function writeWorkbook(data, meta, path) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = "ETL EMS 2.0"; workbook.created = new Date();
  const { ot, cuotas, observaciones } = data;

  // Léame
  const readme = workbook.addWorksheet("Léame", { properties: { tabColor: { argb: `FF${COLORS.ems}` } } }); readme.getColumn(1).width = 120;
  const lines = [
    ["Verificación Legacy ↔ EMS 2.0 — OT de cliente", "title"],
    [`Generado el ${meta.generatedAt}. Fuente: CSV de carga v3 (respaldo del sistema anterior del 06/11/2026, 16:00). Archivos: ${meta.files.join(", ")}.`],
    ["", ""],
    ["Qué es", "h"],
    ["Una fila por OT de cliente del alcance de la migración (155) y una fila por cuota o nota del plan de pagos (428). La clave de correspondencia es el COT; el código EMS lo genera el sistema al cargar y puede cambiar entre cargas."],
    ["Las columnas grises (lado EMS) quedan vacías hasta que las OT estén cargadas en el EMS; al completarlas, las columnas Δ calculan la diferencia contra el Legacy."],
    ["", ""],
    ["Cómo leer los importes", "h"],
    ["Todo en la moneda de la OT; USD y BOB nunca se suman. Presupuestado = presupuestoHoras del sistema anterior (honorario neto en USD). Gastos presupuestados = positivos del plan de gastos; en una OT en BOB se multiplican por el TC de la OT, hacia arriba al centavo."],
    ["Total acordado original = el total con impuestos del sistema anterior: honorariosBs en las OT en BOB y honorariosSus en las OT en USD (contrato legacy-agreed-total-v1). En el Legacy, honorariosSus = (presupuestado + gastos) ÷ 0,84. honorariosBs no siempre es honorariosSus × TC exacto (el sistema anterior lo redondea a enteros); se muestra tal cual."],
    ["Honorario estándar = Σ horas × tarifa presupuestada, en USD y en la moneda de la OT. En una OT en BOB, cada tarifa se pasa a BOB al TC de la OT, hacia arriba; el EMS promedia por categoría, por lo que su estándar puede diferir en menos de BOB 12."],
    ["Realización % (Legacy) = presupuestado ÷ honorario estándar (USD): cuánto del estándar se cumple con lo acordado con el cliente; 100 % es lo estándar y baja si se rebaja. Reproduce la columna realPresupuestada del sistema anterior (que la guarda con 1 decimal) en las 155 OT. La realización del EMS puede diferir por diseño: su ajuste sale del total acordado."],
    ["", ""],
    ["Cómo leer las horas", "h"],
    [`Solo horas aprobadas con día trabajado hasta el ${formatDate(meta.hoursCutoff)} (65.470 h en total). Las horas posteriores y las no aprobadas no se muestran. Las OT administrativas no forman parte de este informe. Horas importadas EMS = las ligadas al lote de la migración; las que se registren en el EMS desde el 02/11 no cuentan.`],
    ["", ""],
    ["Cómo leer las cuotas", "h"],
    ["El sistema anterior solo guarda porcentaje, fecha y detalle de cada cuota; el monto se calcula como % × total acordado, y la última cuota facturable absorbe el redondeo para que las cuotas sumen exactamente el total. Las filas «no facturar» no son cuotas: se conservan como nota del plan."],
    [`Fecha de pago = fecha de factura + 30 días hábiles (lunes a viernes, sin descontar feriados; el EMS usa días hábiles bolivianos y puede diferir unos días). «Vencida» = fecha de pago igual o anterior al ${formatDate(meta.overdueReference)}, fecha fija del respaldo. El sistema anterior no registra cobros: no se sabe cuáles se cobraron.`],
    ["Las banderas son informativas: fecha atípica (orden roto, anterior a la creación de la OT por más de 60 días, o misma fecha que otra cuota), «facturada por texto» (el detalle dice «ya fue facturado»; la fecha de factura es una inferencia) y TC distinto de 6,96. «Posible causa» es una inferencia no verificada con el negocio."],
  ];
  lines.forEach(([content, style], index) => {
    const cell = readme.getCell(index + 1, 1); cell.value = content; cell.alignment = { wrapText: true, vertical: "top" };
    if (style === "title") { cell.font = { bold: true, size: 14, color: { argb: `FF${COLORS.cuota}` } }; }
    if (style === "h") { cell.font = { bold: true, color: { argb: `FF${COLORS.honorarios}` } }; }
  });

  // OT
  writeDataSheet(workbook, "OT", withHeaders(OT_COLUMNS, { horasEjecutadas: `Horas ejecutadas aprobadas (hasta ${formatDate(meta.hoursCutoff).slice(0, 5)})` }), ot, { headerRow: 2, groupBand: OT_GROUPS, valueOf: (row, column) => (column.ems ? null : row[column.key]) });

  // Cuotas
  const flagText = (row, key) => (row[key] ? "Sí" : "");
  const cuotaSheet = writeDataSheet(workbook, "Cuotas", withHeaders(CUOTA_COLUMNS, { vencida: `Vencida al ${formatDate(meta.overdueReference)}` }), cuotas, {
    headerRow: 1,
    valueOf: (row, column) => {
      if (column.ems) return null;
      if (column.key === "vencida") return row.vencida === null ? "" : (row.vencida ? "Sí" : "No");
      if (column.key === "facturadaPorTexto" || column.key === "tcDistinto") return flagText(row, column.key);
      return row[column.key];
    },
  });
  cuotas.forEach((row, index) => {
    const excelRow = cuotaSheet.sheet.getRow(2 + index);
    if (row.fechaAtipica) { excelRow.getCell(14).fill = fill(COLORS.alertaRoja); excelRow.getCell(15).fill = fill(COLORS.alertaRoja); }
    if (row.facturadaPorTexto) excelRow.getCell(16).fill = fill(COLORS.alertaAmarilla);
    if (row.tcDistinto) excelRow.getCell(17).fill = fill(COLORS.alertaNaranja);
    if (row.monto === null) excelRow.eachCell((cell) => { cell.font = { italic: true, color: { argb: "FF595959" } }; });
  });

  // Observaciones
  const obs = workbook.addWorksheet("Observaciones", { properties: { tabColor: { argb: `FF${COLORS.riesgos}` } } });
  obs.columns = [{ width: 58 }, { width: 11 }, { width: 11 }, { width: 70 }];
  const o = observaciones; let r = 1;
  obs.getCell(r, 1).value = "Observaciones al plan de pagos para Contabilidad"; obs.getCell(r, 1).font = { bold: true, size: 14, color: { argb: `FF${COLORS.cuota}` } }; r += 1;
  obs.getCell(r, 1).value = `Ninguna impide la migración: los planes se cargan como están en el sistema anterior. Cifras al ${formatDate(meta.overdueReference)}; ${o.cuotasTotales} cuotas facturables.`; r += 2;
  ["Observación", "Cuotas", "OT", "Qué se pide"].forEach((text, index) => { const cell = obs.getCell(r, index + 1); cell.value = text; styleHeader(cell, COLORS.cuota); }); r += 1;
  const rows = [
    ["1. Fechas de factura atípicas", o.fechasAtipicas.cuotas, o.fechasAtipicas.ot, "Revisar con el gerente de cada OT. Se conservan tal cual; cualquier corrección se hace después en el EMS."],
    ["    · orden roto (anterior a la cuota previa)", o.fechasAtipicas.ordenRoto.cuotas, o.fechasAtipicas.ordenRoto.ot, ""],
    ["    · anterior a la creación de la OT por más de 60 días", o.fechasAtipicas.anteriorCreacion.cuotas, o.fechasAtipicas.anteriorCreacion.ot, ""],
    ["    · misma fecha que otra cuota del plan", o.fechasAtipicas.mismaFecha.cuotas, o.fechasAtipicas.mismaFecha.ot, ""],
    ["2. Cuotas ya facturadas según el detalle", o.facturadas.cuotas, o.facturadas.ot, "Verificar con los comprobantes de factura, si existen: la fecha de factura es una inferencia."],
    [`3. Cuotas vencidas al ${formatDate(meta.overdueReference)}`, o.vencidas.cuotas, o.vencidas.ot, `El sistema anterior no registra cobros y en el EMS todas nacen pendientes. Confirmar cuáles ya se cobraron (${o.vencidas.otTodasVencidas} OT con todas sus cuotas vencidas).`],
    ["4. Filas «no facturar» conservadas como nota del plan", o.notas.cuotas, o.notas.ot, "Informativo: no son cuotas; las demás suman el total."],
    ["5. OT con TC distinto de 6,96", "", o.tcDistinto.ot, `Informativo. Menores que el oficial: ${o.tcDistinto.menoresAlOficial.join(", ") || "ninguna"}.`],
  ];
  for (const values of rows) { values.forEach((value, index) => { const cell = obs.getCell(r, index + 1); cell.value = value === "" ? null : value; cell.border = BORDER; cell.alignment = { wrapText: true, vertical: "top", horizontal: index === 1 || index === 2 ? "center" : "left" }; }); r += 1; }
  obs.getCell(r, 1).value = "Las cuotas reparten el total original con gastos incluidos; el EMS muestra los gastos aparte."; obs.getCell(r, 1).font = { italic: true }; r += 2;
  obs.getCell(r, 1).value = `Cuotas vencidas por gerente del encargo (al ${formatDate(meta.overdueReference)})`; obs.getCell(r, 1).font = { bold: true, color: { argb: `FF${COLORS.honorarios}` } }; r += 1;
  ["Gerente del encargo", "OT", "Cuotas vencidas", "OT con todas sus cuotas vencidas"].forEach((text, index) => { const cell = obs.getCell(r, index + 1); cell.value = text; styleHeader(cell, COLORS.honorarios); }); r += 1;
  for (const row of o.porGerente) { [row.gerente, row.ot, row.vencidas, row.otTodasVencidas].forEach((value, index) => { const cell = obs.getCell(r, index + 1); cell.value = value; cell.border = BORDER; if (index) cell.alignment = { horizontal: "center" }; }); r += 1; }
  const total = (key) => o.porGerente.reduce((sum, row) => sum + row[key], 0);
  ["Total", total("ot"), total("vencidas"), total("otTodasVencidas")].forEach((value, index) => { const cell = obs.getCell(r, index + 1); cell.value = value; cell.font = { bold: true }; cell.border = BORDER; if (index) cell.alignment = { horizontal: "center" }; });

  return workbook.xlsx.writeFile(path);
}
