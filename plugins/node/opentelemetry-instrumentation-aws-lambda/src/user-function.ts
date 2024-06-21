/**
 * Adapted from https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/blob/v3.1.0/src/UserFunction.js
 */

import * as path from 'path';
import * as fs from 'fs';
import { LambdaModule } from './internal-types';

const FUNCTION_EXPR = /^([^.]*)\.(.*)$/;
const RELATIVE_PATH_SUBSTRING = '..';

/**
 * Break the full handler string into two pieces, the module root and the actual
 * handler string.
 * Given './somepath/something/module.nestedobj.handler' this returns
 * ['./somepath/something', 'module.nestedobj.handler']
 */
export function moduleRootAndHandler(
  fullHandlerString: string
): [moduleRoot: string, handler: string] {
  const handlerString = path.basename(fullHandlerString);
  const moduleRoot = fullHandlerString.substring(
    0,
    fullHandlerString.indexOf(handlerString)
  );
  return [moduleRoot, handlerString];
}

/**
 * Split the handler string into two pieces: the module name and the path to
 * the handler function.
 */
export function splitHandlerString(
  handler: string
): [module: string | undefined, functionPath: string | undefined] {
  const match = handler.match(FUNCTION_EXPR);
  if (match && match.length === 3) {
    return [match[1], match[2]];
  } else {
    return [undefined, undefined];
  }
}

/**
 * Resolve the user's handler function key and its containing object from the module.
 */
export function resolveHandler(
  object: object,
  nestedProperty: string
): [container: LambdaModule | undefined, handlerKey: string | undefined] {
  const nestedPropertyKeys = nestedProperty.split('.');
  const handlerKey = nestedPropertyKeys.pop();

  const container = nestedPropertyKeys.reduce<object | undefined>(
    (nested, key) => {
      return nested && (nested as Partial<Record<string, object>>)[key];
    },
    object
  );

  if (container) {
    return [container as LambdaModule, handlerKey];
  } else {
    return [undefined, undefined];
  }
}

/**
 * Attempt to determine the user's module path.
 */
export function tryPath(
  appRoot: string,
  moduleRoot: string,
  module: string
): string | undefined {
  const lambdaStylePath = path.resolve(appRoot, moduleRoot, module);

  const extensionless = fs.existsSync(lambdaStylePath);
  if (extensionless) {
    return lambdaStylePath;
  }

  const extensioned =
    (fs.existsSync(lambdaStylePath + '.js') && lambdaStylePath + '.js') ||
    (fs.existsSync(lambdaStylePath + '.mjs') && lambdaStylePath + '.mjs') ||
    (fs.existsSync(lambdaStylePath + '.cjs') && lambdaStylePath + '.cjs');
  if (extensioned) {
    return extensioned;
  }

  try {
    const nodeStylePath = require.resolve(module, {
      paths: [appRoot, moduleRoot],
    });
    return nodeStylePath;
  } catch {
    return undefined;
  }
}

export function isInvalidHandler(fullHandlerString: string): boolean {
  if (fullHandlerString.includes(RELATIVE_PATH_SUBSTRING)) {
    return true;
  } else {
    return false;
  }
}
