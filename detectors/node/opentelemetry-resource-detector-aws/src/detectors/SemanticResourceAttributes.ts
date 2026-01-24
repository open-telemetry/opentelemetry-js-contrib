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
export const SemanticResourceAttributes = {
  /**
   * Cloud provider-specific native identifier of the monitored cloud resource
   * (e.g. an ARN on AWS, a fully qualified resource ID on Azure, a full resource
   * name on GCP)
   */
  CLOUD_RESOURCE_ID: 'cloud.resource_id',
};
