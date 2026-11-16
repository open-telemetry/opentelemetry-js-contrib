/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// This mimics `APIPromise` from `openai` sufficiently for usage in this
// instrumentation. OpenAI's APIPromise adds methods such as `.withResponse()`,
// which we preserve by always returning the original `APIPromise` instance.
// We don't import the type directly from `openai` because its import path
// changed across major `openai` SDK versions.
export type APIPromise<T> = Promise<T>;
