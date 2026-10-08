import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { SessionCacheGuard } from "../SessionCacheGuard";

// Fase 7 (plan v2 §A.4, "Tests to Add"). Mutable auth mock, same pattern as
// src/hooks/scheduler/__tests__/schedulerCacheIsolation.test.tsx:10-11.
const auth: { user: { id: string } | null } = { user: null };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

function Seed({ id }: { id: string }) {
  useQuery({ queryKey: ["probe"], queryFn: async () => `data-for-${id}` });
  return null;
}

function renderGuard(client: QueryClient, id: string) {
  return render(
    <QueryClientProvider client={client}>
      <SessionCacheGuard />
      <Seed id={id} />
    </QueryClientProvider>,
  );
}

describe("SessionCacheGuard (Fase 7, plan v2 §A.4)", () => {
  let client: QueryClient;

  beforeEach(() => {
    auth.user = null;
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("(1) mounting already signed in (previous null) does not clear — seeded data survives", async () => {
    auth.user = { id: "user-a" };
    const utils = renderGuard(client, "a");
    await waitFor(() => expect(client.getQueryData(["probe"])).toBe("data-for-a"));

    utils.rerender(
      <QueryClientProvider client={client}>
        <SessionCacheGuard />
        <Seed id="a" />
      </QueryClientProvider>,
    );
    expect(client.getQueryData(["probe"])).toBe("data-for-a");
  });

  it("(2) switching accounts (a -> b) clears the cache once", async () => {
    auth.user = { id: "user-a" };
    const utils = renderGuard(client, "a");
    await waitFor(() => expect(client.getQueryData(["probe"])).toBe("data-for-a"));

    const clearSpy = vi.spyOn(client, "clear");
    auth.user = { id: "user-b" };
    utils.rerender(
      <QueryClientProvider client={client}>
        <SessionCacheGuard />
        <Seed id="b" />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(clearSpy).toHaveBeenCalledTimes(1));
    expect(client.getQueryData(["probe"])).not.toBe("data-for-a");
  });

  it("(3) signing out (a -> null) clears the cache once", async () => {
    auth.user = { id: "user-a" };
    const utils = renderGuard(client, "a");
    await waitFor(() => expect(client.getQueryData(["probe"])).toBe("data-for-a"));

    const clearSpy = vi.spyOn(client, "clear");
    auth.user = null;
    utils.rerender(
      <QueryClientProvider client={client}>
        <SessionCacheGuard />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(clearSpy).toHaveBeenCalledTimes(1));
  });

  it("(4) re-rendering with the same identity does not clear", async () => {
    auth.user = { id: "user-a" };
    const utils = renderGuard(client, "a");
    await waitFor(() => expect(client.getQueryData(["probe"])).toBe("data-for-a"));

    const clearSpy = vi.spyOn(client, "clear");
    utils.rerender(
      <QueryClientProvider client={client}>
        <SessionCacheGuard />
        <Seed id="a" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(client.getQueryData(["probe"])).toBe("data-for-a"));
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("(5) hydration (null -> a, first login) does not clear", async () => {
    const clearSpy = vi.spyOn(client, "clear");
    const utils = renderGuard(client, "hydrating"); // mounts with auth.user still null
    await waitFor(() => expect(client.getQueryData(["probe"])).toBe("data-for-hydrating"));

    auth.user = { id: "user-a" };
    utils.rerender(
      <QueryClientProvider client={client}>
        <SessionCacheGuard />
        <Seed id="hydrating" />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(client.getQueryData(["probe"])).toBe("data-for-hydrating"));
    expect(clearSpy).not.toHaveBeenCalled();
  });

  // A.5b (barrido de seguridad, bugs/seguridad/barrido_report.md §3): con RLS encendida en
  // global_settings la política de `anon` entrega 3 claves y la de `authenticated` las 27. La
  // queryKey es la misma antes y después del login y el staleTime real es de 60 s, así que sin la
  // invalidación dirigida el login hereda la vista recortada y TAX_RATE cae a su default 0.13.
  // Este test reproduce esa cadena con el staleTime de producción: sin el fix, falla.
  it("(6) first login (null -> a) refetches global_settings instead of inheriting the anon view", async () => {
    const CLAVES_ANON = ["LANGUAGE", "COMPACT_FONT", "ALLOWED_EMAIL_DOMAIN"];
    const CLAVES_CON_SESION = [...CLAVES_ANON, "TAX_RATE", "REALIZATION_LIMIT"];

    function Settings() {
      useQuery({
        queryKey: ["global_settings"],
        queryFn: async () => (auth.user ? CLAVES_CON_SESION : CLAVES_ANON),
        staleTime: 60_000, // el de App.tsx: es lo que impide el refetch espontáneo
      });
      return null;
    }
    const tree = () => (
      <QueryClientProvider client={client}>
        <SessionCacheGuard />
        <Settings />
      </QueryClientProvider>
    );

    const clearSpy = vi.spyOn(client, "clear");
    const utils = render(tree());
    await waitFor(() => expect(client.getQueryData(["global_settings"])).toEqual(CLAVES_ANON));

    auth.user = { id: "user-a" };
    utils.rerender(tree());

    await waitFor(() =>
      expect(client.getQueryData(["global_settings"])).toEqual(CLAVES_CON_SESION),
    );
    // La invalidación es dirigida: el resto de la caché de la sesión inicial sobrevive (caso 5).
    expect(clearSpy).not.toHaveBeenCalled();
  });
});
