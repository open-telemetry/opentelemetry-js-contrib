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

module.exports = {
  env: {
    node: true,
    es2021: true,
    mocha: true,
  },
  plugins: ['header'],
  extends: [
    'eslint:recommended',
    'plugin:node/recommended',
    'plugin:prettier/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
  },
  globals: {
    fastly: 'readonly',
    CacheOverride: 'readonly',
    fetch: 'writable',
    Request: 'writable',
    Headers: 'writable',
    Response: 'writable',
    Dictionary: 'readonly',
    failureFunction: 'readonly',
    __dirname: 'readonly',
    addEventListener: 'readonly',
  },
  ignorePatterns: [],
  rules: {
    quotes: [2, 'single', { avoidEscape: true }],
    eqeqeq: 'off',
    'no-unused-vars': ['error', { argsIgnorePattern: 'event' }],
    'prefer-rest-params': 'off',
    'arrow-parens': ['error', 'as-needed'],
    'prettier/prettier': ['error', { singleQuote: true, arrowParens: 'avoid' }],
    'node/no-deprecated-api': ['warn'],
    'node/no-unpublished-require': [
      'error',
      {
        allowModules: ['chai', 'node-fetch', 'nock'],
      },
    ],
    'header/header': [
      2,
      'block',
      [
        {
          pattern:
            / \* Copyright The OpenTelemetry Authors[\r\n]+ \*[\r\n]+ \* Licensed under the Apache License, Version 2\.0 \(the "License"\);[\r\n]+ \* you may not use this file except in compliance with the License\.[\r\n]+ \* You may obtain a copy of the License at[\r\n]+ \*[\r\n]+ \* {6}https:\/\/www\.apache\.org\/licenses\/LICENSE-2\.0[\r\n]+ \*[\r\n]+ \* Unless required by applicable law or agreed to in writing, software[\r\n]+ \* distributed under the License is distributed on an "AS IS" BASIS,[\r\n]+ \* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied\.[\r\n]+ \* See the License for the specific language governing permissions and[\r\n]+ \* limitations under the License\./gm,
          template:
            '\n * Copyright The OpenTelemetry Authors\n *\n * Licensed under the Apache License, Version 2.0 (the "License");\n * you may not use this file except in compliance with the License.\n * You may obtain a copy of the License at\n *\n *      https://www.apache.org/licenses/LICENSE-2.0\n *\n * Unless required by applicable law or agreed to in writing, software\n * distributed under the License is distributed on an "AS IS" BASIS,\n * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n * See the License for the specific language governing permissions and\n * limitations under the License.\n ',
        },
      ],
    ],
  },
};
