import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { validateEnvironment } from '../src/config/environment.js';
import { createPrismaClient } from '../src/database/create-prisma-client.js';
import { bootstrapProfile, importProfile } from '../src/data/profile-data.js';

export async function runDataCommand(
  mode: 'bootstrap' | 'import',
): Promise<void> {
  const environment = validateEnvironment(process.env);
  const prismaClient = createPrismaClient(environment.DATABASE_URL);
  try {
    const path =
      process.argv[2] ??
      fileURLToPath(new URL('../data/profile.json', import.meta.url));
    const loadData = async (): Promise<unknown> =>
      JSON.parse(await readFile(path, 'utf8')) as unknown;
    if (mode === 'bootstrap') {
      console.info(
        `Profile bootstrap: ${await bootstrapProfile(prismaClient, loadData)}`,
      );
    } else {
      await importProfile(prismaClient, await loadData());
      console.info(
        'Profile import completed. Database matches the supplied data file.',
      );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(
        'Invalid profile data:',
        error.issues.map(({ path, message }) => ({ path, message })),
      );
    } else {
      console.error(
        `Profile ${mode} failed. Check the data file and database availability.`,
      );
    }
    process.exitCode = 1;
  } finally {
    await prismaClient.$disconnect();
  }
}
