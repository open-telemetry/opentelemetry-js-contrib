/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A function that determines whether a baggage key-value pair should be added to new
 * log record as a log attribute.
 */
export type BaggageKeyPredicate = (baggageKey: string) => boolean;

/**
 * A {@link BaggageKeyPredicate} that includes all baggage keys.
 */
export const ALLOW_ALL_BAGGAGE_KEYS: BaggageKeyPredicate = (_: string) => true;
