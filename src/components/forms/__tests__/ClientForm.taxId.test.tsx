// 1028-211: ClientForm con el modelo de ETL 02.
//
// - NIT y razón social pueden repetirse: el formulario ya no consulta duplicados antes de guardar.
// - El selector de industria ofrece solo las activas, más la que el cliente ya tiene guardada.
// - La industria se puede quitar ("Ninguno"). En la RPC, una clave AUSENTE conserva el valor y
//   `null` lo limpia: el alta manda siempre la clave y la edición solo si cambió.

import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

type IndustryFixture = { industry_id: string; industry_name: string; status: "active" | "inactive" };
let industriesState: IndustryFixture[] | undefined = [];
vi.mock("@/hooks/useEmsData", () => ({
  useIndustries: () => ({ data: industriesState }),
}));

const mutateAsync = vi.fn();
vi.mock("@/hooks/mutations", () => ({
  useDeleteClient: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveClientWithContacts: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true }),
}));

let contactsState: { data: unknown[] | undefined; isFetched: boolean } = { data: [], isFetched: true };
vi.mock("@/hooks/useClientContacts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useClientContacts")>();
  return { ...real, useClientContacts: () => contactsState };
});

import { ClientForm } from "@/components/forms/ClientForm";
import type { ClientFull } from "@/hooks/useEmsData";

const IND_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const IND_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const IND_C = "cccccccc-0000-4000-8000-00000000000c";
const INDUSTRIES: IndustryFixture[] = [
  { industry_id: IND_A, industry_name: "Industria A", status: "active" },
  { industry_id: IND_B, industry_name: "Industria B", status: "inactive" },
  { industry_id: IND_C, industry_name: "Industria C", status: "inactive" },
];

const CONTACTS = [
  { contact_id: "g", client_id: "c-1", contact_type: "general", full_name: "Ana", email: "ana@x.com", phone: null, is_active: true },
  { contact_id: "k", client_id: "c-1", contact_type: "cobranza", full_name: "Luis", email: "luis@x.com", phone: null, is_active: true },
];

const clientWith = (industry_id: string | null) =>
  ({
    client_id: "c-1",
    client_legal_name: "Fideicomiso X",
    tax_id: "99001",
    industry_id,
    address: "Calle 1",
    is_active: true,
  }) as unknown as ClientFull;

const tree = (client: ClientFull | undefined, compact: boolean) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>
      <ClientForm client={client} compact={compact} onSaveSuccess={() => {}} />
    </MemoryRouter>
  </QueryClientProvider>
);

beforeAll(() => {
  // Radix (Select, Switch) usa APIs que jsdom no trae.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
});

const fromSpy = vi.mocked(supabase.from);

beforeEach(() => {
  vi.clearAllMocks();
  industriesState = INDUSTRIES;
  contactsState = { data: [], isFetched: true };
  mutateAsync.mockResolvedValue(undefined);
  // El conteo de encargos (edición) es la única consulta legítima: devuelve 0.
  fromSpy.mockImplementation(
    () =>
      ({
        select: () => ({ eq: () => Promise.resolve({ count: 0, error: null }) }),
      }) as any,
  );
});

const input = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement;

async function fillNewClient(user: ReturnType<typeof userEvent.setup>, name = "Fideicomiso X") {
  await user.type(input("client_legal_name"), name);
  await user.type(input("tax_id"), "99001");
  await user.type(input("contact_general_name"), "Ana");
  await user.type(input("contact_general_email"), "ana@x.com");
  await user.type(input("contact_cobranza_name"), "Luis");
  await user.type(input("contact_cobranza_email"), "luis@x.com");
}

const submitButton = (isNew: boolean) =>
  screen.getByRole("button", { name: isNew ? "client.createClient" : "common.saveChanges" });

async function openIndustryMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox"));
  return screen.getByRole("listbox");
}

const savedClient = () => mutateAsync.mock.calls[0][0].client as Record<string, unknown>;

describe("ClientForm — NIT y razón social repetidos (1028-211)", () => {
  it("el alta con NIT 99001 se guarda sin consultar duplicados", async () => {
    const user = userEvent.setup();
    render(tree(undefined, false));
    await fillNewClient(user, "  Fideicomiso X  ");
    await user.click(submitButton(true));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(fromSpy).not.toHaveBeenCalledWith("clients");
    const call = mutateAsync.mock.calls[0][0];
    expect(call.isNew).toBe(true);
    expect(call.client.tax_id).toBe("99001");
    expect(call.client.client_legal_name).toBe("Fideicomiso X");
    expect(call.contacts.map((c: { contact_type: string }) => c.contact_type)).toEqual(["general", "cobranza"]);
  });

  it("la edición se guarda sin consultar duplicados y conserva los contactos adicionales", async () => {
    const extra = { contact_id: "k2", client_id: "c-1", contact_type: "cobranza", full_name: "Otro", email: "o@x.com", phone: null, is_active: true };
    contactsState = { data: [...CONTACTS, extra], isFetched: true };
    const user = userEvent.setup();
    render(tree(clientWith(IND_A), false));
    await waitFor(() => expect(input("client_legal_name")).not.toBeDisabled());
    await user.click(submitButton(false));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    // La única consulta es el conteo de encargos, contra `engagements`.
    expect(fromSpy).not.toHaveBeenCalledWith("clients");
    const call = mutateAsync.mock.calls[0][0];
    expect(call.isNew).toBe(false);
    expect(call.contacts.map((c: { contact_id?: string }) => c.contact_id)).toEqual(["g", "k", "k2"]);
  });
});

describe.each([
  ["completo", false],
  ["compacto", true],
])("ClientForm %s — selector de industria (1028-211)", (_label, compact) => {
  const isNew = !compact;
  // El compacto solo se usa en edición; el completo, en el alta.
  const renderForm = (industry_id: string | null = null) => {
    if (!isNew) contactsState = { data: CONTACTS, isFetched: true };
    return render(tree(isNew ? undefined : clientWith(industry_id), compact));
  };

  it("ofrece solo las activas y la opción Ninguno", async () => {
    const user = userEvent.setup();
    renderForm();
    if (!isNew) await waitFor(() => expect(input("client_legal_name")).not.toBeDisabled());
    const menu = await openIndustryMenu(user);
    const options = within(menu).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["common.none", "Industria A"]);
  });

  if (!isNew) {
    it("con la actual inactiva, la ofrece rotulada y sin las otras inactivas", async () => {
      const user = userEvent.setup();
      renderForm(IND_B);
      await waitFor(() => expect(input("client_legal_name")).not.toBeDisabled());
      expect(screen.getByRole("combobox")).toHaveTextContent("Industria B (status.inactive)");
      const menu = await openIndustryMenu(user);
      const options = within(menu).getAllByRole("option").map((o) => o.textContent);
      expect(options).toEqual(["common.none", "Industria A", "Industria B (status.inactive)"]);
    });
  }
});

describe("ClientForm — industry_id en el payload (1028-211)", () => {
  it("alta sin industria: manda la clave con null", async () => {
    const user = userEvent.setup();
    render(tree(undefined, false));
    // Sin valor se ve el placeholder, no "Ninguno".
    expect(screen.getByRole("combobox")).toHaveTextContent("client.selectIndustry");
    await fillNewClient(user);
    await user.click(submitButton(true));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(savedClient()).toHaveProperty("industry_id", null);
  });

  it("alta con industria: manda el id", async () => {
    const user = userEvent.setup();
    render(tree(undefined, false));
    await fillNewClient(user);
    await openIndustryMenu(user);
    await user.click(screen.getByRole("option", { name: "Industria A" }));
    await user.click(submitButton(true));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(savedClient()).toHaveProperty("industry_id", IND_A);
  });

  describe.each([
    ["completo", false],
    ["compacto", true],
  ])("edición, formulario %s", (_label, compact) => {
    const renderEdit = async (industry_id: string | null) => {
      contactsState = { data: CONTACTS, isFetched: true };
      render(tree(clientWith(industry_id), compact));
      await waitFor(() => expect(input("client_legal_name")).not.toBeDisabled());
    };
    const save = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(submitButton(false));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    };

    it("sin tocar la industria: no manda la clave (la RPC conserva)", async () => {
      const user = userEvent.setup();
      await renderEdit(IND_A);
      await user.type(input("address"), " 2");
      await save(user);
      expect(savedClient()).not.toHaveProperty("industry_id");
      expect(savedClient().address).toBe("Calle 1 2");
      // 1028-211 (review Codex): la ficha nunca manda is_active; si no, un guardado con el formulario sucio
      // revertía una activación hecha con el botón de la cabecera.
      expect(savedClient()).not.toHaveProperty("is_active");
    });

    it("quitar la industria: manda null", async () => {
      const user = userEvent.setup();
      await renderEdit(IND_A);
      await openIndustryMenu(user);
      await user.click(screen.getByRole("option", { name: "common.none" }));
      expect(screen.getByRole("combobox")).toHaveTextContent("client.selectIndustry");
      await save(user);
      expect(savedClient()).toHaveProperty("industry_id", null);
    });

    it("elegir otra: manda el id nuevo", async () => {
      const user = userEvent.setup();
      await renderEdit(IND_B);
      await openIndustryMenu(user);
      await user.click(screen.getByRole("option", { name: "Industria A" }));
      await save(user);
      expect(savedClient()).toHaveProperty("industry_id", IND_A);
    });

    it("cambiar y volver al original: no manda la clave", async () => {
      const user = userEvent.setup();
      await renderEdit(IND_A);
      await openIndustryMenu(user);
      await user.click(screen.getByRole("option", { name: "common.none" }));
      await openIndustryMenu(user);
      await user.click(screen.getByRole("option", { name: "Industria A" }));
      await save(user);
      expect(savedClient()).not.toHaveProperty("industry_id");
    });

    it("cliente sin industria: muestra el placeholder y, sin tocarla, no manda la clave", async () => {
      const user = userEvent.setup();
      await renderEdit(null);
      expect(screen.getByRole("combobox")).toHaveTextContent("client.selectIndustry");
      await save(user);
      expect(savedClient()).not.toHaveProperty("industry_id");
    });
  });

  it("si el catálogo llega tarde, la industria hidratada no se pierde", async () => {
    industriesState = undefined;
    contactsState = { data: CONTACTS, isFetched: true };
    const user = userEvent.setup();
    const client = clientWith(IND_B);
    const { rerender } = render(tree(client, true));
    await waitFor(() => expect(input("client_legal_name")).not.toBeDisabled());

    industriesState = INDUSTRIES;
    rerender(tree(client, true));
    await waitFor(() =>
      expect(screen.getByRole("combobox")).toHaveTextContent("Industria B (status.inactive)"),
    );
    await user.click(submitButton(false));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(savedClient()).not.toHaveProperty("industry_id");
  });
});
