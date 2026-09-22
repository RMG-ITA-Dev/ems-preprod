import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NotificationsPanel } from "../NotificationsPanel";
import { EMPTY_PAYLOAD } from "@/lib/notifications";

/**
 * El panel vive de DOS consultas —la bandeja nueva (`useNotifications`) y las alertas legacy
 * (`useStaffingAlerts`)— y cualquiera de las dos puede fallar sola.
 *
 * El mensaje de error ya miraba las dos, pero el "todo al día" sólo miraba `isError`, el de las
 * legacy. Con la bandeja caída y el feed legacy vacío el panel pintaba las dos cosas, una debajo
 * de la otra: "no se pudieron cargar las notificaciones" y "todo al día". Lo segundo es
 * justamente lo que NO se sabe cuando la consulta falló.
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "es" },
  }),
}));

const mockUseNotifications = vi.fn();
const mockMarkRead = vi.fn();
const mockDismiss = vi.fn();
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => mockUseNotifications(),
  useMarkNotificationsRead: () => ({ mutate: mockMarkRead }),
  useDismissNotifications: () => ({ mutate: mockDismiss }),
}));

const mockUseStaffingAlerts = vi.fn();
vi.mock("@/hooks/useStaffingAlerts", () => ({
  useStaffingAlerts: () => mockUseStaffingAlerts(),
}));

vi.mock("@/hooks/useMarkAlertsSeen", () => ({
  useMarkAlertsSeen: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, scope: () => "firm" }),
}));

function setup(opts: { bandejaFalla: boolean; legacyFalla: boolean }) {
  mockUseNotifications.mockReturnValue({
    data: EMPTY_PAYLOAD,
    isError: opts.bandejaFalla,
  });
  mockUseStaffingAlerts.mockReturnValue({
    data: [],
    isPending: false,
    isError: opts.legacyFalla,
  });
  return render(
    <MemoryRouter>
      <NotificationsPanel />
    </MemoryRouter>,
  );
}

const openPanel = async () => {
  await userEvent.click(screen.getByRole("button"));
  await waitFor(() =>
    expect(screen.getByText("notifications.title")).toBeInTheDocument(),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NotificationsPanel — error vs. todo al día", () => {
  it("si falla SOLO la bandeja, muestra el error y NO dice 'todo al día'", async () => {
    setup({ bandejaFalla: true, legacyFalla: false });
    await openPanel();

    expect(screen.getByText("notifications.error")).toBeInTheDocument();
    expect(screen.queryByText("notifications.allClear")).not.toBeInTheDocument();
  });

  it("si fallan las dos, muestra el error y NO dice 'todo al día'", async () => {
    setup({ bandejaFalla: true, legacyFalla: true });
    await openPanel();

    expect(screen.getByText("notifications.error")).toBeInTheDocument();
    expect(screen.queryByText("notifications.allClear")).not.toBeInTheDocument();
  });

  it("si falla SOLO el feed legacy, muestra el error y NO dice 'todo al día'", async () => {
    setup({ bandejaFalla: false, legacyFalla: true });
    await openPanel();

    expect(screen.getByText("notifications.error")).toBeInTheDocument();
    expect(screen.queryByText("notifications.allClear")).not.toBeInTheDocument();
  });

  it("sin errores y sin nada pendiente, dice 'todo al día' y NO muestra error", async () => {
    setup({ bandejaFalla: false, legacyFalla: false });
    await openPanel();

    expect(screen.getByText("notifications.allClear")).toBeInTheDocument();
    expect(screen.queryByText("notifications.error")).not.toBeInTheDocument();
  });
});
