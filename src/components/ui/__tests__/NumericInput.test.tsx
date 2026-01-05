import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumericInput } from "../numeric-input";

describe("NumericInput", () => {
  it("renders with default props", () => {
    render(<NumericInput data-testid="numeric-input" />);
    const input = screen.getByTestId("numeric-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputMode", "decimal");
  });

  it("accepts numeric input", () => {
    const onChange = vi.fn();
    render(<NumericInput onChange={onChange} data-testid="numeric-input" />);
    
    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "123" } });
    
    expect(onChange).toHaveBeenCalledWith(123);
  });

  it("accepts decimal input with default 2 decimals", () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    render(
      <NumericInput
        onChange={onChange}
        onValueChange={onValueChange}
        data-testid="numeric-input"
      />
    );
    
    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "123.45" } });
    
    expect(onChange).toHaveBeenCalledWith(123.45);
    expect(onValueChange).toHaveBeenCalledWith("123.45");
  });

  it("rejects more than specified decimals", () => {
    const onChange = vi.fn();
    render(
      <NumericInput onChange={onChange} decimals={1} data-testid="numeric-input" />
    );
    
    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "12.34" } }); // 2 decimals, but only 1 allowed
    
    // Should not trigger change with invalid value
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows only integers when decimals=0", () => {
    const onChange = vi.fn();
    render(
      <NumericInput onChange={onChange} decimals={0} data-testid="numeric-input" />
    );
    
    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "123" } });
    expect(onChange).toHaveBeenCalledWith(123);
    
    fireEvent.change(input, { target: { value: "123.5" } });
    // Should reject decimal
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("uses comma as decimal separator for Spanish locale", () => {
    const onValueChange = vi.fn();
    render(
      <NumericInput
        locale="es"
        value={123.45}
        onValueChange={onValueChange}
        data-testid="numeric-input"
      />
    );
    
    const input = screen.getByTestId("numeric-input") as HTMLInputElement;
    // Display should show comma
    expect(input.value).toBe("123,45");
  });

  it("respects min constraint", () => {
    const onChange = vi.fn();
    render(
      <NumericInput onChange={onChange} min={10} data-testid="numeric-input" />
    );
    
    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "5" } });
    
    // Should reject value below min
    expect(onChange).not.toHaveBeenCalled();
  });

  it("respects max constraint", () => {
    const onChange = vi.fn();
    render(
      <NumericInput onChange={onChange} max={100} data-testid="numeric-input" />
    );
    
    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "150" } });
    
    // Should reject value above max
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows empty string and returns 0", () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    render(
      <NumericInput
        onChange={onChange}
        onValueChange={onValueChange}
        value="123"
        data-testid="numeric-input"
      />
    );
    
    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "" } });
    
    expect(onChange).toHaveBeenCalledWith(0);
    expect(onValueChange).toHaveBeenCalledWith("");
  });

  it("cleans up trailing decimal on blur", () => {
    const onValueChange = vi.fn();
    render(
      <NumericInput onValueChange={onValueChange} data-testid="numeric-input" />
    );
    
    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "123." } });
    fireEvent.blur(input);
    
    // Should clean up trailing decimal
    expect(onValueChange).toHaveBeenLastCalledWith("123");
  });

  it("cleans up lone minus sign on blur", () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    render(
      <NumericInput
        onChange={onChange}
        onValueChange={onValueChange}
        data-testid="numeric-input"
      />
    );
    
    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "-" } });
    fireEvent.blur(input);
    
    expect(onValueChange).toHaveBeenLastCalledWith("");
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("allows negative numbers when min is undefined", () => {
    const onChange = vi.fn();
    render(<NumericInput onChange={onChange} data-testid="numeric-input" />);
    
    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "-50" } });
    
    expect(onChange).toHaveBeenCalledWith(-50);
  });

  it("applies custom className", () => {
    render(
      <NumericInput className="custom-class" data-testid="numeric-input" />
    );
    
    const input = screen.getByTestId("numeric-input");
    expect(input).toHaveClass("custom-class");
  });

  it("handles disabled state", () => {
    render(<NumericInput disabled data-testid="numeric-input" />);
    
    const input = screen.getByTestId("numeric-input");
    expect(input).toBeDisabled();
  });
});
