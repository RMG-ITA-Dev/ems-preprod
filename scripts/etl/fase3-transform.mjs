// Transformaciones puras F3: los importes se conservan como enteros escalados, nunca Number acumulado.
import { isInvoicedInstallment, isPlanNote } from "./fase3-input.mjs";
import { resolveEndDate } from "./snapshot-manifest.mjs";

const POW10 = (scale) => 10n ** BigInt(scale);
export function decimalUnits(value, scale = 2) {
  const source = String(value ?? "").trim(); const match = source.match(/^(-?)(\d+)(?:\.(\d+))?$/); const fraction = (match?.[3] ?? "").replace(/0+$/, "");
  if (!match || fraction.length > scale) throw new Error(`decimal incompatible con precisión ${scale}: ${source}`);
  return (match[1] === "-" ? -1n : 1n) * (BigInt(match[2]) * POW10(scale) + BigInt(fraction.padEnd(scale, "0")));
}
export function formatUnits(units, scale = 2) {
  const sign = units < 0n ? "-" : ""; const absolute = units < 0n ? -units : units; const base = POW10(scale); const integer = absolute / base; const fraction = String(absolute % base).padStart(scale, "0").replace(/0+$/, "");
  return `${sign}${integer}${fraction ? `.${fraction}` : ""}`;
}
const pctOf = (units, pct) => units * BigInt(pct) / 100n;
const act = (practice, phase) => ({ AUD: { plan: "AUD-A2", execution: "AUD-A3", specialistIt: "AUD-A5", specialistTax: "AUD-A6" }, COM: { plan: "COM-A1", execution: "COM-A2" }, TAX: { plan: "TAX-A1", execution: "TAX-A2" } })[practice]?.[phase];
const practiceFor = (department) => ({ 1: "AUD", 2: "COM", 3: "TAX" })[Number(department)];
const categoryFor = (id, practice) => ({ 1: "Socio", 2: "Director", 3: "Gerente", 4: "Gerente", 5: "Senior", 9: "Asistente", 12: "Asistente", 13: "Supervisor", 16: practice === "AUD" ? "Semi-Senior" : "Semi Senior" })[Number(id)];
// El perfil legacy 89 es la misma persona que el 62 (cuenta duplicada): toda referencia a un responsable lo absorbe en el 62.
export const LEGACY_PROFILE_ALIASES = Object.freeze({ 89: 62 });
export const aliasProfile = (profile) => { const id = String(profile ?? "").trim(); return String(LEGACY_PROFILE_ALIASES[id] ?? id); };
const societyForDepartment = (department) => ({ 1: "Pelaez", 2: "Jauregui", 3: "Jauregui" })[Number(department)];
const required = (value, label) => { if (!value) throw new Error(`referencia F3 no resuelta: ${label}`); return value; };

// options.endDates: { allowed, byYear } del manifiesto del snapshot (fines de vigencia permitidos). El fin sale de la columna ems_end_date del CSV.
export function buildClientEngagementPayloads(rows, maps, { endDates } = {}) {
  if (!endDates) throw new Error("buildClientEngagementPayloads exige endDates del manifiesto del snapshot");
  return rows.map((row) => {
    const fiscalYear = Number(row.gestion); const department = Number(row.legacy_department_id);
    const client = required(maps.clients[`legacy:${row.legacy_client_id}`], `cliente ${row.legacy_client_id}`);
    const service = required(maps.services[row.legacy_service_id], `servicio ${row.legacy_service_id}`);
    const staff = (profile, label) => profile ? required(maps.staff[`legacy:${aliasProfile(profile)}`], `${label} ${profile}`) : null;
    return {
      sourceKey: row.legacy_cot,
      // D (09/11/2026): {cliente} - {servicio} - {COT legacy}; el COT hace único el nombre y se puede buscar por él.
      name: `${client.name} - ${service.name} - ${row.legacy_cot}`,
      clientId: client.id, partnerId: staff(row.legacy_partner_profile_id, "socio"), managerId: staff(row.legacy_manager_profile_id, "gerente"),
      sqrId: staff(row.legacy_sqr_profile_id, "SQR"), encargadoId: staff(row.legacy_manager_in_charge_profile_id, "encargado"),
      itSpecialistId: staff(row.legacy_it_specialist_profile_id, "especialista IT"), taxSpecialistId: staff(row.legacy_tax_specialist_profile_id, "especialista Tax"),
      startDate: String(row.ems_start_date), endDate: resolveEndDate(row, endDates),
      closingDate: `${fiscalYear}-09-30`, status: "active", office: Number(row.legacy_city_id), practice: department, function: 1, fiscalYear,
      workOrderRequired: true, activityRequired: true, internal: false, approvalRequired: true, fiscalOverride: false,
      societyId: required(maps.societies[societyForDepartment(department)], `sociedad práctica ${department}`), taxonomyId: service.id, contractFilePath: null,
    };
  });
}

// D12/D22/D27: la sociedad y el cliente interno salen del socio (Pelaez o Jauregui); el equipo es socio + gerente (el aprobador legacy).
export function buildAdministrativeEngagementPayloads(rows, maps) {
  return rows.map((row) => {
    const partner = required(maps.staff[`legacy:${aliasProfile(row.legacy_partner_profile_id)}`], `socio administrativo ${row.legacy_partner_profile_id}`);
    const manager = required(maps.staff[`legacy:${aliasProfile(row.legacy_approver_profile_id)}`], `aprobador administrativo ${row.legacy_approver_profile_id}`);
    const societyKey = required(maps.societyKeyByStaffId?.[partner], `sociedad del socio ${row.legacy_partner_profile_id}`);
    return { sourceKey: row.legacy_cot, name: required(String(row.legacy_engagement_name).trim(), `nombre administrativo ${row.legacy_cot}`), clientId: required(maps.internalClients?.[societyKey], `cliente interno ${societyKey}`), partnerId: partner,
      managerId: manager, sqrId: null, encargadoId: null, itSpecialistId: null, taxSpecialistId: null, startDate: String(row.legacy_created_date), endDate: "2027-09-30", closingDate: "2027-09-30", status: "active", office: required(maps.officeByStaffId[partner], `oficina socio ${row.legacy_partner_profile_id}`), practice: 0, function: 0, fiscalYear: 2027,
      workOrderRequired: false, activityRequired: false, internal: true, approvalRequired: true, fiscalOverride: false, societyId: required(maps.societies[societyKey], `sociedad ${societyKey}`), taxonomyId: null, contractFilePath: null };
  });
}

export function executionContributions(row) {
  const practice = practiceFor(row.legacy_department_id); const category = categoryFor(row.legacy_category_id, practice); const hours = decimalUnits(row.legacy_hours, 2);
  if (!practice || !category || hours <= 0n) throw new Error(`ejecución sin práctica/categoría: ${row.legacy_execution_id}`);
  const sqr = String(row.legacy_profile_id) === String(row.legacy_sqr_profile_id) && String(row.legacy_sqr_profile_id ?? "").trim();
  const specialty = Number(row.legacy_specialty_id); const specialist = practice === "AUD" && (specialty === 1 || specialty === 3);
  if (sqr && specialist) throw new Error(`colisión SQR/especialista: ${row.legacy_execution_id}`);
  const base = { legacy_execution_id: row.legacy_execution_id, legacy_cot: row.legacy_cot, legacy_profile_id: row.legacy_profile_id, date_worked: String(row.legacy_worked_at).slice(0, 10), is_forecast: false, period_id: null, category_name: category };
  if (sqr || category === "Socio" || category === "Director") return [{ ...base, activity_code: act(practice, "plan"), hours: formatUnits(hours) }];
  if (specialist) return [{ ...base, activity_code: act(practice, specialty === 1 ? "specialistIt" : "specialistTax"), hours: formatUnits(hours) }];
  if (["Gerente", "Supervisor"].includes(category)) { const planning = pctOf(hours, 30); return [{ ...base, activity_code: act(practice, "plan"), hours: formatUnits(planning) }, { ...base, activity_code: act(practice, "execution"), hours: formatUnits(hours - planning) }]; }
  return [{ ...base, activity_code: act(practice, "execution"), hours: formatUnits(hours) }];
}

const DAILY_CELL_CAP_UNITS = 9999n;

// Una entrada EMS no admite más de 99,99 horas. La partición sólo se aplica
// después de derivar la actividad y conserva cada PK legacy y sus unidades.
export function consolidateExecutions(rows) {
  const groups = new Map();
  for (const row of rows.flatMap(executionContributions)) {
    const key = [row.legacy_profile_id, row.legacy_cot, row.activity_code, row.date_worked, row.is_forecast].join("|");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const cells = [];
  for (const contributions of groups.values()) {
    let cell; let splitIndex = 0;
    for (const contribution of contributions) {
      let remaining = decimalUnits(contribution.hours);
      while (remaining > 0n) {
        if (!cell || cell.units === DAILY_CELL_CAP_UNITS) {
          cell = { ...contribution, split_index: ++splitIndex, source_ids: [], source_allocations: [], units: 0n };
          cells.push(cell);
        }
        const allocated = remaining > DAILY_CELL_CAP_UNITS - cell.units ? DAILY_CELL_CAP_UNITS - cell.units : remaining;
        cell.units += allocated;
        if (!cell.source_ids.includes(contribution.legacy_execution_id)) cell.source_ids.push(contribution.legacy_execution_id);
        cell.source_allocations.push({ legacy_execution_id: contribution.legacy_execution_id, hours: formatUnits(allocated) });
        remaining -= allocated;
      }
    }
  }
  return cells.map(({ units, ...row }) => ({ ...row, hours: formatUnits(units) }));
}

// F2 puede resolver más de un perfil legacy a la misma ficha EMS. Después de
// esa resolución se vuelve a consolidar por la clave única real de destino,
// preservando el puente PK legacy → fracción y el máximo diario de 99,99.
export function consolidateResolvedHours(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = [row.staffId, row.engagementId, row.activityId, row.dateWorked, row.isForecast].join("|");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const cells = [];
  for (const [key, entries] of groups) {
    let cell; let splitIndex = 0;
    for (const entry of entries.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey))) {
      for (const allocation of entry.sourceAllocations ?? []) {
        let remaining = decimalUnits(allocation.hours);
        while (remaining > 0n) {
          if (!cell || cell.units === DAILY_CELL_CAP_UNITS) { const etlSplitIndex = ++splitIndex; cell = { ...entry, sourceKey: `resolved:${key}:${etlSplitIndex}`, etlSplitIndex, sourceAllocations: [], units: 0n }; cells.push(cell); }
          const allocated = remaining > DAILY_CELL_CAP_UNITS - cell.units ? DAILY_CELL_CAP_UNITS - cell.units : remaining;
          cell.units += allocated; cell.sourceAllocations.push({ legacy_execution_id: allocation.legacy_execution_id, hours: formatUnits(allocated) }); remaining -= allocated;
        }
      }
    }
  }
  return cells.map(({ units, ...row }) => ({ ...row, hours: formatUnits(units) }));
}

// D26 (10/11/2026): todo el legacy está en dólares; una OT en BOB tiene su honorario ajustado en USD (presupuestoHoras) y se convierte con el
// TC acordado de la OT. Redondeo hacia arriba al centavo (D29); con los datos del 06/11 el producto es exacto a 2 decimales (0 centavos de ajuste).
// La fila es la del encargo cliente del CSV: legacy_fee_with_tax = presupuestoHoras, legacy_currency_raw (0 = BOB, 1 = USD) y legacy_exchange_rate.
export function budgetInOtCurrency(row) {
  const usd = decimalUnits(row.legacy_fee_with_tax); const currency = String(row.legacy_currency_raw ?? "").trim();
  if (currency === "1") return formatUnits(usd);
  if (currency !== "0") throw new Error(`moneda legacy inválida: ${row.legacy_cot}`);
  const rate = decimalUnits(row.legacy_exchange_rate);
  if (rate <= 0n) throw new Error(`TC BOB ausente o inválido: ${row.legacy_cot}`);
  return formatUnits((usd * rate + 99n) / 100n);
}
// D33 (11/11/2026): TODAS las OT migradas llevan temporada Alta. El legacy no tiene temporada: calculó cada OT con una sola tarifa (la alta), incluso en las industrias con cierre en marzo (10, 12 y 37), que en EMS usarían Baja. El parámetro se conserva por compatibilidad.
export function seasonForIndustry(_legacyIndustryId) { return "High"; }
export function adjustedFee(standardFee, budgetHours) { return formatUnits(decimalUnits(budgetHours) - decimalUnits(standardFee)); }
export function feeWithTax(adjusted) { const units = decimalUnits(adjusted); return formatUnits((units * 100n + 83n) / 84n); } // honorario con impuesto = ajustado / (1 - 0,16) redondeado HACIA ARRIBA a centavos (D28 y D29, 11/11/2026); las cuotas se reparten y la última absorbe el residuo
export function expensePayload(row) {
  // BOB: importe × TC redondeado HACIA ARRIBA a centavos (D29, 11/11/2026), igual que BOB_ROUNDING de fase3-reconcile.mjs. Con los datos del 06/11 el producto ya es exacto a 2 decimales: no cambia ningún importe.
  const amount = decimalUnits(row.legacy_amount_usd); const currency = String(row.legacy_currency_raw ?? "").trim() === "1" ? "USD" : "BOB"; const rate = currency === "BOB" ? decimalUnits(row.legacy_exchange_rate) : null;
  if (amount < 0n || (currency === "BOB" && rate <= 0n)) throw new Error(`gasto/TC inválido: ${row.legacy_expense_budget_id}`);
  return { ...row, currency, amount: formatUnits(currency === "BOB" ? (amount * rate + 99n) / 100n : amount), expense_type: ({ 2: "Viaje", 3: "Comunicaciones", 4: "Reproducción", 5: "Movilidad", 6: "Circularización" })[Number(row.legacy_expense_type_id)] };
}

const roundRatio = (numerator, denominator) => (numerator * 2n + denominator) / (2n * denominator);
// options.toleranceCots: COT cuyo plan puede sumar hasta 100,03 % (D18: 2024.22.002; la última cuota absorbe el exceso). Ningún otro COT.
export function paymentArtifacts(rows, feeWithTaxValue, { toleranceCots = [] } = {}) {
  const billable = rows.filter((row) => !isPlanNote(row)).sort((a, b) => Number(a.legacy_installment_number) - Number(b.legacy_installment_number)); const notes = rows.filter(isPlanNote);
  const scale = Math.max(...billable.map((row) => (String(row.legacy_percentage ?? "").trim().split(".")[1] ?? "").length));
  if (!billable.length || scale > 6) throw new Error(`porcentaje de cuotas no conciliable: precisión ${scale}`);
  const denominator = 100n * POW10(scale); const original = billable.reduce((sum, row) => sum + decimalUnits(row.legacy_percentage, scale), 0n); const correction = denominator - original;
  const tolerance = scale >= 2 ? POW10(scale - 2) : 1n;
  const approved = new Set(toleranceCots).has(String(rows[0]?.legacy_cot ?? "")); const lowest = approved ? -3n * tolerance : -tolerance;
  if (correction < lowest || correction > 4n * tolerance) throw new Error(`porcentaje de cuotas no conciliable: ${formatUnits(original, scale)}`);
  const fee = decimalUnits(feeWithTaxValue);
  // Es el equivalente entero de computeAmount(percentage, feeWithTax): el producto
  // se redondea a dos decimales para CADA cuota, no al total acumulado.
  const installments = billable.map((row, index) => { const percentage = decimalUnits(row.legacy_percentage, scale) + (index === billable.length - 1 ? correction : 0n); const amount = roundRatio(fee * percentage, denominator); return { ...row, percentage: formatUnits(percentage, scale), amount: formatUnits(amount), payment_days: 30, payment_due_date: addBusinessDays(row.legacy_invoice_date, 30), invoiced: isInvoicedInstallment(row), exchange_rate_mode: String(row.legacy_currency_raw ?? "").trim() === "1" ? "fijo" : null }; });
  const expected = fee; const actual = installments.reduce((sum, row) => sum + decimalUnits(row.amount), 0n); const residual = expected - actual; const cot = String(rows[0]?.legacy_cot ?? "");
  if (residual !== 0n) installments[installments.length - 1].amount = formatUnits(decimalUnits(installments.at(-1).amount) + residual);
  const reconciled = installments.reduce((sum, row) => sum + decimalUnits(row.amount), 0n); if (expected !== reconciled) throw new Error(`residuo monetario de cuotas: ${formatUnits(expected - reconciled)}`);
  return { installments, notes: notes.map((row) => ({ ...row, installment_id: null, body: noteBody(row) })) };
}
export function noteBody(row) { return `COT: ${row.legacy_cot}\nCuota legacy: ${row.legacy_installment_number}\nPorcentaje legacy: ${row.legacy_percentage}%\n[INICIO TEXTO LEGACY]\n${row.legacy_detail}\n[FIN TEXTO LEGACY]`; }
// Decisión del operador (04/11/2026): la fecha de pago es la de factura más 30 días laborables, de lunes a viernes, SIN considerar feriados.
// Es deliberadamente más simple que el front (que salta feriados nacionales); no depende de ningún calendario.
export function addBusinessDays(dateText, days) { const date = new Date(`${dateText}T00:00:00Z`); let left = days; while (left > 0) { date.setUTCDate(date.getUTCDate() + 1); const weekday = date.getUTCDay(); if (weekday !== 0 && weekday !== 6) left -= 1; } return date.toISOString().slice(0, 10); }
