import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * NOTIFICACIONES — Realtime de la campana.
 *
 * Sin suscripción, una notificación recién emitida sólo aparecía al recargar la página o al
 * cumplirse el `refetchInterval` de 5 minutos. Lo que este archivo fija es el contrato con
 * Supabase Realtime, que es donde se rompe en silencio: si el filtro deja de apuntar al
 * destinatario, cada usuario se despierta con las notificaciones de todos; si falta la
 * limpieza, cambiar de usuario deja el canal viejo escuchando.
 */

const rpcMock = vi.fn(async () => ({
  data: { events: [], aggregates: [], unread_count: 0 },
  error: null,
}));

type ChangeHandler = () => void;

const realtime = vi.hoisted(() => ({
  channels: [] as {
    name: string;
    config: Record<string, unknown> | null;
    handler: (() => void) | null;
    subscribed: boolean;
  }[],
  removed: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...(args as [])),
    channel: (name: string) => {
      const entry = {
        name,
        config: null as Record<string, unknown> | null,
        handler: null as ChangeHandler | null,
        subscribed: false,
      };
      realtime.channels.push(entry);
      const api = {
        on: (_event: string, config: Record<string, unknown>, handler: ChangeHandler) => {
          entry.config = config;
          entry.handler = handler;
          return api;
        },
        subscribe: () => {
          entry.subscribed = true;
          return api;
        },
        __name: name,
      };
      return api;
    },
    removeChannel: (channel: { __name: string }) => {
      realtime.removed.push(channel.__name);
      return Promise.resolve("ok");
    },
  },
}));

const staffRef = vi.hoisted(() => ({ staffId: undefined as string | undefined }));
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({
    data: staffRef.staffId ? { staff_id: staffRef.staffId } : undefined,
  }),
}));

import { useNotifications } from "../useNotifications";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("useNotifications — realtime", () => {
  beforeEach(() => {
    realtime.channels.length = 0;
    realtime.removed.length = 0;
    rpcMock.mockClear();
    staffRef.staffId = "59f00000-0000-4000-8000-000000000002";
  });

  it("se suscribe a los INSERT de la bandeja propia", async () => {
    const { wrapper } = createWrapper();
    renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(realtime.channels).toHaveLength(1));

    const [channel] = realtime.channels;
    expect(channel.subscribed).toBe(true);
    expect(channel.name).toContain(staffRef.staffId!);
    // El filtro es lo que evita que cada emisión despierte a toda la firma.
    expect(channel.config).toMatchObject({
      event: "INSERT",
      schema: "public",
      table: "notifications",
      filter: `recipient_staff_id=eq.${staffRef.staffId}`,
    });
  });

  it("refresca la bandeja cuando llega un INSERT", async () => {
    const { wrapper } = createWrapper();
    renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(realtime.channels[0]?.handler).toBeTruthy());

    realtime.channels[0].handler!();

    // Se vuelve a pedir el payload entero: el panel muestra eventos agrupados y traducidos por
    // `get_my_notifications()`, no la fila cruda que trae el evento.
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
  });

  it("no abre canal mientras no se sabe quién es el usuario", () => {
    staffRef.staffId = undefined;
    const { wrapper } = createWrapper();
    renderHook(() => useNotifications(), { wrapper });

    expect(realtime.channels).toHaveLength(0);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("cierra el canal al desmontar", async () => {
    const { wrapper } = createWrapper();
    const { unmount } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(realtime.channels).toHaveLength(1));
    unmount();

    expect(realtime.removed).toEqual([realtime.channels[0].name]);
  });
});
