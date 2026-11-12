import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function createPrismaClient(databaseUrl: string) {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 30000,
    // PostgreSQL cancels slow statements; the driver also bounds an unresponsive socket.
    // Pool.query discards the connection on a read timeout instead of reusing it.
    statement_timeout: 3000,
    query_timeout: 4000,
  });

  return new PrismaClient({
    adapter,
    log: [{ level: 'query', emit: 'event' }],
  });
}

export type DatabaseClient = ReturnType<typeof createPrismaClient>;
