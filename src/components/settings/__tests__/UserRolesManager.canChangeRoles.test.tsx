import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { UserRolesManager } from "../UserRolesManager";

// Reviews iteración 5 (P2): user_role.read (gatea el tab) y user_role.update (gatea este
// selector) son permisos distintos — solo admin tiene el segundo. Sin este chequeo, un lector
// (ej. it_security_manager, que sí tiene user_role.read desde la iteración 4) veía el selector de
// rol activo para cada usuario, y cada intento fallaba con NOT_ADMIN.
vi.mock("@/hooks/useUserRoles", () => ({
  useAllUserRoles: () => ({
    data: [
      {
        role_id: "role-1",
        user_id: "user-1",
        email: "bob@example.com",
        role: "staff",
        role_key: "assistant",
        staff_name: "Bob Smith",
        created_at: "2024-01-01T00:00:00Z",
      },
    ],
    isLoading: false,
  }),
  useUpdateUserRoleKey: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAuthUser: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useAuthorizationRoles", () => ({
  useAuthorizationRoles: () => ({
    data: [{ role_key: "assistant", label_key: "authz.role.assistant", description: null, is_system: false, display_order: 0 }],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "reader-user-id" } }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => false }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@/hooks/useMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [k: string]: unknown }) =>
      React.createElement("a", { href: String(to), ...props }, children),
  };
});

describe("UserRolesManager — read-only viewer (user_role.read without user_role.update)", () => {
  it("shows a no-permission message instead of the role <Select>, even for a non-self row", () => {
    render(<UserRolesManager />);
    expect(screen.getByText("userRoles.noPermissionToChangeRoles")).toBeInTheDocument();
    // Not the self-row message — this is the permission gate, not the self-change guard.
    expect(screen.queryByText("userRoles.cannotChangeSelf")).not.toBeInTheDocument();
    // The row is still visible/readable — this is a write gate, not a hidden row.
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });
});
