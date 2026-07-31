// Phase 6 — the destructive deficit accent for CategoryGapChart, in its
// own non-component module so the chart module exports React components
// only (react-refresh/only-export-components — GPT-5.6 P3-01 on
// PR #227). Token only, no HEX in JSX (plan §6).

const GAP_COLOR = "hsl(var(--destructive))";

export interface CategoryGapDatum {
  categoryId: string;
  categoryName: string;
  demand: number;
  supply: number;
  gap: number;
}

/** Destructive accent on positive gaps only (plan §6): the deficit value
 *  is annotated at the end of the supply bar. The accent keys off the
 *  ROUNDED zero-decimal presentation value, not the raw float — the
 *  server deliberately keeps raw FP precision, so a fully staffed
 *  category can return a ~1e-14 residue gap that must not paint a red
 *  "−0" (D-P6-11's ≈ 0 guard, applied at the presentation layer). */
export function gapLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  index?: number;
  data: CategoryGapDatum[];
}) {
  const { x, y, width, height, index, data } = props;
  const row = index === undefined ? undefined : data[index];
  if (!row || Math.round(row.gap) <= 0) return null;
  const xn = Number(x ?? 0) + Number(width ?? 0) + 6;
  const yn = Number(y ?? 0) + Number(height ?? 0) / 2;
  return (
    <text
      x={xn}
      y={yn}
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
      fill={GAP_COLOR}
    >
      {`−${Math.round(row.gap)}`}
    </text>
  );
}
