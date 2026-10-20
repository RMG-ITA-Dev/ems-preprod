import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cobranzas Fase 8 (issue #352) — la pantalla de Cobranzas del día a día.
 *
 * Una sola llamada trae la página de la pestaña, su total de filas y los tres totales de la
 * cabecera. Van juntos a propósito: si los totales vinieran de otra consulta, podrían
 * describir un instante distinto al de la lista que está debajo.
 *
 * Todo el trabajo —filtrar, ordenar, paginar y sumar— ocurre en el servidor. La cartera
 * completa de la firma no cabe en el navegador, y sumar en el cliente obligaría a traerla
 * entera para mostrar tres números.
 */
export type CollectionsTab = "por_facturar" | "por_cobrar" | "en_mora" | "cobradas";

export interface CollectionsFilters {
  tab: CollectionsTab;
  societyId?: string | null;
  practica?: number | null;
  managerId?: string | null;
  clientId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  currency?: string | null;
  search?: string | null;
  includeExpenseRows?: boolean;
  limit?: number;
  offset?: number;
}

export interface CollectionsContact {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  contact_type: string | null;
}

export interface CollectionsRow {
  installment_id: string;
  installment_number: number;
  installment_type: "fee" | "expense_reimbursement";
  wo_id: string;
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string | null;
  client_id: string;
  client_legal_name: string;
  unique_tax_id: string | null;
  society_id: string | null;
  practica: number | null;
  manager_id: string | null;
  manager_name: string | null;
  amount: number | null;
  currency: string;
  status: "Pending" | "Invoiced" | "Completed" | "Overdue";
  /** La regla única de mora, resuelta en el servidor. */
  calendar_state: string;
  confirmation_status: string | null;
  agreed_invoice_date: string | null;
  agreed_payment_date: string | null;
  invoice_date_vigente: string | null;
  due_date_vigente: string | null;
  collection_invoice_date: string | null;
  payment_date_actual: string | null;
  /** La fecha por la que se ordena y se filtra: facturación antes de facturar, vencimiento después. */
  fecha_relevante: string | null;
  days_overdue: number;
  was_rescheduled: boolean;
  has_notes: boolean;
  contact: CollectionsContact | null;
}

/** Totales por moneda: `{ BOB: 1234, USD: 56 }`. Nunca se suman entre sí. */
export type TotalsByCurrency = Record<string, number>;

export interface CollectionsResult {
  today: string;
  tab: CollectionsTab;
  limit: number;
  offset: number;
  total_count: number;
  totals: {
    por_facturar_mes: TotalsByCurrency;
    facturado_sin_cobrar: TotalsByCurrency;
    en_mora: TotalsByCurrency;
  };
  rows: CollectionsRow[];
}

// types.ts está desactualizado y no conoce las RPC de cobranzas; mismo puente que
// useWorkOrderPaymentPlanMutations y useBillableExpenses. Se borra cuando se regeneren.
const rpcUntyped = supabase.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

const EMPTY_TOTALS = { por_facturar_mes: {}, facturado_sin_cobrar: {}, en_mora: {} };

function normalize(raw: unknown, filters: CollectionsFilters): CollectionsResult {
  const r = (raw ?? {}) as Partial<CollectionsResult>;
  return {
    today: r.today ?? "",
    tab: r.tab ?? filters.tab,
    limit: Number(r.limit ?? 50),
    offset: Number(r.offset ?? 0),
    total_count: Number(r.total_count ?? 0),
    totals: { ...EMPTY_TOTALS, ...(r.totals ?? {}) } as CollectionsResult["totals"],
    // Los importes vienen como NUMERIC y PostgREST los entrega en string: se convierten acá,
    // una vez, para que ninguna pantalla haga aritmética con texto.
    rows: (r.rows ?? []).map((row) => ({
      ...row,
      amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
      days_overdue: Number(row.days_overdue ?? 0),
    })),
  };
}

export function useCollections(filters: CollectionsFilters, enabled = true) {
  return useQuery({
    queryKey: ["collections", filters],
    queryFn: async (): Promise<CollectionsResult> => {
      const { data, error } = await rpcUntyped("list_collections_installments", {
        p_tab: filters.tab,
        p_society_id: filters.societyId ?? null,
        p_practica: filters.practica ?? null,
        p_manager_id: filters.managerId ?? null,
        p_client_id: filters.clientId ?? null,
        p_date_from: filters.dateFrom || null,
        p_date_to: filters.dateTo || null,
        p_currency: filters.currency ?? null,
        p_search: filters.search || null,
        p_include_expense_rows: filters.includeExpenseRows ?? true,
        p_limit: filters.limit ?? 50,
        p_offset: filters.offset ?? 0,
      });
      if (error) throw error;
      return normalize(data, filters);
    },
    enabled,
    // Al cambiar de página o de pestaña se deja la tabla anterior mientras llega la nueva: sin
    // esto, cada clic vacía la pantalla y el ojo pierde el lugar.
    placeholderData: keepPreviousData,
  });
}

/** Suma por moneda de los totales normalizados, para mostrarlos sin tocar `Object.entries` en la vista. */
export function totalsList(totals: TotalsByCurrency | undefined): Array<{ currency: string; amount: number }> {
  return Object.entries(totals ?? {})
    .map(([currency, amount]) => ({ currency, amount: Number(amount) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Las opciones de los selectores, sacadas de lo que realmente hay para cobrar. */
export interface CollectionsFilterOptions {
  societies: Array<{ society_id: string; name: string }>;
  practicas: Array<{ code: number; name: string; abbreviation: string | null }>;
  managers: Array<{ staff_id: string; name: string | null }>;
  currencies: string[];
}

export function useCollectionsFilterOptions(enabled = true) {
  return useQuery({
    queryKey: ["collections_filter_options"],
    queryFn: async (): Promise<CollectionsFilterOptions> => {
      const { data, error } = await rpcUntyped("collections_filter_options", {});
      if (error) throw error;
      const d = (data ?? {}) as Partial<CollectionsFilterOptions>;
      return {
        societies: d.societies ?? [],
        practicas: d.practicas ?? [],
        managers: d.managers ?? [],
        currencies: d.currencies ?? [],
      };
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
