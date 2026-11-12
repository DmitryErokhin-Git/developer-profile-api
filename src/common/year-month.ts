import { z } from 'zod';

export const yearMonthSchema = z
  .string()
  .regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

export function toDatabaseDate(value: string): Date {
  return new Date(`${yearMonthSchema.parse(value)}-01T00:00:00.000Z`);
}

export function toYearMonth(value: Date): string {
  return value.toISOString().slice(0, 7);
}
