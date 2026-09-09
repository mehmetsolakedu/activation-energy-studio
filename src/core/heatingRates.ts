/** Canonical equality key used by eligibility and every regression pathway. */
export function heatingRateKey(heatingRateKPerMinute: number): string {
  return heatingRateKPerMinute.toPrecision(15);
}
