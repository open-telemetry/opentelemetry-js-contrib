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
import * as ReactDOM from 'react-dom';
import {
  AppType,
  ExporterType,
  Labels,
  PopupProps,
  PopupState,
  PlaceholderValues,
} from '../types';
import { styles } from './styles';
import {
  AppBar,
  CssBaseline,
  withStyles,
  Paper,
  Toolbar,
  Typography,
  Grid,
  TextField,
} from '@material-ui/core';
import { ExporterOption } from './ExporterOption';
import { capitalCase } from 'change-case';
import { loadFromStorage } from '../utils/storage';
import { SaveButton } from './SaveButton';
import { OpenOptionsPage } from './OpenOptionsPage';

const packageJson = require('../../package.json');

class App extends React.Component<PopupProps, PopupState> {
  constructor(props: PopupProps) {
    super(props);

    this.state = {
      settings: props.settings,
    };

    this.handleFilterChange = this.handleFilterChange.bind(this);
    this.handleSaveSettings = this.handleSaveSettings.bind(this);
    this.handleUrlChange = this.handleUrlChange.bind(this);
    this.toggleExporter = this.toggleExporter.bind(this);
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
              function: () => {
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

  render() {
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
                exporterPackageUrl="https://www.npmjs.com/package/@opentelemetry/tracing"
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
                exporterPackageUrl="https://www.npmjs.com/package/@opentelemetry/exporter-collector"
                value={exporters[ExporterType.COLLECTOR_TRACE].url}
              />
            </Grid>
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

loadFromStorage()
  .then(async storage => {
    const app = window.location.pathname.startsWith('/options.html')
      ? AppType.OPTIONS
      : AppType.POPUP;

    let activeTab: chrome.tabs.Tab | undefined;

    if (app === AppType.POPUP) {
      const tabs = await new Promise<chrome.tabs.Tab[]>(resolve => {
        chrome.tabs.query(
          {
            active: true,
            lastFocusedWindow: true,
          },
          result => {
            resolve(result);
          }
        );
      });
      activeTab = tabs[0];
    }

    const StyledApp = withStyles(styles)(App);

    ReactDOM.render(
      <StyledApp settings={storage.settings} app={app} activeTab={activeTab} />,
      document.getElementById('root')
    );
  })
  .catch(error => {
    // eslint-disable-next-line no-console
    console.error(error);
  });
