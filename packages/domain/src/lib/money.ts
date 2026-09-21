export function parseMoneyToCents(input: string): number | null {
  const value = input.trim();
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
export function parseQuantity(input: string): number | null {
  const value = input.trim();
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^[+-]/, '').split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor * (negative ? -1 : 1) : null;
}
