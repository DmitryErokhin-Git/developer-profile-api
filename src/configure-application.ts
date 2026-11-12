import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { Environment } from './config/environment.js';

export function configureApplication(app: INestApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://embeddable-sandbox.cdn.apollographql.com',
          ],
          imgSrc: [
            "'self'",
            'data:',
            'https://apollo-server-landing-page.cdn.apollographql.com',
          ],
          manifestSrc: [
            "'self'",
            'https://apollo-server-landing-page.cdn.apollographql.com',
          ],
          frameSrc: ["'self'", 'https://sandbox.embed.apollographql.com'],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.enableCors({
    origin: [
      'https://sandbox.embed.apollographql.com',
      'https://studio.apollographql.com',
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
  });
  const configService = app.get(ConfigService<Environment, true>);
  app.use(
    '/graphql',
    rateLimit({
      windowMs: 60_000,
      limit: configService.get('GRAPHQL_RATE_LIMIT', { infer: true }),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (req) => req.method === 'OPTIONS',
      message: {
        errors: [
          {
            message: 'Too many requests. Try again later.',
            extensions: { code: 'TOO_MANY_REQUESTS' },
          },
        ],
      },
    }),
  );
  app.enableShutdownHooks();
}
