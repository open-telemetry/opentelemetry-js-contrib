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

import { InstrumentationHelperConfigInterface, PricingObject } from './types';

export default class InstrumentationHelperConfig {
  /**
   * A Singleton Configuration class for instrumentation helper config.
   *
   * This class maintains a single instance of configuration settings including
   * environment details, application name, and tracing information throughout the package.
   *
   * Attributes:
   *     environment (string): Deployment environment of the application.
   *     applicationName (string): Name of the application.
   *     pricing_json (Object): Pricing information.
   *     otlpEndpoint (string): Endpoint for OTLP.
   *     otlpHeaders (Object): Headers for OTLP.
   *     traceContent (boolean): Flag to enable or disable tracing of content.
   */

  static environment: string;
  static applicationName: string;
  static pricingInfo: Record<string, unknown> | string;
  static otlpEndpoint: string;
  static otlpHeaders?: Record<string, unknown> | string;
  static traceContent: boolean;
  static pricing_json?: PricingObject;

  static updateConfig({
    environment = 'production',
    applicationName = 'default',
    otlpEndpoint = '',
    otlpHeaders,
    traceContent = true,
    pricing_json,
  }: InstrumentationHelperConfigInterface) {
    /**
     * Updates the configuration based on provided parameters.
     *
     * Args:
     *     environment (string): Deployment environment.
     *     applicationName (string): Application name.
     *     otlpEndpoint (string): OTLP endpoint.
     *     otlpHeaders (Object): OTLP headers.
     *     traceContent (boolean): Enable or disable content tracing.
     *     pricing_json (string): path or url to the pricing json file
     */

    this.environment = environment;
    this.applicationName = applicationName;
    this.otlpEndpoint = otlpEndpoint;
    this.otlpHeaders = otlpHeaders;
    this.traceContent = traceContent;
    this.pricing_json = pricing_json;
  }
}
