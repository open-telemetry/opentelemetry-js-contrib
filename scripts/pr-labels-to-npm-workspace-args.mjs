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

/**
 * Formats `-w WORKSPACE` arguments for `npm run` from "pkg:"-prefixed labels.
 * Takes a JSON string as an argument and returns the formatted args in stdout.
 *
 * arg: '["pkg:instrumentation-pino", "urgent", "pkg:instrumentation-fs"]'
 * stdout: '-w @opentelemetry/instrumentation-pino -w @opentelemetry/instrumentation-fs'
 */

const labels = JSON.parse(process.argv[2]);

console.error('Labels:', labels);

const workspaces = labels
  .filter(l => {
    return l.startsWith('pkg:');
  })
  .map(l => {
    return l.replace(/^pkg:/, '@opentelemetry/');
  });

console.error('Workspaces:', workspaces);

console.log(
  workspaces
    .map(w => {
      return `-w ${w}`;
    })
    .join(' ')
);
