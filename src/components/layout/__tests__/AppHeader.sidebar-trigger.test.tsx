import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("@/hooks/useMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { email: "test@test.com" }, signOut: vi.fn() }),
}));
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: null }),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));
vi.mock("@/components/tracker/RunningTimerChip", () => ({
  RunningTimerChip: () => null,
}));
vi.mock("@/components/theme/ThemeToggle", () => ({
  ThemeToggle: () => null,
}));

import { AppHeader } from "@/components/layout/AppHeader";

describe("AppHeader sidebar trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TH1: focusMode=false — SidebarTrigger is rendered", () => {
    render(
      <SidebarProvider>
        <AppHeader title="Test" focusMode={false} />
      </SidebarProvider>
    );
    expect(screen.getByRole("button", { name: /toggle sidebar/i })).toBeInTheDocument();
  });

  it("TH2: focusMode=true — SidebarTrigger is also rendered", () => {
    render(
      <SidebarProvider>
        <AppHeader title="Test" focusMode={true} />
      </SidebarProvider>
    );
    expect(screen.getByRole("button", { name: /toggle sidebar/i })).toBeInTheDocument();
  });
});
