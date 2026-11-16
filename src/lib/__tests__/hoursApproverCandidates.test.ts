import { describe, it, expect } from "vitest";
import {
  HOURS_APPROVER_ROLE_KEYS,
  eligibleHoursApprovers,
  hoursApproverRolesWithCandidates,
  hoursApproversOfRole,
  isHoursApproverRoleKey,
  roleOfHoursApprover,
  type HoursApproverCandidate,
} from "@/lib/hoursApproverCandidates";

// 1110-220 plan_v5 §6.1/§6.2 — espejo del guard de enforce_engagement_profile_scope y de
// get_hours_approver_candidates(). Si cambia la lista allá, cambia acá.

const row = (staff_id: string, role_key: string, society_id: string | null = "soc-a"): HoursApproverCandidate => ({
  staff_id,
  display_name: `Persona ${staff_id}`,
  role_key,
  society_id,
});

describe("HOURS_APPROVER_ROLE_KEYS", () => {
  it("son exactamente los 14 roles de la lista cerrada", () => {
    expect([...HOURS_APPROVER_ROLE_KEYS].sort()).toEqual(
      [
        "partner",
        "senior_partner",
        "director",
        "manager",
        "senior",
        "hr_manager",
        "hr_analyst",
        "accounting_manager",
        "risk_supervisor",
        "secretariat_head",
        "ita_manager",
        "tax_manager",
        "ita_senior",
        "tax_senior",
      ].sort(),
    );
  });

  it.each(["admin", "sqr", "semisenior", "assistant", "ita_assistant", "tax_assistant", "risk_partner", "accounting_analyst", "collections_analyst", "it_security_manager"])(
    "%s queda fuera",
    (roleKey) => {
      expect(isHoursApproverRoleKey(roleKey)).toBe(false);
    },
  );
});

describe("eligibleHoursApprovers", () => {
  const rows = [
    row("1", "senior", "soc-a"),
    row("2", "accounting_manager", "soc-a"),
    row("3", "accounting_manager", "soc-b"),
    row("4", "admin", "soc-a"),
    row("5", "partner", "soc-b"),
  ];

  it("ofrece solo personas de la sociedad del encargo, de cualquiera de los 14 roles", () => {
    expect(eligibleHoursApprovers(rows, "soc-a").map((r) => r.staff_id)).toEqual(["1", "2"]);
    expect(eligibleHoursApprovers(rows, "soc-b").map((r) => r.staff_id)).toEqual(["3", "5"]);
  });

  it("sin sociedad elegida no ofrece a nadie", () => {
    expect(eligibleHoursApprovers(rows, null)).toEqual([]);
  });

  it("descarta un rol fuera de la lista aunque el RPC lo devuelva", () => {
    expect(eligibleHoursApprovers(rows, "soc-a").some((r) => r.role_key === "admin")).toBe(false);
  });
});

describe("Rol → Persona", () => {
  const rows = [row("1", "senior"), row("2", "partner"), row("3", "senior")];

  it("los roles salen en el orden de la lista, solo los que tienen candidatos", () => {
    expect(hoursApproverRolesWithCandidates(rows)).toEqual(["partner", "senior"]);
  });

  it("sin rol elegido no se ofrece a nadie", () => {
    expect(hoursApproversOfRole(rows, null)).toEqual([]);
  });

  it("con rol elegido, solo las personas de ese rol", () => {
    expect(hoursApproversOfRole(rows, "senior").map((r) => r.staff_id)).toEqual(["1", "3"]);
  });

  it("deduce el rol de la persona guardada; null si ya no es candidata", () => {
    expect(roleOfHoursApprover(rows, "2")).toBe("partner");
    expect(roleOfHoursApprover(rows, "zz")).toBeNull();
    expect(roleOfHoursApprover(rows, null)).toBeNull();
  });
});
