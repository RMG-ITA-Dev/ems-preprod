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

// ── Tecleo incremental sobre un padre controlado (BUG 0722-164) ────────────────
// El resto de la suite dispara UN change con el valor final ("123.45"), lo que
// sobreescribe lo que el input muestre y esconde los bugs de re-render. Un
// navegador teclea SOBRE el contenido visible, y el padre real guarda un numero
// (no el string), asi que hay que reproducir las dos cosas.

function Controlled({
  decimals = 2,
  locale = "es",
}: {
  decimals?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  locale?: "es" | "en";
}) {
  const [value, setValue] = React.useState<number>(0);
  return (
    <>
      <NumericInput
        data-testid="numeric-input"
        decimals={decimals}
        locale={locale}
        min={0}
        value={value || ""}
        onChange={setValue}
      />
      <span data-testid="model">{String(value)}</span>
    </>
  );
}

/** Teclea sobre lo que el input MUESTRA, con el caret al final (como el browser). */
function typeKeys(input: HTMLInputElement, keys: string) {
  for (const key of keys) {
    fireEvent.change(input, { target: { value: input.value + key } });
  }
}

/** Backspace desde el final, tambien sobre lo que el input MUESTRA. */
function backspace(input: HTMLInputElement, times = 1) {
  for (let i = 0; i < times; i++) {
    fireEvent.change(input, { target: { value: input.value.slice(0, -1) } });
  }
}

describe("NumericInput — tecleo incremental (0722-164)", () => {
  it("teclea 100,05 sin perder el cero del primer decimal", () => {
    // Antes: al teclear el "0" el input volvia a renderizar "100" desde el value
    // del padre, el "5" caia sobre el entero y se guardaba 1005.
    render(<Controlled />);
    const input = screen.getByTestId("numeric-input") as HTMLInputElement;

    typeKeys(input, "100,05");

    expect(input.value).toBe("100,05");
    expect(screen.getByTestId("model").textContent).toBe("100.05");
  });

  it("teclea 0,05", () => {
    render(<Controlled />);
    const input = screen.getByTestId("numeric-input") as HTMLInputElement;

    typeKeys(input, "0,05");

    expect(screen.getByTestId("model").textContent).toBe("0.05");
  });

  it("teclea 100,75 (primer decimal distinto de cero, ya funcionaba)", () => {
    render(<Controlled />);
    const input = screen.getByTestId("numeric-input") as HTMLInputElement;

    typeKeys(input, "100,75");

    expect(input.value).toBe("100,75");
    expect(screen.getByTestId("model").textContent).toBe("100.75");
  });

  it("teclea 1250,50 conservando el cero final visible", () => {
    render(<Controlled />);
    const input = screen.getByTestId("numeric-input") as HTMLInputElement;

    typeKeys(input, "1250,50");

    expect(input.value).toBe("1250,50");
    expect(screen.getByTestId("model").textContent).toBe("1250.5");
  });

  it("teclea un tipo de cambio 6,05 con decimals=6", () => {
    // El mismo defecto convertia 6,05 en 605 en el tipo de cambio del plan de pagos.
    render(<Controlled decimals={6} />);
    const input = screen.getByTestId("numeric-input") as HTMLInputElement;

    typeKeys(input, "6,05");

    expect(screen.getByTestId("model").textContent).toBe("6.05");
  });

  it("normaliza el texto intermedio al salir del campo", () => {
    render(<Controlled />);
    const input = screen.getByTestId("numeric-input") as HTMLInputElement;

    typeKeys(input, "100,0");
    expect(input.value).toBe("100,0"); // se conserva mientras se escribe

    fireEvent.blur(input);

    expect(input.value).toBe("100"); // al salir, forma canonica del numero
    expect(screen.getByTestId("model").textContent).toBe("100");
  });

  it("edita un monto YA cargado bajando a un decimal cero", () => {
    // El caso que el tecleo desde cero no cubre: al pasar de 100,15 a 100,0 el
    // valor del padre cambia (100.15 -> 100), y el efecto que escucha `value`
    // borraba el texto intermedio recien guardado. El "5" siguiente caia sobre
    // el entero y quedaba 1005.
    render(<Controlled />);
    const input = screen.getByTestId("numeric-input") as HTMLInputElement;

    typeKeys(input, "100,15");
    expect(screen.getByTestId("model").textContent).toBe("100.15");

    backspace(input, 2); // "100,15" -> "100,1" -> "100,"
    typeKeys(input, "05");

    expect(input.value).toBe("100,05");
    expect(screen.getByTestId("model").textContent).toBe("100.05");
  });

  it("edita un monto YA cargado dejando el cero final", () => {
    render(<Controlled />);
    const input = screen.getByTestId("numeric-input") as HTMLInputElement;

    typeKeys(input, "1250,75");
    backspace(input, 2); // -> "1250,"
    typeKeys(input, "50");

    expect(input.value).toBe("1250,50");
    expect(screen.getByTestId("model").textContent).toBe("1250.5");
  });

  it("descarta el texto intermedio cuando el valor cambia DESDE AFUERA", () => {
    // Guarda del efecto: hidratar/resetear el campo por fuera (cargar una
    // solicitud existente) debe seguir imponiendose sobre lo que se estaba
    // tecleando; el fix no puede volver inmune al texto intermedio.
    const { rerender } = render(
      <NumericInput decimals={2} locale="es" value={100} data-testid="numeric-input" />,
    );
    const input = screen.getByTestId("numeric-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "100,0" } });
    expect(input.value).toBe("100,0");

    rerender(
      <NumericInput decimals={2} locale="es" value={2500.5} data-testid="numeric-input" />,
    );

    expect(input.value).toBe("2500,5");
  });

  it("no arrastra ceros a la izquierda al teclear sobre un campo en 0", () => {
    // Guarda de la regresion que detecto StaffAssignmentsCard: el campo muestra
    // "0", el usuario teclea "0.5" y quedaba "00.5". Los ceros a la izquierda son
    // ruido que el numero ya representa; solo el cero DECIMAL debe conservarse.
    // Padre que renderiza el 0 literal (sin `|| ""`), como StaffAssignmentsCard.
    function ControlledZero() {
      const [value, setValue] = React.useState<number>(0);
      return (
        <NumericInput
          data-testid="numeric-input"
          decimals={2}
          locale="en"
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<ControlledZero />);
    const input = screen.getByTestId("numeric-input") as HTMLInputElement;

    typeKeys(input, "0.5");

    expect(input.value).toBe("0.5");
  });

  it("limpia el texto intermedio al vaciar el campo por completo", () => {
    // Con un borrador preservado ("100,0"), seleccionar todo y borrar emitia 0
    // pero dejaba el intermedio pegado: el input seguia mostrando "100,0" y la
    // tecla siguiente se pegaba a ese resto, guardando un monto ajeno.
    render(<Controlled />);
    const input = screen.getByTestId("numeric-input") as HTMLInputElement;

    typeKeys(input, "100,0");
    expect(input.value).toBe("100,0");

    fireEvent.change(input, { target: { value: "" } }); // seleccionar todo + borrar

    expect(input.value).toBe("");
    expect(screen.getByTestId("model").textContent).toBe("0");

    typeKeys(input, "5");

    expect(input.value).toBe("5");
    expect(screen.getByTestId("model").textContent).toBe("5");
  });

  it("teclea un entero sin dejar texto intermedio pegado", () => {
    // Guarda: el intermedio solo debe sobrevivir cuando el texto NO es canonico.
    render(<Controlled />);
    const input = screen.getByTestId("numeric-input") as HTMLInputElement;

    typeKeys(input, "250");

    expect(input.value).toBe("250");
    expect(screen.getByTestId("model").textContent).toBe("250");
  });
});
