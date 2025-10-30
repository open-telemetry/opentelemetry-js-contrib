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

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import nodePlugin from 'eslint-plugin-n';
import yalhPlugin from 'eslint-plugin-yet-another-license-header';

const defaultLicense = `
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
`;

// This matches `defaultLicense`, but allows additional Copyright holders
// either on the same line:
//    Copyright The OpenTelemetry Authors, <someone>, <another someone>
// and/or on subsequent lines:
//    Copyright The OpenTelemetry Authors
//    Copyright <someone>
//    Copyright <another someone>
const licensePattern =
  /^\/\*\n \* Copyright The OpenTelemetry Authors(?:, [^\n]+)*\n(?: \* Copyright [^\n]+\n)* \*\n \* Licensed under the Apache License, Version 2.0 \(the "License"\);\n \* you may not use this file except in compliance with the License.\n \* You may obtain a copy of the License at\n \*\n \* {6}https:\/\/www.apache.org\/licenses\/LICENSE-2.0\n \*\n \* Unless required by applicable law or agreed to in writing, software\n \* distributed under the License is distributed on an "AS IS" BASIS,\n \* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n \* See the License for the specific language governing permissions and\n \* limitations under the License.\n \*\/$/;

const baseConfig = tseslint.config(
  {
    ignores: [
      '**/.nx/**',
      '**/build/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
    ],
  },
  {
    files: ['**/*.{js,ts,mjs}'],
    plugins: {
      'yet-another-license-header': yalhPlugin,
      node: nodePlugin,
    },
    extends: [
      eslint.configs.recommended,
      // nodePlugin.configs['flat/recommended'],
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
      },
    },
    settings: {
      node: {
        tryExtensions: ['.js', '.json', '.node', '.ts', '.tsx'],
      },
    },
    rules: {
      // old rules
      quotes: ['error', 'single', { avoidEscape: true }],
      eqeqeq: ['error', 'smart'],
      'prefer-rest-params': 'off',
      'yet-another-license-header/header': [
        'error',
        {
          header: defaultLicense,
          allowedHeaderPatterns: [licensePattern],
        },
      ],

      // new rules
      'no-unused-vars': 'warn',
      'node/no-deprecated-api': 'warn',
    },
  },

  // TypeScript strict rules
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    // turn on when we can check types
    // extends: [...tseslint.configs.recommendedTypeChecked],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true,
      },
    },
    rules: {
      // 'node/no-missing-import': 'off',

      // things that should be repaired
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],

      // old rules
      // this is a replacement for the deprecated ban-types rules
      '@typescript-eslint/no-restricted-types': [
        'warn',
        {
          types: {
            Function: 'fix',
          },
        },
      ],
      // TODO: fix inheritance
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'memberLike',
          modifiers: ['private', 'protected'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
      ],
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-inferrable-types': [
        'error',
        { ignoreProperties: true },
      ],
      '@typescript-eslint/no-empty-function': ['off'],
      '@typescript-eslint/no-shadow': ['warn'],
      'prefer-rest-params': 'off',
    },
  },

  // Test files have relaxed rules
  {
    files: ['**/test/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-shadow': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      'no-empty': 'off',
    },
  },

  // ESM files
  {
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
    },
  },

  // Browser environment
  {
    files: [
      '**/examples/web/**/*',
      '**/packages/**/browser/**/*',
      '**/packages/instrumentation-user-interaction/**/*',
      '**/packages/instrumentation-document-load/**/*',
      '**/packages/instrumentation-long-task/**/*',
      '**/packages/plugin-react-load/**/*',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        Zone: 'readonly',
        Task: 'readonly',
      },
    },
  }
);

export default baseConfig;
