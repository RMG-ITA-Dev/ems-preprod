import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { rpcUntyped } from "@/lib/rpcUntyped";

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
  /**
   * El orden lo decide el SERVIDOR, no la pantalla, porque la lista viene paginada: agrupar en
   * el cliente sobre un orden por fecha parte una orden de 12 cuotas entre dos páginas.
   * `ot` deja contiguas las cuotas de una misma orden; `fecha`, lo que vence primero.
   */
  order?: "fecha" | "ot";
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
  /**
   * Cobranzas Fase 9: `amount` es el CONTRATO y `amount_effective` lo que queda por cobrar
   * después de los descuentos vigentes. Los dos, porque la diferencia entre ellos es
   * justamente lo que hay que explicar.
   */
  adjustments_total: number;
  amount_effective: number;
  /**
   * La diferencia de cambio va SIEMPRE en Bs, así que en una cuota en otra moneda no se puede
   * sumar al monto: viaja aparte. 0 cuando la cuota ya va en Bs o no tiene ninguna.
   */
  exchange_difference_bob: number;
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
      adjustments_total: Number(row.adjustments_total ?? 0),
      amount_effective: Number(row.amount_effective ?? 0),
      exchange_difference_bob: Number(row.exchange_difference_bob ?? 0),
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
        p_order: filters.order ?? "fecha",
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
