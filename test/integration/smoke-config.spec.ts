import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it.each(['shell', 'dotenv'])(
  'isolates smoke configuration from %s settings and automatic overrides',
  async (source) => {
    const directory = await mkdtemp(join(tmpdir(), 'profile-compose-config-'));
    try {
      const script = join(directory, 'scripts', 'smoke.mjs');
      await mkdir(join(directory, 'scripts'));
      await copyFile(
        new URL('../../scripts/smoke.mjs', import.meta.url),
        script,
      );
      await copyFile(
        new URL('../../compose.yaml', import.meta.url),
        join(directory, 'compose.yaml'),
      );
      const foreignCompose = join(directory, 'foreign.yaml');
      // This models local settings pointing at an existing database. No volume is created.
      await writeFile(
        foreignCompose,
        `services:
  db:
    image: postgres:18.6-bookworm
    volumes: [postgres-data:/var/lib/postgresql]
volumes:
  postgres-data:
    external: true
    name: existing-user-database
`,
      );
      await writeFile(
        join(directory, 'compose.override.yaml'),
        `volumes:
  postgres-data:
    external: true
    name: existing-user-database
`,
      );
      const settings = {
        COMPOSE_FILE: foreignCompose,
        COMPOSE_PROJECT_NAME: 'existing-user-project',
        COMPOSE_ENV_FILES: join(directory, 'missing.env'),
        COMPOSE_DATABASE_URL: 'postgresql://other:other@outside:5432/other',
      };
      await writeFile(
        join(directory, '.env'),
        Object.entries(settings)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n') + '\nUNUSED_VALUE="unterminated\n',
      );
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => !key.startsWith('COMPOSE_'),
        ),
      );
      if (source === 'shell') Object.assign(env, settings);
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [script, '--check-config'],
        { cwd: directory, env },
      );
      const configuration: unknown = JSON.parse(stdout);
      expect(configuration).toMatchObject({
        name: expect.stringMatching(/^profile-smoke-[a-f0-9]{8}$/) as unknown,
        volumes: {
          'postgres-data': {
            name: expect.stringMatching(
              /^profile-smoke-[a-f0-9]{8}_postgres-data$/,
            ) as unknown,
          },
        },
        services: {
          db: {
            volumes: [
              {
                type: 'volume',
                source: 'postgres-data',
                target: '/var/lib/postgresql',
              },
            ],
          },
          init: {
            environment: {
              DATABASE_URL:
                'postgresql://profile:profile_local@db:5432/profile',
            },
          },
        },
      });
      expect(stdout).not.toContain('existing-user');
      expect(stdout).not.toContain('outside:5432');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
