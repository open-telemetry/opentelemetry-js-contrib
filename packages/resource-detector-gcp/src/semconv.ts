/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * The cloud account ID the resource is assigned to.
 *
 * @example 111111111111
 * @example opentelemetry
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_CLOUD_ACCOUNT_ID = 'cloud.account.id' as const;

/**
 * Cloud regions often have multiple, isolated locations known as zones to increase availability. Availability zone represents the zone where the resource is running.
 *
 * @example us-east-1c
 *
 * @note Availability zones are called "zones" on Alibaba Cloud and Google Cloud.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_CLOUD_AVAILABILITY_ZONE = 'cloud.availability_zone' as const;

/**
 * The cloud platform in use.
 *
 * @note The prefix of the service **SHOULD** match the one specified in `cloud.provider`.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_CLOUD_PLATFORM = 'cloud.platform' as const;

/**
 * Name of the cloud provider.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_CLOUD_PROVIDER = 'cloud.provider' as const;

/**
 * The geographical region within a cloud provider. When associated with a resource, this attribute specifies the region where the resource operates. When calling services or APIs deployed on a cloud, this attribute identifies the region where the called destination is deployed.
 *
 * @example us-central1
 * @example us-east-1
 *
 * @note Refer to your provider's docs to see the available regions, for example [Alibaba Cloud regions](https://www.alibabacloud.com/help/doc-detail/40654.htm), [AWS regions](https://aws.amazon.com/about-aws/global-infrastructure/regions_az/), [Azure regions](https://azure.microsoft.com/global-infrastructure/geographies/), [Google Cloud regions](https://cloud.google.com/about/locations), or [Tencent Cloud regions](https://www.tencentcloud.com/document/product/213/6091).
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_CLOUD_REGION = 'cloud.region' as const;

/**
 * The execution environment ID as a string, that will be potentially reused for other invocations to the same function/function version.
 *
 * @example 2021/06/28/[$LATEST]2f399eb14537447da05ab2a2e39309de
 *
 * @note - **AWS Lambda:** Use the (full) log stream name.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_FAAS_INSTANCE = 'faas.instance' as const;

/**
 * The name of the single function that this runtime instance executes.
 *
 * @example my-function
 * @example myazurefunctionapp/some-function-name
 *
 * @note This is the name of the function as configured/deployed on the FaaS
 * platform and is usually different from the name of the callback
 * function (which may be stored in the
 * [`code.namespace`/`code.function.name`](/docs/general/attributes.md#source-code-attributes)
 * span attributes).
 *
 * For some cloud providers, the above definition is ambiguous. The following
 * definition of function name **MUST** be used for this attribute
 * (and consequently the span name) for the listed cloud providers/products:
 *
 *   - **Azure:**  The full name `<FUNCAPP>/<FUNC>`, i.e., function app name
 *     followed by a forward slash followed by the function name (this form
 *     can also be seen in the resource JSON for the function).
 *     This means that a span attribute **MUST** be used, as an Azure function
 *     app can host multiple functions that would usually share
 *     a TracerProvider (see also the `cloud.resource_id` attribute).
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_FAAS_NAME = 'faas.name' as const;

/**
 * The immutable version of the function being executed.
 *
 * @example 26
 * @example pinkfroid-00002
 *
 * @note Depending on the cloud provider and platform, use:
 *
 *   - **AWS Lambda:** The [function version](https://docs.aws.amazon.com/lambda/latest/dg/configuration-versions.html)
 *     (an integer represented as a decimal string).
 *   - **Google Cloud Run (Services):** The [revision](https://cloud.google.com/run/docs/managing/revisions)
 *     (i.e., the function name plus the revision suffix).
 *   - **Google Cloud Functions:** The value of the
 *     [`K_REVISION` environment variable](https://cloud.google.com/functions/docs/env-var#runtime_environment_variables_set_automatically).
 *   - **Azure Functions:** Not applicable. Do not set this attribute.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_FAAS_VERSION = 'faas.version' as const;

/**
 * Unique host ID. For Cloud, this must be the instance_id assigned by the cloud provider. For non-containerized systems, this should be the `machine-id`. See the table below for the sources to use to determine the `machine-id` based on operating system.
 *
 * @example fdbf79e8af94cb7f9e8df36789187052
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_HOST_ID = 'host.id' as const;

/**
 * Name of the host. On Unix systems, it may contain what the hostname command returns, or the fully qualified hostname, or another name specified by the user.
 *
 * @example opentelemetry-test
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_HOST_NAME = 'host.name' as const;

/**
 * Type of host. For Cloud, this must be the machine type.
 *
 * @example n1-standard-1
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_HOST_TYPE = 'host.type' as const;

/**
 * The name of the cluster.
 *
 * @example opentelemetry-cluster
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_K8S_CLUSTER_NAME = 'k8s.cluster.name' as const;

/**
 * Enum value "gcp_app_engine" for attribute {@link ATTR_CLOUD_PLATFORM}.
 *
 * Google Cloud App Engine (GAE)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const CLOUD_PLATFORM_VALUE_GCP_APP_ENGINE = 'gcp_app_engine' as const;

/**
 * Enum value "gcp_cloud_functions" for attribute {@link ATTR_CLOUD_PLATFORM}.
 *
 * Google Cloud Functions (GCF)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const CLOUD_PLATFORM_VALUE_GCP_CLOUD_FUNCTIONS =
  'gcp_cloud_functions' as const;

/**
 * Enum value "gcp_cloud_run" for attribute {@link ATTR_CLOUD_PLATFORM}.
 *
 * Google Cloud Run
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const CLOUD_PLATFORM_VALUE_GCP_CLOUD_RUN = 'gcp_cloud_run' as const;

/**
 * Enum value "gcp_compute_engine" for attribute {@link ATTR_CLOUD_PLATFORM}.
 *
 * Google Cloud Compute Engine (GCE)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const CLOUD_PLATFORM_VALUE_GCP_COMPUTE_ENGINE =
  'gcp_compute_engine' as const;

/**
 * Enum value "gcp_kubernetes_engine" for attribute {@link ATTR_CLOUD_PLATFORM}.
 *
 * Google Cloud Kubernetes Engine (GKE)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const CLOUD_PLATFORM_VALUE_GCP_KUBERNETES_ENGINE =
  'gcp_kubernetes_engine' as const;

/**
 * Enum value "gcp" for attribute {@link ATTR_CLOUD_PROVIDER}.
 *
 * Google Cloud Platform
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const CLOUD_PROVIDER_VALUE_GCP = 'gcp' as const;
