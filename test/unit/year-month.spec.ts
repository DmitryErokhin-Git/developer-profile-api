import { describe, expect, it } from 'vitest';
import {
  toDatabaseDate,
  toYearMonth,
  yearMonthSchema,
} from '../../src/common/year-month.js';

describe('year-month dates', () => {
  it.each(['2022-09', '2000-02', '1999-12'])(
    'round-trips %s using the first day in UTC',
    (value) => {
      const date = toDatabaseDate(value);
      expect(date.toISOString()).toBe(`${value}-01T00:00:00.000Z`);
      expect(toYearMonth(date)).toBe(value);
    },
  );

  it.each([
    '2022-00',
    '2022-13',
    '2022-9',
    '2022-09-01',
    'September 2022',
    '0000-01',
  ])('rejects %s', (value) => {
    expect(yearMonthSchema.safeParse(value).success).toBe(false);
    expect(() => toDatabaseDate(value)).toThrow();
  });
});
