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
import * as path from 'path';
// eslint-disable-next-line node/no-unpublished-import
import * as HtmlWebpackPlugin from 'html-webpack-plugin';

// Read the environment variables, and check for the existence of the "MV" variable
// This can be used to only build the one or the other target.
module.exports = (env: { MV?: string; WEBPACK_BUILD: boolean }) => {
  // Build the extension for "Manifest Version 3" (Google Chrome only)
  const targetMV3 = {
    devtool: env.WEBPACK_BUILD ? false : 'inline-source-map',
    entry: {
      background: './src/background/index.ts',
      contentScript: './src/contentScript/index.ts',
      instrumentation: './src/instrumentation/index.ts',
      ui: './src/ui/index.tsx',
    },
    module: {
      rules: [
        {
          test: /manifest.json5$/,
          use: [
            {
              loader: 'null-loader',
              options: {},
            },
            {
              loader: path.resolve('src/utils/manifest-loader.ts'),
              options: {
                manifestVersion: 3,
              },
            },
          ],
        },
        {
          exclude: /node_modules/,
          test: /\.tsx?$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
                experimentalWatchApi: true,
              },
            },
          ],
        },
        {
          test: /\.(jpe?g|png|webp)$/i,
          use: [
            // We are not going to use any of the images for real, throw away all output
            {
              loader: 'null-loader',
              options: {},
            },
            {
              loader: 'responsive-loader',
              options: {
                name: '[name]_[width].[ext]',
                outputPath: 'icons/',
                sizes: [16, 32, 48, 128],
              },
            },
          ],
        },
      ],
    },
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, 'build/mv3'),
    },
    plugins: [
      new HtmlWebpackPlugin({
        chunks: ['ui'],
        inject: 'head',
        filename: 'options.html',
        template: 'src/template.html',
      }),
      new HtmlWebpackPlugin({
        chunks: ['ui'],
        filename: 'popup.html',
        inject: 'head',
        template: 'src/template.html',
      }),
    ],
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
  };

  // Build the extension for "Manifest Version 2" (Chromium, Firefox & others.)
  const targetMV2 = Object.assign({}, targetMV3, {
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, 'build/mv2'),
    },
  });

  targetMV2.module.rules[0].use[1].options = {
    manifestVersion: 2,
  };

  const exports = [];

  if (env.MV) {
    exports.push(Number(env.MV) === 2 ? targetMV2 : targetMV3);
  } else {
    exports.push(targetMV3);
    exports.push(targetMV2);
  }
  return exports;
};
