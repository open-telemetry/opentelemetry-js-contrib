/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as dns from 'dns';

export type LookupFunction = ((
  hostname: string,
  family: number,
  callback: LookupSimpleCallback
) => void) &
  ((
    hostname: string,
    options: dns.LookupOneOptions,
    callback: LookupSimpleCallback
  ) => void) &
  ((
    hostname: string,
    options: dns.LookupAllOptions,
    callback: (
      err: NodeJS.ErrnoException | null,
      addresses: dns.LookupAddress[]
    ) => void
  ) => void) &
  ((
    hostname: string,
    options: dns.LookupOptions,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | dns.LookupAddress[],
      family: number
    ) => void
  ) => void) &
  ((hostname: string, callback: LookupSimpleCallback) => void);

export type LookupSimpleArgs = [number, LookupSimpleCallback];
export type LookupOneArgs = [dns.LookupOneOptions, LookupSimpleCallback];
export type LookupAllArgs = [
  dns.LookupAllOptions,
  (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void,
];
export type LookupArgs = [
  dns.LookupOptions,
  (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family: number
  ) => void,
];
export type LookupArgSignature = LookupSimpleArgs &
  LookupSimpleCallback &
  LookupOneArgs &
  LookupAllArgs &
  LookupArgs;

export type LookupFunctionSignature = (
  hostname: string,
  args: Array<LookupArgSignature>
) => void;
export type LookupPromiseSignature = (
  hostname: string,
  ...args: unknown[]
) => Promise<unknown>;
export type LookupSimpleCallback = (
  err: NodeJS.ErrnoException | null,
  address: string,
  family: number
) => void;

export type LookupCallbackSignature = LookupSimpleCallback &
  ((
    err: NodeJS.ErrnoException | null,
    addresses: dns.LookupAddress[]
  ) => void) &
  ((
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family: number
  ) => void);
