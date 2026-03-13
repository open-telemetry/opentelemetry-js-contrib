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

import * as semver from 'semver';
import { createRequire } from 'module';

import { SpanStatusCode } from '@opentelemetry/api';
import * as assert from 'assert';
import { getRequester, setupHttp, App } from './setup';
import {
  disableInstrumentation,
  enableInstrumentation,
  memoryExporter,
} from './telemetry';
import { assertSpans } from './utils';

import * as util from 'util';

const packageRequire = createRequire(__filename);
const LIB_VERSION = packageRequire('@nestjs/core/package.json')
  .version as string;

util.inspect.defaultOptions.depth = 3;
util.inspect.defaultOptions.breakLength = 200;

describe('nestjs', () => {
  let app: App;
  let request = async (_path: string): Promise<unknown> => {
    throw new Error('Not yet initialized.');
  };

  beforeEach(async () => {
    enableInstrumentation();

    app = await setupHttp(LIB_VERSION);
    request = getRequester(app);
  });

  afterEach(async () => {
    await app.close();

    disableInstrumentation();
  });

  describe('nestjs-core instrumentation', () => {
    it('should capture setup', async () => {
      assertSpans(memoryExporter.getFinishedSpans(), [
        {
          type: 'app_creation',
          service: 'test',
          name: 'Create Nest App',
          module: 'AppModule',
        },
      ]);
    });

    it('should capture requests', async () => {
      const path = semver.intersects(LIB_VERSION, '<5.0.0') ? '/' : '/users';
      const url = '/users';
      const instance = 'UsersController';
      const callback = 'getUsers';

      assert.strictEqual(await request('/users'), 'Hello, world!\n');

      assertSpans(memoryExporter.getFinishedSpans(), [
        {
          type: 'app_creation',
          service: 'test',
          name: 'Create Nest App',
          module: 'AppModule',
        },
        {
          type: 'handler',
          service: 'test',
          name: callback,
          callback,
          parentSpanName: `${instance}.${callback}`,
        },
        {
          type: 'request_context',
          service: 'test',
          name: `${instance}.${callback}`,
          method: 'GET',
          url,
          path,
          callback,
        },
      ]);
    });

    it('should not overwrite metadata set on the request handler', async () => {
      const path = semver.intersects(LIB_VERSION, '<5.0.0') ? '/' : '/metadata';
      const url = '/metadata';
      const instance = 'MetadataController';
      const callback = 'getMetadata';

      assert.deepStrictEqual(await request('/metadata'), '["path","method"]');

      assertSpans(memoryExporter.getFinishedSpans(), [
        {
          type: 'app_creation',
          service: 'test',
          name: 'Create Nest App',
          module: 'AppModule',
        },
        {
          type: 'handler',
          service: 'test',
          name: callback,
          callback,
          parentSpanName: `${instance}.${callback}`,
        },
        {
          type: 'request_context',
          service: 'test',
          name: `${instance}.${callback}`,
          method: 'GET',
          url,
          path,
          callback,
        },
      ]);
    });

    it('should capture errors', async () => {
      const path = semver.intersects(LIB_VERSION, '<5.0.0') ? '/' : '/errors';
      const url = '/errors';
      const instance = 'ErrorController';
      const callback = 'getError';

      assert.strictEqual(
        await request('/errors'),
        '{"statusCode":500,"message":"Internal server error"}'
      );

      assertSpans(memoryExporter.getFinishedSpans(), [
        {
          type: 'app_creation',
          service: 'test',
          name: 'Create Nest App',
          module: 'AppModule',
        },
        {
          type: 'handler',
          service: 'test',
          name: callback,
          callback,
          status: {
            code: SpanStatusCode.ERROR,
            message: 'custom error',
          },
          parentSpanName: `${instance}.${callback}`,
        },
        {
          type: 'request_context',
          service: 'test',
          name: `${instance}.${callback}`,
          method: 'GET',
          url,
          path,
          callback,
          status: {
            code: SpanStatusCode.ERROR,
            message: 'custom error',
          },
        },
      ]);
    });
  });
});
