import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Isolate both the Compose project and its database volume from the developer's data.
const project = `profile-smoke-${randomUUID().slice(0, 8)}`;
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close((error) => (error ? reject(error) : resolve(port)));
  });
});
const env = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('COMPOSE_')),
  ),
  PORT: String(port),
  SANDBOX_ENABLED: 'true',
  GRAPHQL_RATE_LIMIT: '120',
};
// A local .env must never redirect this disposable smoke test to another database.
env.COMPOSE_DATABASE_URL = 'postgresql://profile:profile_local@db:5432/profile';
const base = `http://127.0.0.1:${port}`;
const directory = await mkdtemp(join(tmpdir(), 'profile-smoke-'));
const emptyEnvFile = join(directory, 'compose.env');
const dataFile = join(directory, 'profile.json');
const composeFile = fileURLToPath(new URL('../compose.yaml', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
let started = false;

function compose(...args) {
  return new Promise((resolve, reject) => {
    const capture = args[0] === 'config';
    const child = spawn(
      'docker',
      [
        'compose',
        '--file',
        composeFile,
        '--env-file',
        emptyEnvFile,
        '-p',
        project,
        ...args,
      ],
      {
        cwd: root,
        env,
        stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'],
      },
    );
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`Compose exited with ${code}`)),
    );
  });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return;
    } catch {
      /* The server is still starting. */
    }
    await setTimeout(1000);
  }
  throw new Error('The API did not become healthy.');
}

async function profile() {
  const response = await fetch(`${base}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query:
        '{ profile { id name description links { id label url } skills { id name } experience { id company position startDate endDate achievements } projects { id name url } } }',
    }),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.errors, undefined);
  assert.ok(body.data.profile.name);
  return body.data.profile;
}

function assertProfileContent(profile, document) {
  // IDs are checked separately for stability; the document defines public content and order.
  const actual = structuredClone(profile);
  delete actual.id;
  for (const field of ['links', 'skills', 'experience', 'projects']) {
    for (const item of actual[field]) delete item.id;
  }
  assert.deepEqual(actual, {
    name: document.name.trim(),
    description: document.description.trim(),
    links: document.links.map(({ label, url }) => ({
      label: label.trim(),
      url: url.trim(),
    })),
    skills: document.skills.map(({ name }) => ({ name: name.trim() })),
    experience: document.experience.map(
      ({ company, position, startDate, endDate, achievements }) => ({
        company: company.trim(),
        position: position.trim(),
        startDate,
        endDate,
        achievements: achievements.map((text) => text.trim()),
      }),
    ),
    projects: document.projects.map(({ name, url }) => ({
      name: name.trim(),
      url: url.trim(),
    })),
  });
}

async function importDocument(document) {
  await writeFile(dataFile, JSON.stringify(document));
  await compose(
    'run',
    '--rm',
    '--volume',
    `${dataFile}:/app/data/profile.json:ro`,
    'init',
    'npm',
    'run',
    'data:import',
  );
  const imported = await profile();
  assertProfileContent(imported, document);
  return imported;
}

async function checkBrowser() {
  if (!process.argv.includes('--browser')) return;
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['node_modules/@playwright/test/cli.js', 'test'],
      {
        cwd: root,
        env: { ...process.env, PLAYWRIGHT_BASE_URL: base },
        stdio: 'inherit',
      },
    );
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Browser test exited with ${code}`)),
    );
  });
}

async function main() {
  await writeFile(emptyEnvFile, '');
  const configuration = JSON.parse(await compose('config', '--format', 'json'));
  const volume = configuration.volumes?.['postgres-data'];
  assert.equal(
    volume?.name,
    `${project}_postgres-data`,
    'Smoke must use its own database volume.',
  );
  assert.ok(
    !volume.external,
    'Smoke must not use an external database volume.',
  );
  assert.deepEqual(
    configuration.services.db.volumes.map(({ type, source, target }) => ({
      type,
      source,
      target,
    })),
    [
      {
        type: 'volume',
        source: 'postgres-data',
        target: '/var/lib/postgresql',
      },
    ],
  );
  for (const service of ['init', 'api']) {
    assert.equal(
      configuration.services[service].environment.DATABASE_URL,
      env.COMPOSE_DATABASE_URL,
    );
  }
  if (process.argv.includes('--check-config')) {
    console.info(JSON.stringify(configuration));
    return;
  }
  started = true;
  await compose('up', '--build', '-d');
  await waitForHealth();
  const document = JSON.parse(
    await readFile(new URL('../data/profile.json', import.meta.url), 'utf8'),
  );
  const initial = await profile();
  assertProfileContent(initial, document);
  const sandbox = await fetch(`${base}/graphql`, {
    headers: { Accept: 'text/html' },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(sandbox.status, 200);
  assert.match(await sandbox.text(), /embeddable-sandbox/);

  await checkBrowser();

  // Import scenarios must not depend on the owner's lists being populated.
  const fixture = {
    name: 'Smoke developer',
    description: 'Initial smoke profile.',
    links: [{ key: 'code', label: 'Code', url: 'https://example.com/code' }],
    skills: [
      { key: 'retained', name: 'Retained skill' },
      { key: 'removed', name: 'Removed skill' },
    ],
    experience: [
      {
        key: 'current',
        company: 'Smoke company',
        position: 'Developer',
        startDate: '2022-09',
        endDate: null,
        achievements: ['Initial achievement.'],
      },
    ],
    projects: [
      { key: 'api', name: 'Smoke API', url: 'https://example.com/api' },
    ],
  };
  const baseline = await importDocument(fixture);
  assert.equal(baseline.id, initial.id);
  const changed = {
    ...fixture,
    name: 'Smoke imported developer',
    description: 'Updated smoke profile.',
    links: [],
    skills: [
      { key: 'smoke-new-skill', name: 'Smoke added skill' },
      { ...fixture.skills[0], name: 'Smoke edited skill' },
    ],
  };
  const imported = await importDocument(changed);
  assert.equal(imported.id, baseline.id);
  assert.equal(imported.skills[1].id, baseline.skills[0].id);
  assert.ok(!baseline.skills.some(({ id }) => id === imported.skills[0].id));
  assert.deepEqual(imported.experience, baseline.experience);
  assert.deepEqual(imported.projects, baseline.projects);

  // A broken seed must not prevent bootstrap after initialization.
  await writeFile(dataFile, '{ invalid json');
  await compose(
    'run',
    '--rm',
    '--volume',
    `${dataFile}:/app/data/profile.json:ro`,
    'init',
    'npm',
    'run',
    'data:bootstrap',
  );

  // The image still contains the original seed; startup must preserve imported values and IDs.
  await compose('down');
  await compose('up', '-d');
  await waitForHealth();
  assert.deepEqual(await profile(), imported);

  const empty = await importDocument({
    ...changed,
    links: [],
    skills: [],
    experience: [],
    projects: [],
  });
  assert.equal(empty.id, imported.id);
  await checkBrowser();
  console.info(
    'Compose smoke test passed: complete seed data, import, preserved edits/IDs and empty lists.',
  );
}

try {
  await main();
} catch (error) {
  if (started) await compose('logs', '--no-color').catch(() => {});
  throw error;
} finally {
  try {
    if (started)
      await compose('down', '--volumes', '--remove-orphans', '--rmi', 'local');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
