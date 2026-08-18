import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface TableTopScrollbarProps {
  /**
   * Ref al div que realmente scrollea. Pásalo TAMBIÉN como `containerRef` a
   * <Table>: el primitivo crea su propio `overflow-auto` interno, así que un
   * envoltorio externo nunca sería el scroller real y la sincronización no
   * movería nada.
   */
  targetRef: React.RefObject<HTMLElement>;
  className?: string;
}

/**
 * Bug 0722-158 — barra de desplazamiento horizontal ADICIONAL en la parte
 * superior de una tabla ancha, sincronizada con la que el navegador dibuja al
 * pie del scroller. Sin desborde no renderiza nada, para no afectar la
 * navegación ni la interacción con la tabla.
 *
 * Debe montarse FUERA del contenedor con `overflow-hidden` que enmarca la tabla,
 * para que el borde redondeado no la recorte.
 */
export function TableTopScrollbar({ targetRef, className }: TableTopScrollbarProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const [dims, setDims] = useState({ scrollWidth: 0, clientWidth: 0 });

  const measure = useCallback(() => {
    const target = targetRef.current;
    if (!target) return;
    setDims((prev) =>
      prev.scrollWidth === target.scrollWidth && prev.clientWidth === target.clientWidth
        ? prev
        : { scrollWidth: target.scrollWidth, clientWidth: target.clientWidth },
    );
  }, [targetRef]);

  // useEffect y no useLayoutEffect a propósito: los efectos de layout corren en
  // orden de árbol, y esta franja es hermana ANTERIOR de <Table>, así que en un
  // layout effect `targetRef.current` todavía sería null. Los efectos pasivos
  // corren una vez que todo el commit ató sus refs.
  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    measure();

    // jsdom no provee ninguno de los dos observers; la medición inicial de
    // arriba igual corre, y los navegadores reales reciben actualizaciones.
    const cleanups: Array<() => void> = [];
    if (typeof ResizeObserver !== "undefined") {
      const resize = new ResizeObserver(measure);
      resize.observe(target);
      if (target.firstElementChild) resize.observe(target.firstElementChild);
      cleanups.push(() => resize.disconnect());
    }
    if (typeof MutationObserver !== "undefined") {
      // Filtros, búsqueda y pestaña de moneda cambian el nº de filas y con él
      // el ancho de la tabla, sin que medie un resize del contenedor.
      const mutations = new MutationObserver(measure);
      mutations.observe(target, { childList: true, subtree: true });
      cleanups.push(() => mutations.disconnect());
    }
    return () => cleanups.forEach((dispose) => dispose());
  }, [measure, targetRef]);

  const hasOverflow = dims.scrollWidth > dims.clientWidth + 1;

  useEffect(() => {
    const target = targetRef.current;
    const strip = stripRef.current;
    if (!target || !strip || !hasOverflow) return;

    // Guard anti-bucle: escribir `scrollLeft` dispara otro evento `scroll`, que
    // sin esto reescribiría el origen y así indefinidamente.
    const mirror = (from: HTMLElement, to: HTMLElement) => () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      to.scrollLeft = from.scrollLeft;
      requestAnimationFrame(() => {
        syncingRef.current = false;
      });
    };

    const onTargetScroll = mirror(target, strip);
    const onStripScroll = mirror(strip, target);
    target.addEventListener("scroll", onTargetScroll, { passive: true });
    strip.addEventListener("scroll", onStripScroll, { passive: true });
    strip.scrollLeft = target.scrollLeft;

    return () => {
      target.removeEventListener("scroll", onTargetScroll);
      strip.removeEventListener("scroll", onStripScroll);
    };
  }, [hasOverflow, targetRef]);

  if (!hasOverflow) return null;

  return (
    <div
      ref={stripRef}
      aria-hidden="true"
      role="presentation"
      tabIndex={-1}
      className={cn(
        // Bug 0722-158 — NO usar `sticky top-*` aquí. Se probó y no funciona en
        // este shell: SidebarProvider (min-h-svh), AppLayout (min-h-screen) y
        // <main> (flex-1) crecen con el contenido, así que el <main> nunca
        // desborda ni scrollea — pero su `overflow-auto` sí lo convierte en
        // scrollport, y un sticky anclado a una caja que no se mueve es inerte.
        // Quien lo quiera sticky primero tiene que convertir el shell a altura
        // fija (h-screen) para que <main> sea el scroller real.
        "table-top-scrollbar bg-background overflow-x-auto overflow-y-hidden",
        className,
      )}
    >
      <div style={{ width: dims.scrollWidth, height: 1 }} />
    </div>
  );
}
