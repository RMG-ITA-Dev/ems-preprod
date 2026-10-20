// Cobranzas Fase 8 — la pantalla de Cobranzas.
//
// Se prueban las decisiones que la pantalla toma por su cuenta, no el pintado:
//   * la escalera de estados del rol (nunca un "no autorizado" mientras carga);
//   * qué filtros manda al servidor, porque TODO el filtrado y la paginación ocurren allá;
//   * que cambiar un filtro vuelva a la primera página;
//   * que los totales se muestren por moneda, sin sumarlas entre sí.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CollectionsFilters, CollectionsResult } from "@/hooks/useCollections";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Select nativo: en jsdom el de Radix no se puede manipular directamente.
// Tabs nativos: los de Radix no cambian de valor con un click sintetico en jsdom.
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children?: React.ReactNode }) => (
    <div data-testid="tabs" data-value={value} onClick={(e) => {
      const v = (e.target as HTMLElement).getAttribute("data-value");
      if (v) onValueChange?.(v);
    }}>{children}</div>
  ),
  TabsList: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <button type="button" data-value={value}>{children}</button>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children?: React.ReactNode }) => (
    <select value={value ?? ""} onChange={(e) => onValueChange?.(e.target.value)}>{children}</select>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => <option value={value}>{children}</option>,
}));

const authState = {
  roleKey: "collections_analyst" as string | null,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ ...authState, can: () => false }),
}));

const emptyResult: CollectionsResult = {
  today: "2026-06-15",
  tab: "por_facturar",
  limit: 50,
  offset: 0,
  total_count: 0,
  totals: { por_facturar_mes: {}, facturado_sin_cobrar: {}, en_mora: {} },
  rows: [],
};

let lastFilters: CollectionsFilters | undefined;
let lastEnabled: boolean | undefined;
let result: CollectionsResult = emptyResult;

vi.mock("@/hooks/useCollections", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useCollections")>();
  return {
    ...actual,
    // El hook real SIEMPRE se llama; lo que decide si sale la consulta es `enabled`. Por eso
    // el test mira `enabled` y no si el hook se invoco.
    useCollections: (filters: CollectionsFilters, enabled = true) => {
      lastFilters = filters;
      lastEnabled = enabled;
      return { data: enabled ? result : undefined, isLoading: false, isError: false };
    },
    useCollectionsFilterOptions: () => ({
      data: {
        societies: [{ society_id: "s1", name: "Sociedad A" }],
        practicas: [{ code: 1, name: "Auditoría", abbreviation: "AUD" }],
        managers: [{ staff_id: "m1", name: "Ana Gerente" }],
        currencies: ["BOB", "USD"],
      },
    }),
  };
});

import Collections from "@/pages/Collections";

const renderPage = () =>
  render(
    <MemoryRouter>
      <Collections />
    </MemoryRouter>,
  );

beforeEach(() => {
  authState.roleKey = "collections_analyst";
  authState.isLoading = false;
  authState.isError = false;
  lastFilters = undefined;
  lastEnabled = undefined;
  result = emptyResult;
});

describe("Collections — acceso", () => {
  it("mientras el rol carga no muestra ni el contenido ni el 'no autorizado'", () => {
    // Un flash de "no autorizado" en cada carga enseña a la gente a ignorarlo.
    authState.isLoading = true;
    renderPage();
    expect(screen.queryByText("collections.forbidden")).not.toBeInTheDocument();
    expect(screen.queryByText("collections.tab_por_facturar")).not.toBeInTheDocument();
    expect(lastEnabled).toBe(false);
  });

  it("un fallo al leer el rol es un ERROR con reintento, no un veredicto de permiso", () => {
    authState.isError = true;
    renderPage();
    expect(screen.getByText("collections.roleLoadFailed")).toBeInTheDocument();
    expect(screen.queryByText("collections.forbidden")).not.toBeInTheDocument();
  });

  it("el gerente del encargo ve el aviso y la pantalla no consulta nada", () => {
    authState.roleKey = "manager";
    renderPage();
    expect(screen.getByText("collections.forbidden")).toBeInTheDocument();
    expect(lastEnabled).toBe(false);
  });

  it("el Analista de Contabilidad tampoco entra", () => {
    authState.roleKey = "accounting_analyst";
    renderPage();
    expect(screen.getByText("collections.forbidden")).toBeInTheDocument();
  });

  it("el Gerente de Contabilidad entra igual que el Analista de Cobranzas", () => {
    authState.roleKey = "accounting_manager";
    renderPage();
    expect(screen.queryByText("collections.forbidden")).not.toBeInTheDocument();
    expect(lastFilters?.tab).toBe("por_facturar");
  });
});

describe("Collections — lo que le pide al servidor", () => {
  it("abre en 'Por facturar', que es lo primero que se revisa cada día", () => {
    renderPage();
    expect(lastFilters?.tab).toBe("por_facturar");
    expect(lastFilters?.offset).toBe(0);
  });

  it("cambiar de pestaña vuelve a la primera página", () => {
    result = { ...emptyResult, total_count: 300 };
    renderPage();
    fireEvent.click(screen.getByText("collections.tab_en_mora"));
    expect(lastFilters?.tab).toBe("en_mora");
    expect(lastFilters?.offset).toBe(0);
  });

  it("manda la búsqueda al servidor, no filtra en memoria", () => {
    // La cartera entera no cabe en el navegador: filtrar acá obligaría a traerla toda.
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("collections.searchPlaceholder"), {
      target: { value: "acme" },
    });
    expect(lastFilters?.search).toBe("acme");
  });

  it("un filtro nuevo devuelve a la primera página", () => {
    // Quedarse en la página 4 de un resultado que ahora tiene una sola deja la tabla vacía
    // sin explicar por qué.
    result = { ...emptyResult, total_count: 300 };
    const { container } = renderPage();
    fireEvent.click(screen.getByText("common.next"));
    expect(lastFilters?.offset).toBe(50);
    const societySelect = container.querySelectorAll("select")[0];
    fireEvent.change(societySelect, { target: { value: "s1" } });
    expect(lastFilters?.societyId).toBe("s1");
    expect(lastFilters?.offset).toBe(0);
  });

  it("los selectores en 'Todos' no mandan filtro", () => {
    renderPage();
    expect(lastFilters?.societyId).toBeNull();
    expect(lastFilters?.practica).toBeNull();
    expect(lastFilters?.managerId).toBeNull();
    expect(lastFilters?.currency).toBeNull();
  });

  it("el interruptor de gastos ejecutados viaja al servidor", () => {
    // Tiene que sacarlos también de los TOTALES, y eso sólo puede decidirlo la RPC.
    renderPage();
    expect(lastFilters?.includeExpenseRows).toBe(true);
    fireEvent.click(screen.getByLabelText("collections.includeExpenseRows"));
    expect(lastFilters?.includeExpenseRows).toBe(false);
  });
});

describe("Collections — totales", () => {
  it("muestra un subtotal por moneda y nunca uno solo sumado", () => {
    result = {
      ...emptyResult,
      totals: {
        por_facturar_mes: { BOB: 1000 },
        facturado_sin_cobrar: { BOB: 5000, USD: 500 },
        en_mora: {},
      },
    };
    renderPage();
    // Bs y USD aparecen por separado; 5500 (la suma) no existe en ningún lado.
    expect(screen.getByText("5.000")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.queryByText("5.500")).not.toBeInTheDocument();
    expect(screen.queryByText("5,500")).not.toBeInTheDocument();
  });

  it("sin nada que mostrar, el total dice '—' en vez de 0", () => {
    // Un 0 se lee como "no hay deuda"; el guion dice "no hay nada en esta categoría".
    renderPage();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
