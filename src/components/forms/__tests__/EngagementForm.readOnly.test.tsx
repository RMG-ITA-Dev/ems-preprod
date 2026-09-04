import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";

/**
 * BUG 0828-185 (plan_v2 §c.3) — modo de solo lectura híbrido.
 *
 * `/engagements/:id` se gatea por `engagement.read`, no por `engagement.update` — un caller que
 * ve el encargo (p.ej. por own_society/own_management del nuevo `usePortfolioEngagements()`) pero
 * no puede editarlo veía, antes de este fix, todos los campos igual de interactivos, con la única
 * pista de que algo era distinto siendo la ausencia del botón Guardar. `readOnly` (derivado de
 * `isEdit && !can("engagement.update")`, EngagementForm.tsx) agrega un aviso explícito y
 * deshabilita los campos del encargo y del bloque Equipo — sin tocar Cancelar, la descarga
 * autorizada del contrato ni StaffAssignmentsCard (autorización propia del Scheduler).
 */

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const stableClients = [{ client_id: "client-1", client_legal_name: "Test Client", is_active: true }];
const stableEmpty: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: stableClients }),
  useServices: () => ({ data: stableEmpty }),
  useTaxonomies: () => ({ data: stableEmpty }),
  useSocieties: () => ({ data: stableEmpty }),
  useEngagementAssignments: () => ({ data: stableEmpty, isLoading: false, isError: false }),
  useEngagementAggregatedRequirements: () => ({ data: stableEmpty }),
  useActiveStaffWithSkills: () => ({ data: stableEmpty }),
  useCategories: () => ({ data: stableEmpty }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({ partnerOptions: [], managerOptions: [], partners: [], managers: [] }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveEngagementAssignments: () => ({ saveAssignments: vi.fn(), isSaving: false }),
}));

// StaffAssignmentsCard has its own Scheduler authorization and its own hook tree; stubbed out
// here (as in EngagementForm.teamRoles.test.tsx) so this suite only exercises EngagementForm's
// own read-only gating, never the Scheduler feature flag/card internals.
vi.mock("@/components/engagements/StaffAssignmentsCard", () => ({
  StaffAssignmentsCard: () => null,
}));

// `can` is per-test controllable: engagement.update is the one permission this suite flips.
let mockCanUpdate = false;
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: (perm: string) => (perm === "engagement.update" ? mockCanUpdate : true),
    roleKey: "manager",
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

// Determinístico independientemente de la fecha real de ejecución: sin esto,
// `getUpcomingClosingDates()` (ventana calculada desde "hoy") podría no incluir
// `mockEngagement.fecha_cierre`, forzando la rama "Otro" y derivando un año fiscal que no
// coincide con `mockEngagement.anio_fiscal` -- una discrepancia real pero AJENA a este suite
// (0828-185 no toca la derivación de año fiscal) que marcaría el formulario "sucio" por una
// razón que no es la que este archivo prueba.
vi.mock("@/lib/fiscalCalculations", () => ({
  getUpcomingClosingDates: () => [
    { value: "2027-09-30", key: "September 30", year: 2027, date: new Date(2027, 8, 30) },
  ],
  getFiscalYearForDate: () => 2027,
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  // Coincide con manager_id del fixture: habilita canViewContract sin activar autoasignación
  // (isEdit=true desactiva por completo la rama de autoasignación/bloqueo de 0810-172).
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-manager" } }),
}));

import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";

const mockEngagement: Engagement = {
  engagement_id: "eng-readonly-1",
  client_id: "client-1",
  engagement_name: "Audit FY2027",
  engagement_code: "2027.121.001",
  partner_id: "staff-partner",
  manager_id: "staff-manager",
  status: "active",
  start_date: "2026-10-01",
  end_date: "2027-09-30",
  created_at: "2026-05-22T00:00:00Z",
  work_order_required: true,
  activity_required: true,
  is_internal: false,
  approval_required: true,
  oficina: 1,
  practica: 2,
  funcion: 0,
  anio_fiscal: 2027,
  anio_fiscal_override: false,
  fecha_cierre: "2027-09-30",
  sqr_id: null,
  encargado_id: null,
  specialist_it_id: null,
  specialist_tax_id: null,
  taxonomy_id: null,
  contract_file_path: "contracts/eng-readonly-1.pdf",
  society_id: null,
  engagement_state_override: null,
  work_order: null,
};

describe("EngagementForm — modo de solo lectura (0828-185)", () => {
  beforeEach(() => {
    mockCanUpdate = false;
  });

  it("sin engagement.update: muestra el aviso de solo lectura", () => {
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.getByText("engagement.readOnlyNotice")).toBeInTheDocument();
  });

  it("con engagement.update: no muestra el aviso de solo lectura", () => {
    mockCanUpdate = true;
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.queryByText("engagement.readOnlyNotice")).not.toBeInTheDocument();
  });

  it("sin engagement.update: no hay botón Guardar ni Eliminar", () => {
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.queryByText("common.saveChanges")).not.toBeInTheDocument();
    expect(screen.queryByText("common.delete")).not.toBeInTheDocument();
  });

  it("con engagement.update: Guardar y Eliminar SÍ se muestran", () => {
    mockCanUpdate = true;
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.getByText("common.saveChanges")).toBeInTheDocument();
    expect(screen.getByText("common.delete")).toBeInTheDocument();
  });

  it("sin engagement.update: Cancelar sigue habilitado", () => {
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.getByText("common.cancel").closest("button")).not.toBeDisabled();
  });

  it("sin engagement.update: los campos primarios del encargo quedan deshabilitados", () => {
    render(<EngagementForm engagement={mockEngagement} />);
    // Regex parcial (no el texto "Test Client"): Radix Select espeja cada SelectItem en un
    // <select> nativo oculto para autofill/progressive enhancement, así que "Test Client" hace
    // match por duplicado (el span visible Y la <option> oculta). El nombre accesible del
    // combobox visible es único; se matchea por prefijo porque incluye el asterisco de
    // obligatorio en un <span> aparte ("engagement.client *").
    expect(screen.getByRole("combobox", { name: /^engagement\.client/ })).toBeDisabled();
    expect(screen.getByDisplayValue(mockEngagement.engagement_name)).toBeDisabled();
  });

  it("con engagement.update: los campos primarios quedan habilitados", () => {
    mockCanUpdate = true;
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.getByRole("combobox", { name: /^engagement\.client/ })).not.toBeDisabled();
    expect(screen.getByDisplayValue(mockEngagement.engagement_name)).not.toBeDisabled();
  });

  it("sin engagement.update: los seis selectores del bloque Equipo quedan deshabilitados", () => {
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.getByRole("combobox", { name: /^engagement\.partner/ })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /^engagement\.sqr/ })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /^engagement\.manager/ })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /^engagement\.encargado/ })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /^engagement\.specialistIt1/ })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /^engagement\.specialistTax1/ })).toBeDisabled();
  });

  it("sin engagement.update: la descarga del contrato autorizado sigue habilitada", () => {
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.getByText("engagement.downloadContract").closest("button")).not.toBeDisabled();
  });

  it("sin engagement.update: el montaje reporta isDirty=false (no sucio) antes de cualquier interacción", () => {
    // Acotado a la primera notificación (justo tras montar/poblar), no al valor asentado tras
    // sucesivos renders: campos derivados ajenos a 0828-185 (año fiscal/fecha de cierre, ya
    // documentados como sensibles a una reconciliación propia de Radix Select en
    // EngagementForm.selfAssignment.test.tsx:62-68, "isDirty: true pese al shouldDirty: false de
    // la siembra") pueden recalcularse en renders posteriores por motivos previos a este fix. Lo
    // que 0828-185 necesita garantizar es que un campo DESHABILITADO no puede, por sí mismo,
    // originar una edición -- y eso ya lo cubren los tests de arriba (`disabled` en cada control).
    const onDirtyChange = vi.fn();
    render(<EngagementForm engagement={mockEngagement} onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange.mock.calls[0]).toEqual([false]);
  });
});
