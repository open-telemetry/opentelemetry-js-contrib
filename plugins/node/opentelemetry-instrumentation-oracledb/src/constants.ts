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
 *
 * Copyright (c) 2024, Oracle and/or its affiliates.
 * */

// Oracle specific attributes not covered by semantic conventions
export enum AttributeNames {
  ORACLE_BIND_VALUES = 'db.oracle.bind_values',
  ORACLE_POOL_MIN = 'db.oracle.pool_min',
  ORACLE_POOL_MAX = 'db.oracle.pool_max',
  ORACLE_POOL_INCR = 'db.oracle.pool_incr',
  ORACLE_EXEC_OPTIONS = 'db.oracle.exec.options',
  ORACLE_INSTANCE = 'db.oracle.instance',
  ORACLE_PDBNAME = 'db.oracle.pdbname',
  ORACLE_IMPLICIT_RELEASE = 'db.oracle.implicit_release',
}

// Contains span names produced by instrumentation
// It lists the RPC names (suffix with _MSG like EXECUTE_MSG) and
// exported oracledb functions (like EXECUTE).
export enum SpanNames {
  CONNECT = 'oracledb.getConnection',
  POOL_CONNECT = 'oracledb.Pool.getConnection',
  POOL_CREATE = 'oracledb.createPool',
  CONNECT_PROTOCOL_NEG = 'oracledb.ProtocolMessage',
  CONNECT_DATATYPE_NEG = 'oracledb.DataTypeMessage',
  CONNECT_AUTH_MSG = 'oracledb.AuthMessage',
  CONNECT_FAST_AUTH = 'oracledb.FastAuthMessage',
  EXECUTE_MSG = 'oracledb.ExecuteMessage',
  EXECUTE = 'oracledb.Connection.execute',
  EXECUTE_MANY = 'oracledb.Connection.executeMany',
  LOGOFF_MSG = 'oracledb.LogOffMessage',
  CONNECT_CLOSE = 'oracledb.Connection.close',
  CREATE_LOB = 'oracledb.Connection.createLob',
  LOB_MESSAGE = 'oracledb.LobOpMessage',
  LOB_GETDATA = 'oracledb.Lob.getData',
}
