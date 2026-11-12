import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment.js';
import {
  createPrismaClient,
  type DatabaseClient,
} from './create-prisma-client.js';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: DatabaseClient;

  constructor(configService: ConfigService<Environment, true>) {
    this.client = createPrismaClient(
      configService.get('DATABASE_URL', { infer: true }),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
