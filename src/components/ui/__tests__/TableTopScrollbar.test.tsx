import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useRef } from "react";

import { TableTopScrollbar } from "@/components/ui/table-top-scrollbar";

// Bug 0722-158: la barra superior es un duplicado decorativo del scroller que el
// primitivo <Table> ya crea. Estos tests fijan las cuatro propiedades de las que
// depende que no rompa nada: no aparece sin desborde, espeja el scroll en ambos
// sentidos, NO se realimenta, y es invisible para lectores de pantalla.

const STRIP = "presentation";

/**
 * jsdom no calcula layout: scrollWidth/clientWidth son siempre 0. Se fijan por
 * instancia en el callback ref, que React ata durante el commit — antes de que
 * corran los efectos pasivos del componente.
 */
function Harness({
  scrollWidth,
  clientWidth,
  className,
}: {
  scrollWidth: number;
  clientWidth: number;
  className?: string;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const attach = (node: HTMLDivElement | null) => {
    if (node) {
      Object.defineProperty(node, "scrollWidth", { configurable: true, value: scrollWidth });
      Object.defineProperty(node, "clientWidth", { configurable: true, value: clientWidth });
    }
    targetRef.current = node;
  };

  return (
    <div>
      <TableTopScrollbar targetRef={targetRef} className={className} />
      <div ref={attach} data-testid="target">
        <table />
      </div>
    </div>
  );
}

const getStrip = () => screen.getByRole(STRIP, { hidden: true });
const getTarget = () => screen.getByTestId("target");

beforeEach(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TableTopScrollbar (bug 0722-158)", () => {
  it("no renderiza nada cuando el contenido cabe", () => {
    render(<Harness scrollWidth={800} clientWidth={800} />);
    expect(screen.queryByRole(STRIP, { hidden: true })).toBeNull();
  });

  it("renderiza la franja con un espaciador del ancho desbordado", () => {
    render(<Harness scrollWidth={1600} clientWidth={800} />);
    const spacer = getStrip().firstElementChild as HTMLElement;
    expect(spacer).toBeTruthy();
    expect(spacer.style.width).toBe("1600px");
  });

  it("espeja el scroll del target hacia la franja", () => {
    render(<Harness scrollWidth={1600} clientWidth={800} />);
    const target = getTarget();
    target.scrollLeft = 300;
    act(() => {
      target.dispatchEvent(new Event("scroll"));
    });
    expect(getStrip().scrollLeft).toBe(300);
  });

  it("espeja el scroll de la franja hacia el target", () => {
    render(<Harness scrollWidth={1600} clientWidth={800} />);
    const strip = getStrip();
    strip.scrollLeft = 150;
    act(() => {
      strip.dispatchEvent(new Event("scroll"));
    });
    expect(getTarget().scrollLeft).toBe(150);
  });

  it("no se realimenta: el eco del destino no reescribe el origen", () => {
    render(<Harness scrollWidth={1600} clientWidth={800} />);
    const target = getTarget();
    const strip = getStrip();

    target.scrollLeft = 400;
    act(() => {
      target.dispatchEvent(new Event("scroll"));
    });
    expect(strip.scrollLeft).toBe(400);

    // El navegador emite `scroll` en la franja al escribirle scrollLeft. Sin el
    // guard, este eco reescribiria el target y arrancaria un bucle infinito.
    target.scrollLeft = 999;
    act(() => {
      strip.dispatchEvent(new Event("scroll"));
    });
    expect(target.scrollLeft).toBe(999);
  });

  it("es decorativa: aria-hidden y fuera del orden de tabulacion", () => {
    render(<Harness scrollWidth={1600} clientWidth={800} />);
    const strip = getStrip();
    expect(strip).toHaveAttribute("aria-hidden", "true");
    expect(strip).toHaveAttribute("tabindex", "-1");
  });

  it("NO es sticky: en este shell <main> nunca scrollea y el sticky seria inerte", () => {
    // Se probó `sticky top-0` y no hace nada: SidebarProvider (min-h-svh),
    // AppLayout (min-h-screen) y <main> (flex-1) crecen con el contenido, asi que
    // el scrollport de <main> nunca se mueve. Este test evita que alguien lo
    // reintroduzca sin antes convertir el shell a altura fija.
    render(<Harness scrollWidth={1600} clientWidth={800} />);
    const strip = getStrip();
    expect(strip.className).not.toContain("sticky");
    expect(strip.className).toMatch(/bg-/);
  });

  it("permite sobreescribir el fondo (DataTable usa bg-card)", () => {
    render(<Harness scrollWidth={1600} clientWidth={800} className="bg-card" />);
    const strip = getStrip();
    // cn() usa tailwind-merge: el override debe ganar, no coexistir.
    expect(strip.className).toContain("bg-card");
    expect(strip.className).not.toContain("bg-background");
  });

  it("no lanza cuando el entorno carece de ResizeObserver", () => {
    (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver = undefined;
    expect(() => {
      const { unmount } = render(<Harness scrollWidth={1600} clientWidth={800} />);
      unmount();
    }).not.toThrow();
  });

  it("desconecta observers y listeners al desmontar", () => {
    const disconnect = vi.fn();
    class TrackingResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = disconnect;
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = TrackingResizeObserver;

    const { unmount } = render(<Harness scrollWidth={1600} clientWidth={800} />);
    const removeSpy = vi.spyOn(getTarget(), "removeEventListener");
    unmount();

    expect(disconnect).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
