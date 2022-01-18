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
import * as React from 'react';
import {
  AppType,
  ExporterType,
  Labels,
  AppProps as AppProps,
  AppState as AppState,
  PlaceholderValues,
} from '../types';
import {
  AppBar,
  CssBaseline,
  Paper,
  Toolbar,
  Typography,
  Grid,
  TextField,
} from '@material-ui/core';
import { ExporterOption } from './ExporterOption';
import { capitalCase } from 'change-case';
import { SaveButton } from './SaveButton';
import { OpenOptionsPage } from './OpenOptionsPage';
import { PermissionManager } from './PermissionManager';
import { PermissionAlert } from './PermissionAlert';
const packageJson = require('../../package.json');

export class App extends React.Component<AppProps, AppState> {
  permissionsUpdated: () => void;
  constructor(props: AppProps) {
    super(props);

    this.state = {
      settings: props.settings,
      permissions: props.permissions,
      isPermissionAlertDismissed: props.isPermissionAlertDismissed,
      removingPermissionsFailed: false,
    };

    this.handleFilterChange = this.handleFilterChange.bind(this);
    this.handleSaveSettings = this.handleSaveSettings.bind(this);
    this.handleUrlChange = this.handleUrlChange.bind(this);
    this.toggleExporter = this.toggleExporter.bind(this);
    this.onTogglePermissions = this.onTogglePermissions.bind(this);
    this.dismissPermissionAlert = this.dismissPermissionAlert.bind(this);

    this.permissionsUpdated = () => {
      chrome.permissions.getAll(permissions => {
        this.setState({ permissions });
      });
    };
  }

  override componentDidMount() {
    if (chrome.permissions.onAdded) {
      chrome.permissions.onAdded.addListener(this.permissionsUpdated);
      chrome.permissions.onRemoved.addListener(this.permissionsUpdated);
    }
  }

  handleFilterChange(event: React.ChangeEvent<HTMLInputElement>) {
    this.setState(state => {
      state.settings.urlFilter = event.target.value;
      return state;
    });
  }

  handleUrlChange(
    name: ExporterType.ZIPKIN | ExporterType.COLLECTOR_TRACE,
    value: string
  ) {
    this.setState(state => {
      state.settings.exporters[name].url = value;
      return state;
    });
  }

  toggleExporter(name: ExporterType) {
    this.setState(state => {
      state.settings.exporters[name].enabled =
        !state.settings.exporters[name].enabled;
      return state;
    });
  }

  async handleSaveSettings() {
    chrome.storage.local.set(
      {
        settings: this.state.settings,
      },
      async () => {
        if (this.props.activeTab) {
          const tabId = Number(this.props.activeTab.id);
          if (chrome.scripting) {
            chrome.scripting.executeScript({
              target: {
                tabId,
              },
              func: () => {
                window.location.reload();
              },
            });
          } else {
            chrome.tabs.executeScript(tabId, {
              code: 'window.location.reload();',
            });
          }
        }
      }
    );
  }

  onTogglePermissions(currentValue: boolean) {
    if (currentValue) {
      chrome.permissions.remove(
        {
          origins: ['http://*/*', 'https://*/*'],
        },
        () => {
          if (chrome.runtime.lastError) {
            this.setState({
              removingPermissionsFailed: true,
            });
          }
        }
      );
    } else {
      chrome.permissions.request({
        origins: ['http://*/*', 'https://*/*'],
      });
    }
  }

  dismissPermissionAlert() {
    this.setState(
      {
        isPermissionAlertDismissed: true,
      },
      () => {
        chrome.storage.local.set({
          isPermissionAlertDismissed: this.state.isPermissionAlertDismissed,
        });
      }
    );
  }

  override render() {
    const { urlFilter, exporters } = this.state.settings;

    const classes = this.props.classes;

    const saveLabel =
      this.props.app === AppType.POPUP ? Labels.SAVE_AND_RELOAD : Labels.SAVE;

    return (
      <React.Fragment>
        <CssBaseline />
        <AppBar position="absolute" color="default" className={classes.appBar}>
          <Toolbar>
            {this.props.app === AppType.OPTIONS ? (
              <Typography variant="h6" color="inherit" noWrap>
                {capitalCase(packageJson.name)} ({packageJson.version})
              </Typography>
            ) : (
              <React.Fragment>
                <SaveButton
                  label={saveLabel}
                  onClick={this.handleSaveSettings}
                />
                <Typography className={classes.title} />
                <OpenOptionsPage />
              </React.Fragment>
            )}
          </Toolbar>
        </AppBar>
        <main className={classes.layout}>
          <PermissionAlert
            permissions={this.state.permissions}
            dismissed={this.state.isPermissionAlertDismissed}
            onDismiss={this.dismissPermissionAlert}
            onGrantPermission={() => this.onTogglePermissions(false)}
          />
          <Paper className={classes.paper}>
            <Typography
              component="h1"
              variant="h6"
              color="primary"
              gutterBottom
            >
              Injection Settings
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  id="urlFilter"
                  label="URL Filter"
                  fullWidth
                  variant="outlined"
                  margin="dense"
                  value={urlFilter}
                  onChange={this.handleFilterChange}
                  helperText='Injection is only applied if the URL contains the given filter. Use "*" to match every URL.'
                />
              </Grid>
            </Grid>
          </Paper>
          <Paper className={classes.paper}>
            <Typography
              component="h1"
              variant="h6"
              color="primary"
              gutterBottom
            >
              Exporter Settings
            </Typography>
            <Grid container spacing={2}>
              <ExporterOption
                for={ExporterType.CONSOLE}
                isEnabled={exporters[ExporterType.CONSOLE].enabled}
                onToggle={this.toggleExporter}
                exporterPackageUrl="https://www.npmjs.com/package/@opentelemetry/sdk-trace-base"
              />
              <ExporterOption
                for={ExporterType.ZIPKIN}
                isEnabled={exporters[ExporterType.ZIPKIN].enabled}
                onToggle={this.toggleExporter}
                onValueChange={this.handleUrlChange}
                placeholderValue={PlaceholderValues.ZIPKIN_URL}
                exporterPackageUrl="https://www.npmjs.com/package/@opentelemetry/exporter-zipkin"
                value={exporters[ExporterType.ZIPKIN].url}
              />
              <ExporterOption
                for={ExporterType.COLLECTOR_TRACE}
                isEnabled={exporters[ExporterType.COLLECTOR_TRACE].enabled}
                onToggle={this.toggleExporter}
                onValueChange={this.handleUrlChange}
                placeholderValue={PlaceholderValues.COLLECTOR_TRACE_URL}
                exporterPackageUrl="https://www.npmjs.com/package/@opentelemetry/exporter-otlp-http"
                value={exporters[ExporterType.COLLECTOR_TRACE].url}
              />
            </Grid>
          </Paper>
          <Paper className={classes.paper}>
            <Typography
              component="h1"
              variant="h6"
              color="primary"
              gutterBottom
            >
              Manage Permissions
            </Typography>
            <PermissionManager
              permissions={this.state.permissions}
              onTogglePermissions={this.onTogglePermissions}
              removingPermissionsFailed={this.state.removingPermissionsFailed}
            />
          </Paper>
          <Paper className={classes.paper}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <SaveButton
                  label={saveLabel}
                  onClick={this.handleSaveSettings}
                />
              </Grid>
            </Grid>
          </Paper>
        </main>
      </React.Fragment>
    );
  }
}
