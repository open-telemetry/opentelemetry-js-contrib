/**
 * Temporary addition to incomplete `SemanticResourceAttributes`
 * in the OpenTelemetry SDK.
 * 
 * See https://github.com/open-telemetry/opentelemetry-js/issues/4483
 */
export const SemanticResourceAttributes = {
    /**
     * Cloud provider-specific native identifier of the monitored cloud resource
     * (e.g. an ARN on AWS, a fully qualified resource ID on Azure, a full resource
     * name on GCP)
     */
    CLOUD_RESOURCE_ID: 'cloud.resource_id',
}