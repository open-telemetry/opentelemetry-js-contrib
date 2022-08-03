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

/* eslint-disable node/no-extraneous-import */

import { capitalCase } from 'change-case';
import * as json5 from 'json5';

// From https://github.com/TypeStrong/ts-loader/blob/main/src/interfaces.ts
interface WebpackLoaderContext {
  emitFile(name: string, content: string): void;
  getOptions(): {
    manifestVersion: number;
  };
}

interface IconSet {
  [key: string]: string;
}

export default function (this: WebpackLoaderContext, source: string): string {
  const p = require('../../package.json');
  const options = this.getOptions();

  const manifest5 = json5.parse(source);

  const sizes = ['16', '32', '48', '128'];
  manifest5.icons = sizes.reduce((result: IconSet, size: string) => {
    result[size] = manifest5.icons.replace('{size}', size);
    return result;
  }, {});

  manifest5.action['default_icon'] = manifest5.icons;

  const background =
    Number(options.manifestVersion) === 3
      ? {
          service_worker: manifest5.background,
        }
      : {
          scripts: [manifest5.background],
        };

  const web_accessible_resources =
    Number(options.manifestVersion) === 3
      ? [
          {
            resources: manifest5.web_accessible_resources,
            matches: ['<all_urls>'],
          },
        ]
      : manifest5.web_accessible_resources;

  if (Number(options.manifestVersion) === 2) {
    manifest5.permissions = manifest5.permissions.filter(
      (permission: string) => permission !== 'scripting'
    );
    manifest5.browser_action = Object.assign({}, manifest5.action);
    delete manifest5.action;

    manifest5.optional_permissions = Object.values(manifest5.host_permissions);
    delete manifest5.host_permissions;
  }

  const result = JSON.stringify(
    Object.assign(manifest5, {
      manifest_version: options.manifestVersion,
      version: p.version,
      background,
      web_accessible_resources,
      description: p.description,
      name: capitalCase(p.name),
    }),
    null,
    2
  );

  this.emitFile('manifest.json', result);
  return source;
}
