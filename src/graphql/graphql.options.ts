import { Logger } from '@nestjs/common';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { ApolloServerErrorCode } from '@apollo/server/errors';

// Protocol errors are part of the client/server exchange, including APQ retries.
const clientErrorCodes = new Set<string>([
  ApolloServerErrorCode.GRAPHQL_PARSE_FAILED,
  ApolloServerErrorCode.GRAPHQL_VALIDATION_FAILED,
  ApolloServerErrorCode.BAD_USER_INPUT,
  ApolloServerErrorCode.BAD_REQUEST,
  ApolloServerErrorCode.OPERATION_RESOLUTION_FAILURE,
  ApolloServerErrorCode.PERSISTED_QUERY_NOT_FOUND,
  ApolloServerErrorCode.PERSISTED_QUERY_NOT_SUPPORTED,
]);

const example = `query DeveloperProfile {
  profile {
    name
    description
    links { label url }
    skills { name }
    experience { company position startDate endDate achievements }
    projects { name url }
  }
}`;

const logger = new Logger('GraphQL');

export function graphqlOptions(
  sandboxEnabled: boolean,
): Omit<ApolloDriverConfig, 'driver'> {
  return {
    path: '/graphql',
    autoSchemaFile: true,
    sortSchema: true,
    graphiql: false,
    introspection: sandboxEnabled,
    // Includes repeated fields and expanded fragments; leaves room for Sandbox introspection.
    maxRecursiveSelections: 300,
    allowBatchedHttpRequests: false,
    includeStacktraceInErrorResponses: false,
    plugins: [
      sandboxEnabled
        ? ApolloServerPluginLandingPageLocalDefault({
            embed: { runTelemetry: false, endpointIsEditable: false },
            document: example,
          })
        : ApolloServerPluginLandingPageDisabled(),
    ],
    formatError(formattedError) {
      const code = formattedError.extensions?.code;
      if (typeof code === 'string' && clientErrorCodes.has(code)) {
        return formattedError;
      }
      logger.error(
        'GraphQL execution failed; internal error details withheld.',
      );
      return {
        message: 'Internal server error',
        locations: formattedError.locations,
        path: formattedError.path,
        extensions: { code: 'INTERNAL_SERVER_ERROR' },
      };
    },
  };
}
