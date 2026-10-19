/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * This file contains a copy of stable semantic convention definitions
 * used by this package.
 *
 * As this package is bundled with @opentelemetry/instrumentation-winston, this
 * reduces install size by 1.2MB as of today (October 2026)
 */

/**
 * Identifies the class / type of event.
 *
 * @example browser.mouse.click
 * @example device.app.lifecycle
 *
 * @note This attribute **SHOULD** be used by non-OTLP exporters when destination does not support `EventName` or equivalent field. This attribute **MAY** be used by applications using existing logging libraries so that it can be used to set the `EventName` field by Collector or SDK components.
 */
export declare const ATTR_OTEL_EVENT_NAME: 'otel.event.name';
