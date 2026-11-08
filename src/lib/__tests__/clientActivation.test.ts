// 1028-211: texto de trazabilidad de la activación en la ficha del cliente.
import { describe, it, expect } from "vitest";
import { clientActivationInfo } from "@/lib/clientActivation";

const ana = { first_name: "Ana", last_name: "Pérez" };

describe("clientActivationInfo", () => {
  it("activo: quién y cuándo lo activó", () => {
    expect(
      clientActivationInfo({ is_active: true, activated_at: "2026-11-06T15:00:00Z", activated_by: ana }),
    ).toEqual({ key: "client.activatedBy", params: { name: "Ana Pérez", date: "06/11/2026" } });
  });

  it("activo por el sistema (sin nombre): solo la fecha", () => {
    expect(clientActivationInfo({ is_active: true, activated_at: "2026-11-06T15:00:00Z", activated_by: null })).toEqual({
      key: "client.activatedOn",
      params: { date: "06/11/2026" },
    });
  });

  it("inactivo: la última desactivación, aunque haya una activación anterior", () => {
    expect(
      clientActivationInfo({
        is_active: false,
        activated_at: "2026-11-01T15:00:00Z",
        activated_by: ana,
        deactivated_at: "2026-11-06T15:00:00Z",
        deactivated_by: { first_name: "Luis", last_name: "Rojas" },
      }),
    ).toEqual({ key: "client.deactivatedBy", params: { name: "Luis Rojas", date: "06/11/2026" } });
  });

  it("sin datos registrados (pendiente, o anterior a 1028-211): nada", () => {
    expect(clientActivationInfo({ is_active: false })).toBeNull();
    expect(clientActivationInfo({ is_active: true, activated_at: null })).toBeNull();
  });
});
