import { z } from 'zod';
import { yearMonthSchema } from '../common/year-month.js';

const key = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a stable lowercase key');
const text = (max: number) => z.string().trim().min(1).max(max);
const url = z.url({ protocol: /^https?$/ }).max(2048);

function uniqueKeys<T extends z.ZodType<{ key: string }>>(schema: T) {
  return z.array(schema).superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.key)) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate key',
          path: [index, 'key'],
        });
      }
      seen.add(item.key);
    });
  });
}

const experience = z
  .strictObject({
    key,
    company: text(200),
    position: text(200),
    startDate: yearMonthSchema,
    endDate: yearMonthSchema.nullable(),
    achievements: z.array(text(2000)),
  })
  .refine((item) => item.endDate === null || item.endDate >= item.startDate, {
    message: 'End date must not precede start date',
    path: ['endDate'],
  });

export const profileDocumentSchema = z.strictObject({
  name: text(120),
  description: text(5000),
  links: uniqueKeys(z.strictObject({ key, label: text(120), url })),
  skills: uniqueKeys(z.strictObject({ key, name: text(120) })),
  experience: uniqueKeys(experience),
  projects: uniqueKeys(z.strictObject({ key, name: text(120), url })),
});

export type ProfileDocument = z.infer<typeof profileDocumentSchema>;
