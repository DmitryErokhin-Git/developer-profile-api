import 'reflect-metadata';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Server } from 'node:http';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getIntrospectionQuery } from 'graphql';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bootstrapProfile,
  importProfile,
} from '../../src/data/profile-data.js';
import {
  createPrismaClient,
  type DatabaseClient,
} from '../../src/database/create-prisma-client.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { configureApplication } from '../../src/configure-application.js';
import { validateEnvironment } from '../../src/config/environment.js';
import { profileFixture } from '../fixtures/profile.js';

const fullQuery = `query {
  profile {
    id name description
    links { id label url }
    skills { id name }
    experience { id company position startDate endDate achievements }
    projects { id name url }
  }
}`;

describe('profile application with PostgreSQL', () => {
  let container: StartedPostgreSqlContainer;
  let prismaClient: DatabaseClient;
  let app: INestApplication;
  let server: Server;
  const queries: string[] = [];

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.6-bookworm').start();
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_ENABLED = 'true';
    await promisify(execFile)(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      {
        env: process.env,
      },
    );
    prismaClient = createPrismaClient(container.getConnectionUri());
    await prismaClient.$connect();

    // Load after the container provides DATABASE_URL: ConfigModule validates on import.
    const { AppModule } = await import('../../src/app.module.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.init();
    server = app.getHttpServer() as Server;
    app.get(PrismaService).client.$on('query', (event) => {
      if (/^SELECT\b/i.test(event.query)) queries.push(event.query);
    });
  });

  beforeEach(async () => {
    await prismaClient.profile.deleteMany();
    await prismaClient.bootstrapState.deleteMany();
    queries.length = 0;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prismaClient) await prismaClient.$disconnect();
    if (container) await container.stop();
  });

  const graphql = (query = fullQuery) =>
    request(server).post('/graphql').send({ query });

  async function snapshot() {
    return prismaClient.profile.findUnique({
      where: { key: 'owner' },
      include: {
        links: { orderBy: { sortOrder: 'asc' } },
        skills: { orderBy: { sortOrder: 'asc' } },
        experience: { orderBy: { sortOrder: 'asc' } },
        projects: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  it('serves the profile query and loads only requested relationships', async () => {
    await bootstrapProfile(prismaClient, profileFixture);
    const response = await graphql(
      '{ profile { name description skills { name } experience { company position } projects { name } } }',
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        profile: {
          name: 'Test Developer',
          description: 'A public developer profile.',
          skills: [{ name: 'TypeScript' }, { name: 'PostgreSQL' }],
          experience: [
            { company: 'Project work', position: 'Developer' },
            { company: 'Previous company', position: 'Engineer' },
          ],
          projects: [{ name: 'Profile API' }, { name: 'Previous project' }],
        },
      },
    });
    expect(queries).toHaveLength(4);
    expect(queries.some((query) => query.includes('ProfessionalLink'))).toBe(
      false,
    );
  });

  it('uses one query for scalar fields and five for all lists, regardless of list sizes', async () => {
    const input = profileFixture();
    await bootstrapProfile(prismaClient, () => input);
    expect((await graphql('{ profile { name } }')).body).toEqual({
      data: { profile: { name: input.name } },
    });
    expect(queries).toHaveLength(1);
    queries.length = 0;
    expect((await graphql()).body).not.toHaveProperty('errors');
    expect(queries).toHaveLength(5);

    for (let i = 0; i < 40; i++) {
      input.links.push({
        key: `link-${i}`,
        label: `Link ${i}`,
        url: 'https://example.com',
      });
      input.skills.push({ key: `skill-${i}`, name: `Skill ${i}` });
      input.experience.push({
        ...input.experience[0]!,
        key: `work-${i}`,
        company: `Company ${i}`,
        position: `Position ${i}`,
        achievements: [`Achievement ${i}`],
      });
      input.projects.push({
        key: `project-${i}`,
        name: `Project ${i}`,
        url: 'https://example.com',
      });
    }
    await importProfile(prismaClient, input);
    queries.length = 0;
    const response = await graphql();
    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('errors');
    expect(response.body).toMatchObject({
      data: {
        profile: {
          name: input.name,
          description: input.description,
          links: input.links.map(({ label, url }) => ({ label, url })),
          skills: input.skills.map(({ name }) => ({ name })),
          experience: input.experience.map(
            ({ company, position, startDate, endDate, achievements }) => ({
              company,
              position,
              startDate,
              endDate,
              achievements,
            }),
          ),
          projects: input.projects.map(({ name, url }) => ({ name, url })),
        },
      },
    });
    expect(queries).toHaveLength(5);
  });

  it('returns ordered lists, month dates, achievements and null for current work', async () => {
    await bootstrapProfile(prismaClient, profileFixture);
    const response = await graphql();
    expect(response.body).toMatchObject({
      data: {
        profile: {
          id: expect.any(String) as unknown,
          links: [
            { label: 'GitHub', url: 'https://github.com/example' },
            { label: 'Website' },
          ],
          skills: [{ name: 'TypeScript' }, { name: 'PostgreSQL' }],
          experience: [
            {
              startDate: '2022-09',
              endDate: null,
              achievements: ['Built an API.'],
            },
            { startDate: '2018-07', endDate: '2022-12', achievements: [] },
          ],
          projects: [{ name: 'Profile API' }, { name: 'Previous project' }],
        },
      },
    });
    const stored = await prismaClient.experience.findFirstOrThrow({
      where: { key: 'current' },
    });
    expect(stored.startDate.toISOString()).toBe('2022-09-01T00:00:00.000Z');
  });

  it('returns null when there is no owner, and empty lists when there are no children', async () => {
    expect((await graphql()).body).toEqual({ data: { profile: null } });
    await bootstrapProfile(prismaClient, () => ({
      ...profileFixture(),
      links: [],
      skills: [],
      experience: [],
      projects: [],
    }));
    expect((await graphql()).body).toMatchObject({
      data: {
        profile: { links: [], skills: [], experience: [], projects: [] },
      },
    });
  });

  it('bootstraps once and preserves edited and deleted data on subsequent starts', async () => {
    expect(await bootstrapProfile(prismaClient, profileFixture)).toBe(
      'created',
    );
    await prismaClient.profile.update({
      where: { key: 'owner' },
      data: { name: 'Edited in database' },
    });
    await prismaClient.skill.deleteMany();
    const before = await snapshot();
    expect(await bootstrapProfile(prismaClient, profileFixture)).toBe(
      'skipped',
    );
    expect(await snapshot()).toEqual(before);
    await prismaClient.profile.deleteMany();
    expect(await bootstrapProfile(prismaClient, profileFixture)).toBe(
      'skipped',
    );
    expect(await prismaClient.profile.count()).toBe(0);
    expect(await prismaClient.bootstrapState.count()).toBe(1);
  });

  it('preserves an existing owner without a bootstrap marker', async () => {
    await prismaClient.profile.create({
      data: { key: 'owner', name: 'Existing', description: 'Preserve me' },
    });
    const before = await snapshot();
    expect(await bootstrapProfile(prismaClient, profileFixture)).toBe(
      'preserved',
    );
    expect(await snapshot()).toEqual(before);
    expect(await prismaClient.bootstrapState.count()).toBe(1);
  });

  it('only loads seed data when initialization actually needs it', async () => {
    const unavailableData = () => {
      throw new Error('The seed file is unavailable');
    };
    await expect(
      bootstrapProfile(prismaClient, unavailableData),
    ).rejects.toThrow();
    expect(await prismaClient.bootstrapState.count()).toBe(0);
    await expect(
      bootstrapProfile(prismaClient, () => ({ name: '' })),
    ).rejects.toThrow();
    expect(await prismaClient.profile.count()).toBe(0);

    await prismaClient.profile.create({
      data: { key: 'owner', name: 'Existing', description: 'Preserve me' },
    });
    expect(await bootstrapProfile(prismaClient, unavailableData)).toBe(
      'preserved',
    );
    expect(await bootstrapProfile(prismaClient, unavailableData)).toBe(
      'skipped',
    );
    await prismaClient.profile.deleteMany();
    expect(await bootstrapProfile(prismaClient, unavailableData)).toBe(
      'skipped',
    );
    expect(await prismaClient.profile.count()).toBe(0);
  });

  it('CLI bootstrap skips missing or invalid files after initialization, while import rejects them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'profile-data-test-'));
    const execute = promisify(execFile);
    const run = (command: string, path: string) =>
      execute(
        process.execPath,
        ['--import', 'tsx', `scripts/${command}-data.ts`, path],
        {
          env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
        },
      );
    try {
      const missing = join(directory, 'missing.json');
      const broken = join(directory, 'broken.json');
      const invalid = join(directory, 'invalid.json');
      await writeFile(broken, '{ invalid json');
      await writeFile(invalid, JSON.stringify({ name: '' }));
      await expect(run('bootstrap', missing)).rejects.toThrow();
      expect(await prismaClient.bootstrapState.count()).toBe(0);
      await bootstrapProfile(prismaClient, profileFixture);
      const before = await snapshot();
      for (const path of [missing, broken, invalid]) {
        expect((await run('bootstrap', path)).stdout).toContain('skipped');
        await expect(run('import', path)).rejects.toThrow();
        expect(await snapshot()).toEqual(before);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('imports additions, edits, removals and ordering while preserving matching IDs', async () => {
    const input = profileFixture();
    await bootstrapProfile(prismaClient, () => input);
    const before = (await snapshot())!;
    input.name = 'Updated developer';
    input.links = [
      { key: 'new', label: 'New link', url: 'https://example.com/new' },
      { ...input.links[0]!, label: 'Code' },
    ];
    input.skills = [
      { key: 'new', name: 'New skill' },
      { ...input.skills[0]!, name: 'TypeScript 6' },
    ];
    input.experience = [
      { ...input.experience[0]!, key: 'new' },
      { ...input.experience[0]!, position: 'Senior developer' },
    ];
    input.projects = [
      { key: 'new', name: 'New project', url: 'https://example.com/new' },
      { ...input.projects[0]!, name: 'Updated API' },
    ];
    await importProfile(prismaClient, input);
    const after = (await snapshot())!;
    expect(after.id).toBe(before.id);
    expect(after.name).toBe(input.name);
    for (const field of [
      'links',
      'skills',
      'experience',
      'projects',
    ] as const) {
      expect(after[field]).toHaveLength(2);
      expect(after[field][0]!.key).toBe('new');
      expect(after[field][1]!.id).toBe(before[field][0]!.id);
      expect(after[field][0]!.id).not.toBe(before[field][1]!.id);
    }
    expect(after.links[1]!.label).toBe('Code');
    expect(after.skills[1]!.name).toBe('TypeScript 6');
    expect(after.experience[1]!.position).toBe('Senior developer');
    expect(after.projects[1]!.name).toBe('Updated API');
    await importProfile(prismaClient, input);
    expect(await snapshot()).toEqual(after);

    await importProfile(prismaClient, {
      ...input,
      links: [],
      skills: [],
      experience: [],
      projects: [],
    });
    expect(await snapshot()).toMatchObject({
      id: before.id,
      links: [],
      skills: [],
      experience: [],
      projects: [],
    });
  });

  it('rejects invalid input before changing any database records', async () => {
    await bootstrapProfile(prismaClient, profileFixture);
    const before = await snapshot();
    await expect(
      importProfile(prismaClient, { ...profileFixture(), name: '' }),
    ).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back earlier writes and the bootstrap marker when a database write fails', async () => {
    // A real PostgreSQL constraint fails late, after the profile and other lists were written.
    await prismaClient.$executeRawUnsafe(
      `ALTER TABLE "Project" ADD CONSTRAINT "test_reject_project" CHECK ("name" <> 'Reject this project')`,
    );
    try {
      const input = profileFixture();
      input.projects[0]!.name = 'Reject this project';
      await expect(
        bootstrapProfile(prismaClient, () => input),
      ).rejects.toThrow();
      expect(await prismaClient.profile.count()).toBe(0);
      expect(await prismaClient.bootstrapState.count()).toBe(0);

      await bootstrapProfile(prismaClient, profileFixture);
      const before = await snapshot();
      input.name = 'This edit must roll back';
      input.skills = [];
      await expect(importProfile(prismaClient, input)).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    } finally {
      await prismaClient.$executeRawUnsafe(
        'ALTER TABLE "Project" DROP CONSTRAINT "test_reject_project"',
      );
    }
  });

  it('serves Sandbox, allows introspection, rejects mutations and checks health', async () => {
    const html = await request(server)
      .get('/graphql')
      .set('Accept', 'text/html');
    expect(html.status).toBe(200);
    expect(html.text).toContain('embeddable-sandbox');
    expect(html.text).toContain('DeveloperProfile');
    expect(html.headers['content-security-policy']).toContain(
      'https://sandbox.embed.apollographql.com',
    );
    expect(
      (
        await graphql(
          '{ __schema { queryType { name } mutationType { name } } }',
        )
      ).body,
    ).toEqual({
      data: { __schema: { queryType: { name: 'Query' }, mutationType: null } },
    });
    expect((await request(server).get('/health')).body).toEqual({
      status: 'ok',
    });
  });

  it('returns safe GraphQL errors when database tables are unavailable', async () => {
    await prismaClient.$executeRawUnsafe(
      'ALTER TABLE "Profile" RENAME TO "UnavailableProfile"',
    );
    try {
      const response = await graphql();
      expect(response.body).toMatchObject({
        data: { profile: null },
        errors: [
          {
            message: 'Internal server error',
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          },
        ],
      });
      expect(JSON.stringify(response.body)).not.toMatch(
        /Prisma|SELECT|DATABASE_URL|stacktrace|password/i,
      );
    } finally {
      await prismaClient.$executeRawUnsafe(
        'ALTER TABLE "UnavailableProfile" RENAME TO "Profile"',
      );
    }
  });

  it('rejects excessive selections, including aliases and fragments, before querying PostgreSQL', async () => {
    const aliases = Array.from(
      { length: 151 },
      (_, i) => `s${i}: skills { name }`,
    ).join(' ');
    const fragments = Array.from({ length: 101 }, (_, i) => `...F${i}`).join(
      ' ',
    );
    const definitions = Array.from(
      { length: 101 },
      (_, i) => `fragment F${i} on Profile { s${i}: skills { name } }`,
    ).join('\n');
    for (const query of [
      `{ profile { ${aliases} } }`,
      `{ profile { ${fragments} } } ${definitions}`,
    ]) {
      const response = await graphql(query);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        errors: [{ extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }],
      });
      expect(queries).toHaveLength(0);
    }
    const introspection = await graphql(getIntrospectionQuery());
    expect(introspection.status).toBe(200);
    expect(introspection.body).not.toHaveProperty('errors');
    const batch = await request(server)
      .post('/graphql')
      .send([
        { query: '{ profile { name } }' },
        { query: '{ profile { name } }' },
      ]);
    expect(batch.status).toBe(400);
    expect(queries).toHaveLength(0);
  });

  it('limits requests per client without blocking health checks or CORS preflight', async () => {
    const { AppModule } = await import('../../src/app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService(
          validateEnvironment({
            DATABASE_URL: container.getConnectionUri(),
            GRAPHQL_RATE_LIMIT: '3',
          }),
        ),
      )
      .compile();
    const limitedApp = module.createNestApplication({ logger: false });
    configureApplication(limitedApp);
    await limitedApp.init();
    const limitedServer = limitedApp.getHttpServer() as Server;
    try {
      for (let i = 0; i < 3; i++) {
        await request(limitedServer)
          .post('/graphql')
          .send({ query: '{ profile { name } }' })
          .expect(200);
      }
      const blocked = await request(limitedServer)
        .post('/graphql')
        .send({ query: '{ profile { name } }' });
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
      expect(blocked.body).toMatchObject({
        errors: [{ extensions: { code: 'TOO_MANY_REQUESTS' } }],
      });
      await request(limitedServer).get('/graphql').expect(429);
      await request(limitedServer)
        .options('/graphql')
        .set('Origin', 'https://sandbox.embed.apollographql.com')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);
      await request(limitedServer).get('/health').expect(200);
    } finally {
      await limitedApp.close();
    }
  });

  it('cancels slow SQL and can use the pool afterwards', async () => {
    await expect(
      prismaClient.$executeRaw`SELECT pg_sleep(10)`,
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '57014' } } },
    });
    // Observe PostgreSQL from another connection, not just the client-side rejection.
    const running = await app.get(PrismaService).client.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT count(*) FROM pg_stat_activity
      WHERE pid <> pg_backend_pid() AND state = 'active' AND query = 'SELECT pg_sleep(10)'
    `;
    expect(running[0]?.count).toBe(0n);
    expect(await prismaClient.$queryRaw`SELECT 1 AS value`).toEqual([
      { value: 1 },
    ]);
  });

  it('preserves the APQ handshake and executes registered queries by hash', async () => {
    await bootstrapProfile(prismaClient, profileFixture);
    const query = `query PersistedProfile { profile { name } } # ${randomUUID()}`;
    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: createHash('sha256').update(query).digest('hex'),
      },
    };
    const missing = await request(server)
      .post('/graphql')
      .send({ extensions })
      .expect(200);
    expect(missing.body).toMatchObject({
      errors: [{ extensions: { code: 'PERSISTED_QUERY_NOT_FOUND' } }],
    });
    expect(queries).toHaveLength(0);
    for (const body of [{ query, extensions }, { extensions }]) {
      const response = await request(server)
        .post('/graphql')
        .send(body)
        .expect(200);
      expect(response.body).toEqual({
        data: { profile: { name: 'Test Developer' } },
      });
    }
    expect(queries).toHaveLength(2);
  });

  it('preserves client error codes for unresolved operations and unsupported batching', async () => {
    const wrongName = await request(server)
      .post('/graphql')
      .send({
        query: 'query Profile { profile { name } }',
        operationName: 'Missing',
      })
      .expect(400);
    expect(wrongName.body).toMatchObject({
      errors: [{ extensions: { code: 'OPERATION_RESOLUTION_FAILURE' } }],
    });
    const batch = await request(server)
      .post('/graphql')
      .send([{ query: '{ profile { name } }' }])
      .expect(400);
    expect(batch.body).toMatchObject({
      errors: [{ extensions: { code: 'BAD_REQUEST' } }],
    });
    expect(queries).toHaveLength(0);
  });

  it('bounds requests on stalled connections and recovers after PostgreSQL resumes', async () => {
    await bootstrapProfile(prismaClient, profileFixture);
    const health = () =>
      request(server).get('/health').timeout({ deadline: 6500 });
    // Warm the pool before pausing: connecting and reading have different timeouts.
    await Promise.all(Array.from({ length: 10 }, () => health().expect(200)));
    const execute = promisify(execFile);
    await execute('docker', ['pause', container.getId()]);
    try {
      const responses = await Promise.all(
        Array.from({ length: 12 }, () => health()),
      );
      for (const response of responses) {
        expect(response.status).toBe(503);
        expect(response.body).toEqual({ status: 'error' });
      }
    } finally {
      await execute('docker', ['unpause', container.getId()]);
    }
    await Promise.all(Array.from({ length: 12 }, () => health().expect(200)));
    expect((await graphql()).body).not.toHaveProperty('errors');
  });
});
