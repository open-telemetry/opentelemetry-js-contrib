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
 *
 * Copyright (c) 2025, Oracle and/or its affiliates.
 * */
const parentConfig = require('../../eslint.config.js');

module.exports = {
  extends: '../../eslint.config.js', // Extends the top-level config
  ignorePatterns: [
    ...(parentConfig.ignorePatterns || []), // Retain parent's ignorePatterns array
    'src/version.ts', // ignore this file
  ],
  env: {
    mocha: true,
    node: true,
  },
  rules: {
    'header/header': [
      'error',
      'block',
      [
        {
          pattern:
            /\* Copyright The OpenTelemetry Authors(?:, [^,\r\n]*)?[\r\n]+ \*[\r\n]+ \* Licensed under the Apache License, Version 2\.0 \(the "License"\);[\r\n]+ \* you may not use this file except in compliance with the License\.[\r\n]+ \* You may obtain a copy of the License at[\r\n]+ \*[\r\n]+ \* {6}https:\/\/www\.apache\.org\/licenses\/LICENSE-2\.0[\r\n]+ \*[\r\n]+ \* Unless required by applicable law or agreed to in writing, software[\r\n]+ \* distributed under the License is distributed on an "AS IS" BASIS,[\r\n]+ \* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied\.[\r\n]+ \* See the License for the specific language governing permissions and[\r\n]+ \* limitations under the License\.[\r\n]+ \*[\r\n]+ \* Copyright \(c\) 2025, Oracle and\/or its affiliates\.[\r\n]+ \*/gm,
          template: `
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
 *
 * Copyright (c) 2025, Oracle and/or its affiliates.
 * `,
        },
      ],
    ],
  },
};
