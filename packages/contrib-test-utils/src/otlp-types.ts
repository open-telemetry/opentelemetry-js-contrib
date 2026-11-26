/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export enum OtlpSpanKind {
  UNSPECIFIED = 0,
  INTERNAL = 1,
  SERVER = 2,
  CLIENT = 3,
  PRODUCER = 4,
  CONSUMER = 5,
}

/** Properties of a KeyValueList. */
interface IKeyValueList {
  /** KeyValueList values */
  values: IKeyValue[];
}

/** Properties of an ArrayValue. */
interface IArrayValue {
  /** ArrayValue values */
  values: IAnyValue[];
}

/** Properties of an AnyValue. */
interface IAnyValue {
  /** AnyValue stringValue */
  stringValue?: string | null;
  /** AnyValue boolValue */
  boolValue?: boolean | null;
  /** AnyValue intValue */
  intValue?: number | null;
  /** AnyValue doubleValue */
  doubleValue?: number | null;
  /** AnyValue arrayValue */
  arrayValue?: IArrayValue;
  /** AnyValue kvlistValue */
  kvlistValue?: IKeyValueList;
  /** AnyValue bytesValue */
  bytesValue?: Uint8Array;
}

/** Properties of a KeyValue. */
interface IKeyValue {
  /** KeyValue key */
  key: string;
  /** KeyValue value */
  value: IAnyValue;
}

/** Properties of an InstrumentationScope. */
export interface IInstrumentationScope {
  /** InstrumentationScope name */
  name: string;
  /** InstrumentationScope version */
  version?: string;
  /** InstrumentationScope attributes */
  attributes?: IKeyValue[];
  /** InstrumentationScope droppedAttributesCount */
  droppedAttributesCount?: number;
}

/** Properties of a Resource. */
export interface IResource {
  /** Resource attributes */
  attributes: IKeyValue[];
  /** Resource droppedAttributesCount */
  droppedAttributesCount: number;
}

interface LongBits {
  low: number;
  high: number;
}

type Fixed64 = LongBits | string | number;

/** Properties of an Event. */
interface IEvent {
  /** Event timeUnixNano */
  timeUnixNano: Fixed64;
  /** Event name */
  name: string;
  /** Event attributes */
  attributes: IKeyValue[];
  /** Event droppedAttributesCount */
  droppedAttributesCount: number;
}

/** Properties of a Link. */
interface ILink {
  /** Link traceId */
  traceId: string | Uint8Array;
  /** Link spanId */
  spanId: string | Uint8Array;
  /** Link traceState */
  traceState?: string;
  /** Link attributes */
  attributes: IKeyValue[];
  /** Link droppedAttributesCount */
  droppedAttributesCount: number;
}

/** Properties of a Status. */
interface IStatus {
  /** Status message */
  message?: string;
  /** Status code */
  code: EStatusCode;
}

/** StatusCode enum. */
const enum EStatusCode {
  /** The default status. */
  STATUS_CODE_UNSET = 0,
  /** The Span has been evaluated by an Application developer or Operator to have completed successfully. */
  STATUS_CODE_OK = 1,
  /** The Span contains an error. */
  STATUS_CODE_ERROR = 2,
}

/** Properties of a Span. */
export interface ISpan {
  /** Span traceId */
  traceId: string | Uint8Array;
  /** Span spanId */
  spanId: string | Uint8Array;
  /** Span traceState */
  traceState?: string | null;
  /** Span parentSpanId */
  parentSpanId?: string | Uint8Array;
  /** Span name */
  name: string;
  /** Span kind */
  kind: OtlpSpanKind;
  /** Span startTimeUnixNano */
  startTimeUnixNano: Fixed64;
  /** Span endTimeUnixNano */
  endTimeUnixNano: Fixed64;
  /** Span attributes */
  attributes: IKeyValue[];
  /** Span droppedAttributesCount */
  droppedAttributesCount: number;
  /** Span events */
  events: IEvent[];
  /** Span droppedEventsCount */
  droppedEventsCount: number;
  /** Span links */
  links: ILink[];
  /** Span droppedLinksCount */
  droppedLinksCount: number;
  /** Span status */
  status: IStatus;
}
