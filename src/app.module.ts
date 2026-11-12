import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { validateEnvironment, type Environment } from './config/environment.js';
import { graphqlOptions } from './graphql/graphql.options.js';
import { ProfileModule } from './profile/profile.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Environment, true>) =>
        graphqlOptions(configService.get('SANDBOX_ENABLED', { infer: true })),
    }),
    ProfileModule,
    HealthModule,
  ],
})
export class AppModule {}
