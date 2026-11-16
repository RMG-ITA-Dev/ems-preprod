// Aritmética compartida por EMS y el ETL. El contrato monetario usa centavos,
// porcentajes de hasta seis decimales y tasa de hasta cuatro decimales.
export function scaled(value, scale) {
  const s = String(value); const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m || (m[3] ?? '').replace(/0+$/, '').length > scale) throw new Error(`decimal inválido: ${s}`);
  return (m[1] ? -1n : 1n) * (BigInt(m[2]) * 10n ** BigInt(scale) + BigInt((m[3] ?? '').padEnd(scale, '0').slice(0, scale) || '0'));
}
export function ceilDivide(n, d) {
  if (d <= 0n) throw new Error('divisor inválido');
  return n >= 0n ? (n + d - 1n) / d : n / d;
}
export function grossCents(baseFourDecimals, taxRateFourDecimals) {
  return ceilDivide(scaled(baseFourDecimals, 4) * 100n, 10000n - scaled(taxRateFourDecimals, 4));
}
export function percentageCents(totalCents, percentage) {
  const numerator = totalCents * scaled(percentage, 6); const denominator = 100000000n;
  if (numerator < 0n) return -((-numerator * 2n + denominator) / (2n * denominator));
  return (numerator * 2n + denominator) / (2n * denominator);
}
