import { describe, expect, it } from 'vitest';
import { parseMoneyToCents, parseQuantity } from '../../src/lib/money';
import { businessDate, isLocalDate } from '../../src/lib/dates';
describe('money and date-only values', () => {
  it('sums $0.10 and $0.20 to exactly 30 cents', () => expect(parseMoneyToCents('0.10')! + parseMoneyToCents('0.20')!).toBe(30));
  it.each(['', '0', '-2', '1.234', '1e3', 'Infinity', '1,000', '.20', '1.', '900719925474099999.00'])('rejects invalid money %s', input => expect(parseMoneyToCents(input)).toBeNull());
  it('accepts and trims positive money', () => expect(parseMoneyToCents(' 25.5 ')).toBe(2550));
  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-09-00', '2026-9-16', '0000-01-01'])('rejects impossible dates %s', input => expect(isLocalDate(input)).toBe(false));
  it('supports leap years', () => { expect(isLocalDate('2024-02-29')).toBe(true); expect(isLocalDate('2000-02-29')).toBe(true); expect(isLocalDate('1900-02-29')).toBe(false); });
  it('uses New York, not UTC for Today', () => expect(businessDate(Date.parse('2026-09-16T02:00:00Z'))).toBe('2026-09-15'));
  it('handles New York midnight across daylight saving seasons', () => {
    expect(businessDate(Date.parse('2026-09-16T03:59:59Z'))).toBe('2026-09-15');
    expect(businessDate(Date.parse('2026-09-16T04:00:00Z'))).toBe('2026-09-16');
    expect(businessDate(Date.parse('2026-01-16T04:59:59Z'))).toBe('2026-01-15');
  });
  it('parses signed material quantities without floating point rounding', () => { expect(parseQuantity('-2.15')).toBe(-215); expect(parseQuantity('+3')).toBe(300); expect(parseQuantity('0.001')).toBeNull(); });
});
