/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface HostMetricsInstrumentationConfig extends InstrumentationConfig {
  metricGroups?: string[];
}

export interface CpuUsageData {
  cpuNumber: string;
  system: number;
  user: number;
  idle: number;
  nice: number;
  interrupt: number;
  systemP: number;
  userP: number;
  idleP: number;
  interruptP: number;
  niceP: number;
}

export interface ProcessCpuUsageData {
  system: number;
  user: number;
  systemP: number;
  userP: number;
}

export interface MemoryData {
  used: number;
  free: number;
  usedP: number;
  freeP: number;
}
