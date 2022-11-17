import { createContextKey, Context } from '@opentelemetry/api';

const SUPPRESS_TYPEORM_INTERNAL_TRACING_KEY = createContextKey(
    'instrumentation-typeorm Context Key SUPPRESS_TYPEORM_INTERNAL_TRACING'
);

export const suppressTypeormInternalTracing = (context: Context) =>
    context.setValue(SUPPRESS_TYPEORM_INTERNAL_TRACING_KEY, true);

export const isTypeormInternalTracingSuppressed = (context: Context) =>
    context.getValue(SUPPRESS_TYPEORM_INTERNAL_TRACING_KEY) === true;
