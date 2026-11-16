import { describe, it, expect } from "vitest";
import { resolveCreatedWorkOrderAction } from "../EngagementForm";

/**
 * 1112-228 — qué ofrece el modal de confirmación respecto de la OT de un encargo recién creado.
 * Debe coincidir con el filtro de WorkOrderNew (activo, canCreateWorkOrderFor, "Requiere OT" en
 * un no-Cliente): si dice "create", `?engagement=` tiene que preseleccionar.
 */
const base = {
  funcion: 0,
  workOrderRequired: true,
  status: "active",
  canCreateWorkOrder: true,
  roleKey: "admin",
  myStaffId: "staff-me",
  managerId: "staff-other",
};

describe("resolveCreatedWorkOrderAction (1112-228)", () => {
  it("Cliente (funcion 1 o null) → none: sigue la Matriz de Trabajo", () => {
    expect(resolveCreatedWorkOrderAction({ ...base, funcion: 1 })).toBe("none");
    expect(resolveCreatedWorkOrderAction({ ...base, funcion: null })).toBe("none");
  });

  it("no-Cliente con 'Requiere OT' apagado → none", () => {
    expect(resolveCreatedWorkOrderAction({ ...base, workOrderRequired: false })).toBe("none");
  });

  it("admin crea la OT de las tres funciones administrativas", () => {
    expect(resolveCreatedWorkOrderAction({ ...base, funcion: 0 })).toBe("create");
    expect(resolveCreatedWorkOrderAction({ ...base, funcion: 2 })).toBe("create");
    expect(resolveCreatedWorkOrderAction({ ...base, funcion: 3 })).toBe("create");
  });

  it("Talento Humano creador con ficha → create en Administrativa y Capacitación", () => {
    expect(resolveCreatedWorkOrderAction({ ...base, roleKey: "hr_analyst", funcion: 0 })).toBe("create");
    expect(resolveCreatedWorkOrderAction({ ...base, roleKey: "hr_manager", funcion: 2 })).toBe("create");
  });

  it("Talento Humano en Control de Calidad → blocked (solo admin crea esa OT)", () => {
    expect(resolveCreatedWorkOrderAction({ ...base, roleKey: "hr_analyst", funcion: 3 })).toBe("blocked");
  });

  it("Talento Humano sin ficha de staff → blocked", () => {
    expect(resolveCreatedWorkOrderAction({ ...base, roleKey: "hr_analyst", myStaffId: null })).toBe("blocked");
  });

  it("sin permiso work_order.create → blocked", () => {
    expect(resolveCreatedWorkOrderAction({ ...base, canCreateWorkOrder: false })).toBe("blocked");
  });

  it("encargo no activo → blocked", () => {
    expect(resolveCreatedWorkOrderAction({ ...base, status: "inactive" })).toBe("blocked");
  });
});
