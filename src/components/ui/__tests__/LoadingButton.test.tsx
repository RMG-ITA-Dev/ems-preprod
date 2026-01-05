import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingButton } from "../loading-button";

describe("LoadingButton", () => {
  it("renders children when not loading", () => {
    render(<LoadingButton>Submit</LoadingButton>);
    expect(screen.getByText("Submit")).toBeInTheDocument();
  });

  it("shows spinner when loading", () => {
    render(<LoadingButton loading>Submit</LoadingButton>);
    
    // Should not show children text
    expect(screen.queryByText("Submit")).not.toBeInTheDocument();
    
    // Should have spinner (Loader2 icon with animate-spin)
    const button = screen.getByRole("button");
    expect(button.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows loadingText when provided and loading", () => {
    render(
      <LoadingButton loading loadingText="Saving...">
        Submit
      </LoadingButton>
    );
    
    expect(screen.getByText("Saving...")).toBeInTheDocument();
    expect(screen.queryByText("Submit")).not.toBeInTheDocument();
  });

  it("is disabled when loading", () => {
    render(<LoadingButton loading>Submit</LoadingButton>);
    
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("is disabled when disabled prop is true", () => {
    render(<LoadingButton disabled>Submit</LoadingButton>);
    
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("is disabled when both loading and disabled", () => {
    render(
      <LoadingButton loading disabled>
        Submit
      </LoadingButton>
    );
    
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("is enabled when not loading and not disabled", () => {
    render(<LoadingButton>Submit</LoadingButton>);
    
    const button = screen.getByRole("button");
    expect(button).not.toBeDisabled();
  });

  it("applies custom className", () => {
    render(<LoadingButton className="custom-class">Submit</LoadingButton>);
    
    const button = screen.getByRole("button");
    expect(button).toHaveClass("custom-class");
  });

  it("passes through button props", () => {
    render(
      <LoadingButton type="submit" name="submit-btn">
        Submit
      </LoadingButton>
    );
    
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("name", "submit-btn");
  });

  it("forwards ref correctly", () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<LoadingButton ref={ref}>Submit</LoadingButton>);
    
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("renders with different variants", () => {
    const { rerender } = render(
      <LoadingButton variant="destructive">Delete</LoadingButton>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(<LoadingButton variant="outline">Cancel</LoadingButton>);
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(<LoadingButton variant="ghost">More</LoadingButton>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders with different sizes", () => {
    const { rerender } = render(<LoadingButton size="sm">Small</LoadingButton>);
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(<LoadingButton size="lg">Large</LoadingButton>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("does not show loadingText when not loading", () => {
    render(<LoadingButton loadingText="Saving...">Submit</LoadingButton>);
    
    expect(screen.getByText("Submit")).toBeInTheDocument();
    expect(screen.queryByText("Saving...")).not.toBeInTheDocument();
  });
});
