import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

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
  const [dims, setDims] = useState({ scrollWidth: 0, clientWidth: 0 });
  const [refRetry, setRefRetry] = useState(0);

  const measure = useCallback(() => {
    const target = targetRef.current;
    if (!target) return;
    setDims((prev) =>
      prev.scrollWidth === target.scrollWidth && prev.clientWidth === target.clientWidth
        ? prev
        : { scrollWidth: target.scrollWidth, clientWidth: target.clientWidth },
    );
  }, [targetRef]);

  // Medición en useLayoutEffect y no en un efecto pasivo, para que la franja
  // exista ya en el primer paint: si no, la tabla se dibuja sin ella y baja 12px
  // al aparecer. (Planteado en revisión por Codex, P2.)
  //
  // El detalle que lo complica: React NO ata todas las refs del commit antes de
  // correr los layout effects, los intercala en orden de árbol. Como esta franja
  // se monta como hermana ANTERIOR de <Table>, en su primer layout effect el
  // `containerRef` del primitivo todavía es null. Verificado empíricamente:
  //   ref en useLayoutEffect del hermano ANTERIOR  -> null
  //   ref en useLayoutEffect del hermano POSTERIOR -> el div
  //
  // Por eso el reintento: si la ref no está lista se pide un render más. React
  // procesa un setState hecho desde un layout effect de forma síncrona ANTES de
  // pintar, así que la segunda pasada —que ya ve la ref— sigue llegando a
  // tiempo. Un `useEffect` pasivo también mediría, pero recién después del
  // paint, que es justamente el salto que se quiere evitar.
  useLayoutEffect(() => {
    const target = targetRef.current;
    if (!target) {
      // Una sola vez: si el consumidor nunca pasa `containerRef`, no reintentar
      // en bucle.
      if (refRetry === 0) setRefRetry(1);
      return;
    }
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
  }, [measure, targetRef, refRetry]);

  const hasOverflow = dims.scrollWidth > dims.clientWidth + 1;

  useEffect(() => {
    const target = targetRef.current;
    const strip = stripRef.current;
    if (!target || !strip || !hasOverflow) return;

    // Escribir `scrollLeft` produce un evento `scroll` en el destino, pero no en
    // el acto: se despacha en el frame siguiente, cuando el usuario ya pudo
    // haber movido algo. Distinguir ese eco del scroll real del usuario es todo
    // el problema, y se resuelve guardando QUE posicion escribimos.
    //
    // Tres intentos previos fallaron, cada uno por un motivo distinto
    // (revisiones de Codex P2 y greptile P1):
    //   - Lock de un frame: el navegador despacha en el MISMO paso los `scroll`
    //     pendientes de ambos elementos, y el segundo se descartaba.
    //   - Comparar solo valores: el eco viejo llega encolado ANTES del evento
    //     nuevo del target y le pisaba el movimiento.
    //   - Contar ecos: los eventos se coalescen por elemento y por frame, asi
    //     que un eco y un movimiento del usuario sobre ese mismo elemento
    //     llegan como UN evento; consumirlo por contador tiraba el movimiento.
    const writtenPos = new Map<HTMLElement, number>();

    const mirror = (from: HTMLElement, to: HTMLElement) => () => {
      const next = from.scrollLeft;
      const written = writtenPos.get(from);
      // Un eco pendiente solo se descarta si la posicion sigue siendo
      // EXACTAMENTE la que escribimos. Si cambio, el usuario lo movio despues y
      // ese movimiento manda.
      const isEcho = written !== undefined && Math.abs(next - written) <= 0.5;
      writtenPos.delete(from);
      if (isEcho) return;

      const before = to.scrollLeft;
      // Tolerancia sub-pixel: en pantallas HiDPI `scrollLeft` es fraccionario y
      // el navegador puede redondear al escribir. Sin epsilon rebotarian entre
      // si por diferencias invisibles.
      if (Math.abs(before - next) <= 0.5) return;

      to.scrollLeft = next;
      const after = to.scrollLeft;
      // Se anota el valor REAL tras la escritura, no el pedido: los dos
      // scrollers tienen anchos utiles algo distintos (la franja va fuera del
      // borde), asi que el maximo difiere y el navegador puede recortar. Anotar
      // el pedido haria que el eco recortado no se reconociera y se copiara de
      // vuelta, dejando los ultimos pixeles de la tabla inalcanzables.
      if (after !== before) writtenPos.set(to, after);
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
