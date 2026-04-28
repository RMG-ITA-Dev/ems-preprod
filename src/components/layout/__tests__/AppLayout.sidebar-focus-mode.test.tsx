import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";

// Mini sidebar mock: stateful open/close, exposes data-default-open for TL3
vi.mock("@/components/ui/sidebar", async () => {
  const { useState, createContext, useContext, useCallback } = await import("react");

  const SidebarCtx = createContext<{ open: boolean; toggleSidebar: () => void } | null>(null);

  function SidebarProvider({ children, defaultOpen = true }: { children: React.ReactNode; defaultOpen?: boolean }) {
    const [open, setOpen] = useState<boolean>(defaultOpen);
    const toggleSidebar = useCallback(() => setOpen((o) => !o), []);
    return (
      <SidebarCtx.Provider value={{ open, toggleSidebar }}>
        <div
          data-testid="sidebar-provider"
          data-open={String(open)}
          data-default-open={String(defaultOpen)}
        >
          {children}
        </div>
      </SidebarCtx.Provider>
    );
  }

  function SidebarTrigger({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) {
    const ctx = useContext(SidebarCtx);
    return (
      <button
        data-testid="sidebar-trigger"
        onClick={() => {
          ctx?.toggleSidebar();
          onClick?.();
        }}
      >
        {children ?? "Toggle"}
      </button>
    );
  }

  return { SidebarProvider, SidebarTrigger };
});

vi.mock("@/components/layout/AppSidebar", () => ({
  AppSidebar: () => <div data-testid="app-sidebar" />,
}));

// AppHeader mock includes SidebarTrigger so TL4 can click it
vi.mock("@/components/layout/AppHeader", async () => {
  const { SidebarTrigger } = await import("@/components/ui/sidebar");
  return {
    AppHeader: () => (
      <div data-testid="app-header">
        <SidebarTrigger />
      </div>
    ),
  };
});

vi.mock("@/components/layout/MobileBottomNav", () => ({
  MobileBottomNav: () => <div data-testid="mobile-bottom-nav" />,
}));

vi.mock("@/components/layout/MobileMoreDrawer", () => ({
  MobileMoreDrawer: () => <div data-testid="mobile-more-drawer" />,
}));

import { AppLayout } from "@/components/layout/AppLayout";

describe("AppLayout sidebar focus-mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TL1: focusMode=false — AppSidebar rendered and SidebarProvider defaultOpen=true", () => {
    render(<AppLayout><div /></AppLayout>);
    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-provider").dataset.defaultOpen).toBe("true");
  });

  it("TL2: focusMode=true — AppSidebar still rendered", () => {
    render(<AppLayout focusMode><div /></AppLayout>);
    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
  });

  it("TL3: focusMode=true — SidebarProvider receives defaultOpen=false", () => {
    render(<AppLayout focusMode><div /></AppLayout>);
    expect(screen.getByTestId("sidebar-provider").dataset.defaultOpen).toBe("false");
  });

  it("TL4: focusMode=true — clicking SidebarTrigger opens the sidebar", async () => {
    const user = userEvent.setup();
    render(<AppLayout focusMode><div /></AppLayout>);
    expect(screen.getByTestId("sidebar-provider").dataset.open).toBe("false");
    await user.click(screen.getByTestId("sidebar-trigger"));
    expect(screen.getByTestId("sidebar-provider").dataset.open).toBe("true");
  });

  it("TL5: focusMode=true — mobile bottom nav is not rendered", () => {
    render(<AppLayout focusMode><div /></AppLayout>);
    expect(screen.queryByTestId("mobile-bottom-nav")).not.toBeInTheDocument();
  });

  it("TL6: focusMode=false — mobile bottom nav is rendered", () => {
    render(<AppLayout><div /></AppLayout>);
    expect(screen.getByTestId("mobile-bottom-nav")).toBeInTheDocument();
  });
});
