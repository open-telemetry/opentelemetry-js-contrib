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

import { styles } from './ui/styles';
import { WithStyles } from '@material-ui/core';

export interface Exporters {
  [ExporterType.CONSOLE]: {
    enabled: boolean;
  };
  [ExporterType.ZIPKIN]: {
    enabled: boolean;
    url: string;
  };
  [ExporterType.COLLECTOR_TRACE]: {
    enabled: boolean;
    url: string;
  };
}

export interface InstrumentationConfiguration {
  exporters: Exporters;
  instrumentations: {
    [InstrumentationType.DOCUMENT_LOAD]: {
      enabled: boolean;
    };
    [InstrumentationType.FETCH]: {
      enabled: boolean;
    };
    [InstrumentationType.XML_HTTP_REQUEST]: {
      enabled: boolean;
    };
  };
  withZoneContextManager: boolean;
}

export interface Settings {
  urlFilter: string;
  exporters: Exporters;
}

export class Storage {
  settings: Settings;
  isPermissionAlertDismissed: boolean;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(storage: { [key: string]: any }) {
    this.settings = storage.settings;
    this.isPermissionAlertDismissed = storage.isPermissionAlertDismissed;
  }
}

export interface PermissionManagerProps {
  permissions: chrome.permissions.Permissions;
  onTogglePermissions: (currentValue: boolean) => void;
  removingPermissionsFailed: boolean;
}

export interface PermissionAlertProps {
  permissions: chrome.permissions.Permissions;
  dismissed: boolean;
  onDismiss: () => void;
  onGrantPermission: () => void;
}

export interface ExporterOptionProps {
  for: ExporterType;
  isEnabled: boolean;
  onToggle: (exporter: ExporterType) => void;
  onValueChange?: (
    name: ExporterType.ZIPKIN | ExporterType.COLLECTOR_TRACE,
    newValue: string
  ) => void;
  exporterPackageUrl: string;
  placeholderValue?: PlaceholderValues;
  value?: string;
}

export interface SaveButtonProps {
  label: Labels;
  onClick: () => void;
}

export interface AppProps extends WithStyles<typeof styles> {
  permissions: chrome.permissions.Permissions;
  settings: Settings;
  isPermissionAlertDismissed: boolean;
  app: AppType;
  activeTab: chrome.tabs.Tab | undefined;
}

export interface AppState {
  settings: Settings;
  permissions: chrome.permissions.Permissions;
  isPermissionAlertDismissed: boolean;
  removingPermissionsFailed: boolean;
}

export enum AppType {
  OPTIONS = 'options',
  POPUP = 'popup',
}

export enum ExporterType {
  CONSOLE = 'Console',
  ZIPKIN = 'Zipkin',
  COLLECTOR_TRACE = 'CollectorTrace',
}

export enum InstrumentationType {
  DOCUMENT_LOAD = 'DocumentLoad',
  FETCH = 'Fetch',
  XML_HTTP_REQUEST = 'XMLHttpRequest',
}

export enum DomElements {
  CONFIG_TAG = 'open-telemetry-instrumentation',
}

export enum DomAttributes {
  CONFIG = 'config',
}

export enum PlaceholderValues {
  ZIPKIN_URL = 'http://localhost:9411/api/v2/spans',
  COLLECTOR_TRACE_URL = 'http://localhost:4318/v1/trace',
}

export enum Labels {
  SAVE = 'Save',
  SAVE_AND_RELOAD = 'Save & Reload',
}

export enum TabStatus {
  UNLOADED = 'unloaded',
  LOADING = 'loading',
  COMPLETE = 'complete',
}

export const CONTENT_SCRIPT_NAME = 'contentScript.js';
export const INSTRUMENTATION_SCRIPT_NAME = 'instrumentation.js';
