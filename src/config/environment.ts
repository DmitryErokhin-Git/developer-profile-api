import { z } from 'zod';

const environmentSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  GRAPHQL_RATE_LIMIT: z.coerce.number().int().min(1).max(10000).default(120),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  SANDBOX_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  input: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    // Report field names, never connection strings or other configuration values.
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }
  return result.data;
}
