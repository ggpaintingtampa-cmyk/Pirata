import { describe, expect, it } from 'vitest';
import { can, ROLE_CAPS } from '@pirata/contracts/permissions';
import { translate } from '../../src/i18n';
import { minuteToTime, timeToMinute } from '../../src/components/TimeField';
import { addDays } from '../../src/components/DateField';
import { formatMoney, parseMoney } from '../../src/components/Money';

describe('foundation helpers', () => {
  it('keeps money away from everyone but the owner', () => {
    expect(can('owner', 'money.costs')).toBe(true);
    for (const role of ['manager', 'sales', 'worker'] as const) expect(can(role, 'money.costs')).toBe(false);
    expect(can('sales', 'money.sales')).toBe(true);
    expect(can('worker', 'money.sales')).toBe(false);
    expect(ROLE_CAPS).toEqual({ owner: 2, manager: 5, sales: 5, worker: 10 });
  });
  it('translates with fallback and placeholders', () => {
    expect(translate('es', 'shell.nav.work')).toBe('Diario');
    expect(translate('en', 'shell.greeting.morning', { name: 'Jose' })).toBe('Good morning, Jose.');
    expect(translate('es', 'not.a.key')).toBe('not.a.key');
  });
  it('converts times, dates and money', () => {
    expect(minuteToTime(510)).toBe('08:30');
    expect(timeToMinute('16:05')).toBe(965);
    expect(timeToMinute('')).toBeNull();
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(formatMoney(123456)).toBe('$1,234.56');
    expect(parseMoney('$1,234.5')).toBe(123450);
    expect(parseMoney('abc')).toBeNull();
  });
});
