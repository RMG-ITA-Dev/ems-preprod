import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeavePageDialog } from "../leave-page-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const makeBlocker = (state: "blocked" | "unblocked") =>
  ({
    state,
    reset: vi.fn(),
    proceed: vi.fn(),
  }) as any;

describe("LeavePageDialog (bug 0513-111)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("LP-07: renders nothing when blocker is unblocked", () => {
    const blocker = makeBlocker("unblocked");
    const { container } = render(<LeavePageDialog blocker={blocker} isDirty={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("LP-01: non-dirty blocked dialog shows common.leave — not common.cancel — on the action button", () => {
    render(<LeavePageDialog blocker={makeBlocker("blocked")} isDirty={false} />);
    expect(screen.getByText("common.leave")).toBeInTheDocument();
    expect(screen.queryByText("common.cancel")).not.toBeInTheDocument();
  });

  it("LP-02: non-dirty blocked dialog shows common.stay on the dismiss button", () => {
    render(<LeavePageDialog blocker={makeBlocker("blocked")} isDirty={false} />);
    expect(screen.getByText("common.stay")).toBeInTheDocument();
  });

  it("LP-03: clicking the leave button calls blocker.proceed", async () => {
    const blocker = makeBlocker("blocked");
    const user = userEvent.setup();
    render(<LeavePageDialog blocker={blocker} isDirty={false} />);
    await user.click(screen.getByText("common.leave"));
    expect(blocker.proceed).toHaveBeenCalled();
  });

  it("LP-04: clicking the stay button calls blocker.reset", async () => {
    const blocker = makeBlocker("blocked");
    const user = userEvent.setup();
    render(<LeavePageDialog blocker={blocker} isDirty={false} />);
    await user.click(screen.getByText("common.stay"));
    expect(blocker.reset).toHaveBeenCalled();
  });

  it("LP-05: dirty blocked dialog shows common.leaveAnyway — not common.cancel — on the action button", () => {
    render(<LeavePageDialog blocker={makeBlocker("blocked")} isDirty={true} />);
    expect(screen.getByText("common.leaveAnyway")).toBeInTheDocument();
    expect(screen.queryByText("common.cancel")).not.toBeInTheDocument();
  });

  it("LP-06: dirty blocked dialog action button has destructive styling", () => {
    render(<LeavePageDialog blocker={makeBlocker("blocked")} isDirty={true} />);
    expect(screen.getByText("common.leaveAnyway")).toHaveClass("bg-destructive/70");
  });

  it("LP-08: clicking leaveAnyway button (dirty) calls blocker.proceed", async () => {
    const blocker = makeBlocker("blocked");
    const user = userEvent.setup();
    render(<LeavePageDialog blocker={blocker} isDirty={true} />);
    await user.click(screen.getByText("common.leaveAnyway"));
    expect(blocker.proceed).toHaveBeenCalled();
  });

  it("LP-09: clicking stay button (dirty) calls blocker.reset", async () => {
    const blocker = makeBlocker("blocked");
    const user = userEvent.setup();
    render(<LeavePageDialog blocker={blocker} isDirty={true} />);
    await user.click(screen.getByText("common.stay"));
    expect(blocker.reset).toHaveBeenCalled();
  });
});
