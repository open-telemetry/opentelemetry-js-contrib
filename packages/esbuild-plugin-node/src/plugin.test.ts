import * as assert from 'assert';

import { extractPackageAndModulePath } from './plugin';

describe('extractPackageAndModulePath', () => {
  it('', () => {
    assert.deepStrictEqual(
      extractPackageAndModulePath(
        '/node_modules/@aws-sdk/middleware-stack/dist/cjs/MiddlewareStack.js',
        '.'
      ),
      {
        path: './node_modules/@aws-sdk/middleware-stack/dist/cjs/MiddlewareStack.js',
        extractedModule: {
          package: '@aws-sdk/middleware-stack',
          path: 'dist/cjs/MiddlewareStack.js',
        },
      }
    );
    // @aws-sdk/middleware-stack/dist/cjs/MiddlewareStack.js
  });
});
