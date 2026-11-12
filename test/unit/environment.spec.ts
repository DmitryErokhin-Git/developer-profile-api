import { describe, expect, it } from 'vitest';
import { validateEnvironment } from '../../src/config/environment.js';

describe('environment validation', () => {
  const DATABASE_URL = 'postgresql://user:password@localhost:5432/profile';

  it('provides local defaults and parses explicit values', () => {
    expect(validateEnvironment({ DATABASE_URL })).toMatchObject({
      PORT: 3000,
      SANDBOX_ENABLED: true,
      GRAPHQL_RATE_LIMIT: 120,
    });
    expect(
      validateEnvironment({
        DATABASE_URL,
        PORT: '4000',
        SANDBOX_ENABLED: 'false',
      }),
    ).toMatchObject({ PORT: 4000, SANDBOX_ENABLED: false });
  });

  it('reports invalid field names without revealing their contents', () => {
    expect(() =>
      validateEnvironment({ DATABASE_URL: 'secret-value', PORT: '-1' }),
    ).toThrow('Invalid environment configuration: DATABASE_URL, PORT');
  });

  it.each([
    { PORT: '0' },
    { PORT: '65536' },
    { GRAPHQL_RATE_LIMIT: '0' },
    { GRAPHQL_RATE_LIMIT: '1.5' },
    { GRAPHQL_RATE_LIMIT: 'unlimited' },
    { SANDBOX_ENABLED: 'yes' },
    { NODE_ENV: 'invalid' },
  ])('rejects invalid settings %j', (invalid) => {
    expect(() => validateEnvironment({ DATABASE_URL, ...invalid })).toThrow();
  });
});
