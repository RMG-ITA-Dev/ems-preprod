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

  it("no se realimenta: con ambos ya sincronizados el eco no mueve nada", () => {
    render(<Harness scrollWidth={1600} clientWidth={800} />);
    const target = getTarget();
    const strip = getStrip();

    target.scrollLeft = 400;
    act(() => {
      target.dispatchEvent(new Event("scroll"));
    });
    expect(strip.scrollLeft).toBe(400);

    // El navegador emite `scroll` en la franja al escribirle scrollLeft. Ese eco
    // esta contabilizado, asi que se consume sin espejar de vuelta y la cadena
    // se corta ahi.
    act(() => {
      strip.dispatchEvent(new Event("scroll"));
    });
    expect(target.scrollLeft).toBe(400);
    expect(strip.scrollLeft).toBe(400);
  });

  it("un scroll del usuario que adelanta al eco no se descarta", () => {
    // Los eventos `scroll` se coalescen por elemento y por frame: si el usuario
    // mueve la franja antes de que se despache el eco de nuestra escritura, no
    // llegan dos eventos sino UNO, con la posicion nueva del usuario. Tratarlo
    // como eco tira ese movimiento a la basura.
    render(<Harness scrollWidth={1600} clientWidth={800} />);
    const target = getTarget();
    const strip = getStrip();

    // Frame N: el usuario mueve la tabla; se escribe la franja y queda un eco.
    target.scrollLeft = 100;
    act(() => {
      target.dispatchEvent(new Event("scroll"));
    });
    expect(strip.scrollLeft).toBe(100);

    // Antes de que llegue el eco, el usuario agarra la franja y la lleva a 700.
    strip.scrollLeft = 700;
    act(() => {
      strip.dispatchEvent(new Event("scroll"));
    });

    expect(target.scrollLeft).toBe(700);
  });

  it("no vuelve inalcanzable el extremo de la tabla cuando la franja recorta", () => {
    // La franja se monta FUERA del borde, asi que su ancho util difiere unos px
    // del scroller de la tabla y su maximo scroll es menor. Si se anotara la
    // posicion PEDIDA en vez de la real, el eco recortado no se reconoceria como
    // eco y se copiaria de vuelta, arrastrando la tabla lejos de su extremo.
    render(<Harness scrollWidth={1600} clientWidth={800} />);
    const target = getTarget();
    const strip = getStrip();

    let stripPos = 0;
    Object.defineProperty(strip, "scrollLeft", {
      configurable: true,
      get: () => stripPos,
      set: (v: number) => {
        stripPos = Math.min(v, 798); // la franja llega 2px menos
      },
    });

    target.scrollLeft = 800; // el usuario llega al extremo de la tabla
    act(() => {
      target.dispatchEvent(new Event("scroll"));
    });
    expect(strip.scrollLeft).toBe(798); // recortada

    // El eco llega con 798; debe reconocerse y no arrastrar la tabla a 798.
    act(() => {
      strip.dispatchEvent(new Event("scroll"));
    });
    expect(target.scrollLeft).toBe(800);
  });

  it("el eco no se traba: tras consumir uno, el scroll real sigue funcionando", () => {
    // Modo de falla propio de contar ecos: si un contador quedara incrementado
    // de mas, se tragaria un scroll legitimo del usuario. Cada eco debe
    // consumir exactamente una unidad.
    render(<Harness scrollWidth={1600} clientWidth={800} />);
    const target = getTarget();
    const strip = getStrip();

    target.scrollLeft = 200;
    act(() => {
      target.dispatchEvent(new Event("scroll"));
    });
    act(() => {
      strip.dispatchEvent(new Event("scroll"));
    }); // eco consumido

    // Ahora el usuario arrastra la franja: debe mandar, no ser descartado.
    strip.scrollLeft = 640;
    act(() => {
      strip.dispatchEvent(new Event("scroll"));
    });
    expect(target.scrollLeft).toBe(640);
  });

  it("no se queda desincronizada cuando llegan dos eventos en el mismo frame", async () => {
    // Revision de Codex (P2): el navegador despacha los `scroll` pendientes de
    // AMBOS elementos en el mismo paso del frame. Durante un scroll continuo eso
    // pasa siempre: el eco de la franja (del frame anterior) llega junto al
    // evento nuevo del target. Si el primero toma el lock, el segundo se
    // DESCARTA y la franja queda vieja hasta que el usuario vuelva a scrollear.
    render(<Harness scrollWidth={1600} clientWidth={800} />);
    const target = getTarget();
    const strip = getStrip();

    // Frame N: el usuario scrollea el target a 100 y se espeja.
    target.scrollLeft = 100;
    act(() => {
      target.dispatchEvent(new Event("scroll"));
    });
    expect(strip.scrollLeft).toBe(100);
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });

    // El usuario sigue scrolleando ANTES de que llegue el eco: cuando el
    // handler de la franja corra, el target ya esta en 250. Este orden importa
    // — es el que reprodujo la revision, y el que mi primer test erraba.
    target.scrollLeft = 250;

    // Frame N+1: el eco de la franja esta encolado primero, asi que corre antes
    // que el evento nuevo del target.
    act(() => {
      strip.dispatchEvent(new Event("scroll"));
    });
    // La franja NO puede arrastrar al target de vuelta a su posicion vieja.
    expect(target.scrollLeft).toBe(250);

    act(() => {
      target.dispatchEvent(new Event("scroll"));
    });

    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });

    // Si el segundo evento se descarto, la franja se quedo en 100 y arrastrarla
    // devolveria la tabla a esa posicion vieja.
    expect(strip.scrollLeft).toBe(250);
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
