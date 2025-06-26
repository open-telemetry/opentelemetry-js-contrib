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

import * as utils from '../src/utils';
import * as assert from 'assert';
import { ExpressInstrumentationConfig } from '../src/types';
import {
  _LAYERS_STORE_PROPERTY,
  ExpressLayer,
  PatchedRequest,
} from '../src/internal-types';
import { ExpressLayerType } from '../src/enums/ExpressLayerType';
import { AttributeNames } from '../src/enums/AttributeNames';

describe('Utils', () => {
  describe('isLayerIgnored()', () => {
    it('should not fail with invalid config', () => {
      assert.doesNotThrow(() =>
        utils.isLayerIgnored('', ExpressLayerType.MIDDLEWARE)
      );
      assert.doesNotThrow(() =>
        utils.isLayerIgnored(
          '',
          ExpressLayerType.MIDDLEWARE,
          {} as ExpressInstrumentationConfig
        )
      );
      assert.doesNotThrow(() =>
        utils.isLayerIgnored('', ExpressLayerType.MIDDLEWARE, {
          ignoreLayersType: {},
        } as ExpressInstrumentationConfig)
      );
      assert.doesNotThrow(() =>
        utils.isLayerIgnored('', ExpressLayerType.MIDDLEWARE, {
          ignoreLayersType: {},
          ignoreLayers: {},
        } as ExpressInstrumentationConfig)
      );
    });

    it('should ignore based on type', () => {
      assert.deepEqual(
        utils.isLayerIgnored('', ExpressLayerType.MIDDLEWARE, {
          ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
        }),
        true
      );
      assert.deepEqual(
        utils.isLayerIgnored('', ExpressLayerType.ROUTER, {
          ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
        }),
        false
      );
    });

    it('should ignore based on the name', () => {
      assert.deepEqual(
        utils.isLayerIgnored('bodyParser', ExpressLayerType.MIDDLEWARE, {
          ignoreLayers: ['bodyParser'],
        }),
        true
      );
      assert.deepEqual(
        utils.isLayerIgnored('bodyParser', ExpressLayerType.MIDDLEWARE, {
          ignoreLayers: [(name: string) => name === 'bodyParser'],
        }),
        true
      );
      assert.deepEqual(
        utils.isLayerIgnored('bodyParser', ExpressLayerType.MIDDLEWARE, {
          ignoreLayers: [/bodyParser/],
        }),
        true
      );
      assert.deepEqual(
        utils.isLayerIgnored('test', ExpressLayerType.ROUTER, {
          ignoreLayers: ['bodyParser'],
        }),
        false
      );
    });
  });

  describe('getLayerMetadata()', () => {
    it('should return router metadata', () => {
      assert.deepEqual(
        utils.getLayerMetadata(
          '/test',
          {
            name: 'router',
          } as ExpressLayer,
          '/test'
        ),
        {
          attributes: {
            [AttributeNames.EXPRESS_NAME]: '/test',
            [AttributeNames.EXPRESS_TYPE]: 'router',
          },
          name: 'router - /test',
        }
      );
    });

    it('should return request handler metadata', () => {
      assert.deepEqual(
        utils.getLayerMetadata(
          '/:id',
          {
            name: 'bound dispatch',
          } as ExpressLayer,
          '/:id'
        ),
        {
          attributes: {
            [AttributeNames.EXPRESS_NAME]: '/:id',
            [AttributeNames.EXPRESS_TYPE]: 'request_handler',
          },
          name: 'request handler',
        }
      );
    });

    it('should return middleware metadata', () => {
      assert.deepEqual(
        utils.getLayerMetadata('', {
          name: 'bodyParser',
        } as ExpressLayer),
        {
          attributes: {
            [AttributeNames.EXPRESS_NAME]: 'bodyParser',
            [AttributeNames.EXPRESS_TYPE]: 'middleware',
          },
          name: 'middleware - bodyParser',
        }
      );
    });
  });

  describe('reconstructRouterPath()', () => {
    it('should reconstruct a simple router path', () => {
      const layer = {
        handle: {
          stack: [
            {
              route: {
                path: '/test',
              },
            },
          ],
        },
      };

      assert.strictEqual(
        utils.getRouterPath('', layer as unknown as ExpressLayer),
        '/test'
      );
    });

    it('should reconstruct a parameterized router path', () => {
      const layer = {
        handle: {
          stack: [
            {
              handle: {
                stack: [
                  {
                    route: {
                      path: '/:id',
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      assert.strictEqual(
        utils.getRouterPath('', layer as unknown as ExpressLayer),
        '/:id'
      );
    });
  });
  describe('asErrorAndMessage', () => {
    it('should special case Error instances', () => {
      const input = new Error('message');
      const [error, message] = utils.asErrorAndMessage(input);
      assert.strictEqual(error, input);
      assert.strictEqual(message, 'message');
    });

    it('should pass strings as-is', () => {
      const input = 'error';
      const [error, message] = utils.asErrorAndMessage(input);
      assert.strictEqual(error, input);
      assert.strictEqual(message, input);
    });

    it('should stringify other types', () => {
      const input = 2;
      const [error, message] = utils.asErrorAndMessage(input);
      assert.strictEqual(error, '2');
      assert.strictEqual(message, '2');
    });
  });

  describe('getLayerPath', () => {
    it('should return path for a string route definition', () => {
      assert.strictEqual(utils.getLayerPath(['/test']), '/test');
    });

    it('should return path for a regex route definition', () => {
      assert.strictEqual(utils.getLayerPath([/^\/test$/]), '/^\\/test$/');
    });

    it('should return path for an array of route definitions', () => {
      assert.strictEqual(
        utils.getLayerPath([[/^\/test$/, '/test']]),
        '/^\\/test$/,/test'
      );
    });

    it('should return path for a mixed array of route definitions', () => {
      assert.strictEqual(
        utils.getLayerPath([[/^\/test$/, '/test', /^\/test$/]]),
        '/^\\/test$/,/test,/^\\/test$/'
      );
    });
  });

  describe('getActualMatchedRoute', () => {
    interface PatchedRequestPart {
      originalUrl: PatchedRequest['originalUrl'];
      [_LAYERS_STORE_PROPERTY]?: string[];
    }

    function createMockRequest(
      originalUrl: string,
      layersStore?: string[]
    ): PatchedRequestPart {
      const req: PatchedRequestPart = {
        originalUrl,
        [_LAYERS_STORE_PROPERTY]: layersStore,
      };
      return req;
    }

    describe('Basic functionality', () => {
      it('should return undefined when layers store is empty', () => {
        const req = createMockRequest('/api/users', []);
        const result = utils.getActualMatchedRoute(
          req as unknown as PatchedRequestPart
        );
        assert.strictEqual(result, undefined);
      });

      it('should return undefined when layers store property is undefined', () => {
        const req = createMockRequest('/api/users');
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, undefined);
      });

      it('should return undefined when layers store is not an array', () => {
        const req = createMockRequest('/api/users');
        (req as any)[_LAYERS_STORE_PROPERTY] = 'not-an-array';
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, undefined);
      });
    });

    describe('Root path handling', () => {
      it('should return "/" when originalUrl is "/" and layers store contains only root paths', () => {
        const req = createMockRequest('/', ['/', '/']);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/');
      });

      it('should return "/" when originalUrl is "/" and layers store contains single root path', () => {
        const req = createMockRequest('/', ['/']);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/');
      });

      it('should return undefined when originalUrl is not root but all layers are root paths', () => {
        const req = createMockRequest('/some/path', ['/', '/', '/']);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, undefined);
      });

      it('should return undefined when originalUrl is not included in layer with only slashes', () => {
        const req = createMockRequest('/different/api/users', ['/', '/']);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, undefined);
      });
    });

    describe('Case: originalUrl not included in layers store array', () => {
      it('should return undefined when originalUrl does not match any route pattern', () => {
        const req = createMockRequest('/api/orders', [
          '/',
          '/api/users',
          '/api/products',
        ]);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, undefined);
      });

      it('should return undefined when originalUrl is completely different from layers', () => {
        const req = createMockRequest('/completely/different/path', [
          '/',
          '/api',
          '/users',
        ]);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, undefined);
      });

      it('should return undefined when originalUrl is longer but does not start with constructed route', () => {
        const req = createMockRequest('/different/api/users', [
          '/',
          '/api',
          '/users',
        ]);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, undefined);
      });

      it('should return undefined when originalUrl is not included in layer with only slashes', () => {
        const req = createMockRequest('/different/api/users', ['/', '/']);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, undefined);
      });
    });

    describe('Exact URL matching', () => {
      it('should return route when originalUrl exactly matches constructed route', () => {
        const req = createMockRequest('/api/users', ['/', '/api', '/users']);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/api/users');
      });

      it('should return route when originalUrl starts with constructed route', () => {
        const req = createMockRequest('/api/users/123', [
          '/',
          '/api',
          '/users',
        ]);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/api/users');
      });
    });

    describe('Parameterized routes', () => {
      it('should handle route with parameter pattern when originalUrl matches the pattern', () => {
        const req = createMockRequest('/toto/tata', ['/', '/toto', '/:id']);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/toto/:id');
      });

      it('should handle multiple parameter patterns', () => {
        const req = createMockRequest('/users/123/posts/456', [
          '/',
          '/users',
          '/:userId',
          '/posts',
          '/:postId',
        ]);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/users/:userId/posts/:postId');
      });

      it('should handle nested parameter routes', () => {
        const req = createMockRequest('/api/v1/users/123', [
          '/',
          '/api',
          '/v1',
          '/users',
          '/:id',
        ]);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/api/v1/users/:id');
      });

      it('should remove wildcard pattern inside route path', () => {
        const req = createMockRequest('/static/images/logo.png', [
          '/',
          '/static',
          '/*',
        ]);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/static');
      });

      it('should handle general wildcard pattern', () => {
        const req = createMockRequest('/foo/3', ['/', '*']);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '*');
      });
    });

    describe('Route normalization', () => {
      it('should normalize routes with duplicate slashes', () => {
        const req = createMockRequest('/api/users', ['/', '//api', '//users']);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/api/users');
      });

      it('should handle mixed slash patterns', () => {
        const req = createMockRequest('/api/v1/users', [
          '/',
          '/api/',
          '/v1/',
          '/users',
        ]);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/api/v1/users');
      });
    });

    describe('Edge cases', () => {
      it('should filter out wildcard paths correctly', () => {
        const req = createMockRequest('/api/users', [
          '/',
          '/*',
          '/api',
          '/users',
        ]);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/api/users');
      });

      it('should handle empty meaningful paths after filtering', () => {
        const req = createMockRequest('/test', ['/', '/*']);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/');
      });

      it('should handle layers store with only wildcards', () => {
        const req = createMockRequest('/anything', ['/*', '/*']);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/');
      });

      it('should handle complex nested routes', () => {
        const req = createMockRequest('/api/v2/users/123/posts/456/comments', [
          '/',
          '/api',
          '/v2',
          '/users',
          '/:userId',
          '/posts',
          '/:postId',
          '/comments',
        ]);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(
          result,
          '/api/v2/users/:userId/posts/:postId/comments'
        );
      });
    });

    describe('Query parameters and fragments', () => {
      it('should handle originalUrl with query parameters', () => {
        const req = createMockRequest('/api/users?page=1&limit=10', [
          '/',
          '/api',
          '/users',
        ]);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/api/users');
      });

      it('should handle originalUrl with hash fragments', () => {
        const req = createMockRequest('/api/users#section1', [
          '/',
          '/api',
          '/users',
        ]);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/api/users');
      });

      it('should handle parameterized routes with query parameters', () => {
        const req = createMockRequest('/users/123?include=profile', [
          '/',
          '/users',
          '/:id',
        ]);
        const result = utils.getActualMatchedRoute(req);
        assert.strictEqual(result, '/users/:id');
      });
    });
  });
});
