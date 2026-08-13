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

  it("respects min constraint on blur", () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    const { rerender } = render(
      <NumericInput onChange={onChange} onValueChange={onValueChange} min={10} value="" data-testid="numeric-input" />
    );
    
    const input = screen.getByTestId("numeric-input");
    // During typing, min is NOT enforced (allows typing intermediate values)
    fireEvent.change(input, { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith(5);
    
    // Simulate parent updating value
    rerender(
      <NumericInput onChange={onChange} onValueChange={onValueChange} min={10} value={5} data-testid="numeric-input" />
    );
    
    // On blur, min IS enforced
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(10);
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
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    const { rerender } = render(
      <NumericInput onChange={onChange} onValueChange={onValueChange} value="" data-testid="numeric-input" />
    );
    
    const input = screen.getByTestId("numeric-input");
    // Intermediate state with trailing decimal - this sets intermediateValue
    fireEvent.change(input, { target: { value: "123." } });
    
    // Simulate parent not updating value since "123." isn't a valid number
    // The intermediateValue "123." is preserved
    
    // Then blur to clean up
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

  it("allows typing minus sign first in empty field", () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    const { rerender } = render(
      <NumericInput onChange={onChange} onValueChange={onValueChange} value="" data-testid="numeric-input" />
    );
    
    const input = screen.getByTestId("numeric-input");
    
    // Type minus first (intermediate state)
    fireEvent.change(input, { target: { value: "-" } });
    // Minus is stored in intermediate state, displayed in input
    expect((input as HTMLInputElement).value).toBe("-");
    
    // Now type the number
    fireEvent.change(input, { target: { value: "-500" } });
    expect(onChange).toHaveBeenCalledWith(-500);
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

  // ── 0722-161: el separador tecleado no depende del locale ────────────────────
  // handleKeyDown siempre acepto "," y ".", pero handleChange construia el patron
  // solo desde `locale`, asi que el separador "contrario" se descartaba en
  // silencio. `locale` ahora rige unicamente el separador que se muestra.

  it("accepts a comma as decimal separator in en locale", () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    render(
      <NumericInput onChange={onChange} onValueChange={onValueChange} data-testid="numeric-input" />
    );

    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "123,45" } });

    expect(onChange).toHaveBeenCalledWith(123.45);
    // se devuelve canonicalizado al separador del locale
    expect(onValueChange).toHaveBeenCalledWith("123.45");
  });

  it("accepts a period as decimal separator in es locale", () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    render(
      <NumericInput
        locale="es"
        onChange={onChange}
        onValueChange={onValueChange}
        data-testid="numeric-input"
      />
    );

    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "123.45" } });

    expect(onChange).toHaveBeenCalledWith(123.45);
    expect(onValueChange).toHaveBeenCalledWith("123,45");
  });

  it("keeps the intermediate comma state while typing in en locale", () => {
    const onChange = vi.fn();
    render(<NumericInput onChange={onChange} value="" data-testid="numeric-input" />);

    const input = screen.getByTestId("numeric-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "6," } });

    // el caracter no se traga: queda visible, canonicalizado, y sin emitir NaN
    expect(input.value).toBe("6.");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("strips a trailing foreign separator on blur", () => {
    const onValueChange = vi.fn();
    render(<NumericInput onValueChange={onValueChange} value="" data-testid="numeric-input" />);

    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "6," } });
    fireEvent.blur(input);

    expect(onValueChange).toHaveBeenLastCalledWith("6");
  });

  it("rejects a comma when decimals=0", () => {
    // guarda de regresion: los campos enteros no se aflojan por el cambio de patron
    const onChange = vi.fn();
    render(<NumericInput onChange={onChange} decimals={0} data-testid="numeric-input" />);

    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "123,5" } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects a comma group beyond the decimal budget", () => {
    // "1,250" (separador de miles) sigue rechazado: 3 digitos exceden decimals=2
    const onChange = vi.fn();
    render(<NumericInput onChange={onChange} decimals={2} data-testid="numeric-input" />);

    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "1,250" } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("accepts up to 6 decimals for high-precision rates", () => {
    const onChange = vi.fn();
    render(<NumericInput onChange={onChange} decimals={6} data-testid="numeric-input" />);

    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "6,123456" } });

    expect(onChange).toHaveBeenCalledWith(6.123456);
  });

  it("rejects a 7th decimal when decimals=6", () => {
    const onChange = vi.fn();
    render(<NumericInput onChange={onChange} decimals={6} data-testid="numeric-input" />);

    const input = screen.getByTestId("numeric-input");
    fireEvent.change(input, { target: { value: "6.1234567" } });

    expect(onChange).not.toHaveBeenCalled();
  });
});
