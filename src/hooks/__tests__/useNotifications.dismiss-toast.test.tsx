import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * NOTIFICACIONES — el aviso de "no se pudo descartar".
 *
 * Descartar es un click explícito, así que cuando falla hay que decirlo: sin aviso la fila se
 * queda ahí y el usuario cree que la "x" no funciona. Ese toast estaba escrito en español
 * directo en el código, o sea que un usuario en inglés recibía el mensaje en español — la regla
 * 5 de AGENTS.md pide que todo texto visible pase por `t("clave")`.
 *
 * Lo que fija este archivo es que el texto salga de i18n, no cuál es el texto: el mock de
 * `useTranslation` devuelve la clave, así que la aserción es sobre la clave.
 */

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...(args as [])),
    channel: () => {
      const api = { on: () => api, subscribe: () => api };
      return api;
    },
    removeChannel: () => Promise.resolve("ok"),
  },
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { staff_id: "s-1" } }),
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { useDismissNotifications } from "../useNotifications";

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useDismissNotifications — el aviso de error pasa por i18n", () => {
  it("cuando el RPC falla, avisa con la clave de traduccion y no con texto fijo", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const { result } = renderHook(() => useDismissNotifications(), { wrapper });
    result.current.mutate(["n-1"]);

    await waitFor(() => expect(toastError).toHaveBeenCalled());

    expect(toastError).toHaveBeenCalledWith("notifications.dismissError");
    // La regresión que importa: cualquier literal en español vuelve a romper al usuario en
    // inglés, así que se afirma que NO se está mandando el texto suelto.
    expect(toastError).not.toHaveBeenCalledWith(
      expect.stringContaining("No se pudo descartar"),
    );
  });

  it("cuando el RPC sale bien, no avisa nada", async () => {
    rpcMock.mockResolvedValue({ data: 1, error: null });

    const { result } = renderHook(() => useDismissNotifications(), { wrapper });
    result.current.mutate(["n-1"]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastError).not.toHaveBeenCalled();
  });
});
