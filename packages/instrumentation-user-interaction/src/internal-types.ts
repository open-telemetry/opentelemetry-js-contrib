/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="zone.js" />
import { HrTime } from '@opentelemetry/api';
import { EventName } from './types';

/**
 * Async Zone task
 */
export type AsyncTask = Task & {
  eventName: EventName;
  target: EventTarget;
  // Allows access to the private `_zone` property of a Zone.js Task.
  _zone: Zone;
};

/**
 *  Type for patching Zone RunTask function
 */
export type RunTaskFunction = (
  task: AsyncTask,
  applyThis?: any,
  applyArgs?: any
) => Zone;

/**
 * interface to store information in weak map per span
 */
export interface SpanData {
  hrTimeLastTimeout?: HrTime;
  taskCount: number;
}

/**
 * interface to be able to check Zone presence on window
 */
export interface WindowWithZone {
  Zone: ZoneTypeWithPrototype;
}

/**
 * interface to be able to use prototype in Zone
 */
interface ZonePrototype {
  prototype: any;
}

/**
 * type to be  able to use prototype on Zone
 */
export type ZoneTypeWithPrototype = ZonePrototype & Zone;
