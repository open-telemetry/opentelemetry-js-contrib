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

export interface Settings {
  urlFilter: string;
  exporters: {
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
  };
}

export class Storage {
  settings: Settings;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(storage: { [key: string]: any }) {
    this.settings = storage.settings;
  }
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

export interface PopupProps extends WithStyles<typeof styles> {
  settings: Settings;
  app: AppType;
  activeTab: chrome.tabs.Tab | undefined;
}

export interface PopupState {
  settings: Settings;
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

export enum DomElements {
  CONFIG_TAG = 'open-telemetry-instrumentation',
}

export enum DomAttributes {
  CONFIG = 'config',
}

export enum PlaceholderValues {
  ZIPKIN_URL = 'http://localhost:9411/api/v2/spans',
  COLLECTOR_TRACE_URL = 'http://localhost:55681/v1/trace',
}

export enum Labels {
  SAVE = 'Save',
  SAVE_AND_RELOAD = 'Save & Reload',
}
