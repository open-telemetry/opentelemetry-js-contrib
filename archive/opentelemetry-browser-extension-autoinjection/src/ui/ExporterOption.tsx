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
import {
  FormControlLabel,
  FormGroup,
  FormHelperText,
  Grid,
  Link,
  Switch,
  TextField,
} from '@material-ui/core';
import * as React from 'react';
import { ExporterOptionProps, ExporterType } from '../types';

export class ExporterOption extends React.Component<ExporterOptionProps> {
  override render() {
    return (
      <React.Fragment>
        <Grid item xs={12} md={12}>
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={this.props.isEnabled}
                  onChange={() => this.props.onToggle(this.props.for)}
                ></Switch>
              }
              label={this.props.for}
            />
            <FormHelperText>
              Toggle to enable{' '}
              <Link
                href={this.props.exporterPackageUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {this.props.for}Exporter
              </Link>
            </FormHelperText>
          </FormGroup>
        </Grid>
        {this.props.value !== undefined ? (
          <Grid item xs={12} md={9}>
            <TextField
              label={`${this.props.for} URL`}
              fullWidth
              variant="outlined"
              margin="dense"
              helperText={`Endpoint URL for the collector, default is ${this.props.placeholderValue}`}
              placeholder={this.props.placeholderValue}
              value={this.props.value}
              onChange={event =>
                this.props.onValueChange
                  ? this.props.onValueChange(
                      this.props.for as
                        | ExporterType.ZIPKIN
                        | ExporterType.COLLECTOR_TRACE,
                      event.target.value
                    )
                  : () => {}
              }
            />
          </Grid>
        ) : (
          ''
        )}
      </React.Fragment>
    );
  }
}
