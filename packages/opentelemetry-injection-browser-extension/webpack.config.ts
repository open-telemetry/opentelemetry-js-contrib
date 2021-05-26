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

// Build the extension for "Manifest Version 3" (Google Chrome only)
const targetMV3 = {
  entry: {
    ui: './src/ui/index.tsx',
    instrumentation: './src/instrumentation/index.ts',
    background: './src/background/index.ts',
    contentScript: './src/contentScript/index.ts',
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'build/mv3'),
  },
  plugins: [
    new HtmlWebpackPlugin({
      chunks: ['ui'],
      inject: 'head',
      template: 'src/template.html',
      filename: 'popup.html',
    }),
    new HtmlWebpackPlugin({
      chunks: ['ui'],
      inject: 'head',
      template: 'src/template.html',
      filename: 'options.html',
    }),
  ],
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
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
        test: /\.(jpe?g|png|webp)$/i,
        use: [
          // We are not going to use any of the images for real, throw away all output
          'null-loader',
          {
            loader: 'responsive-loader',
            options: {
              sizes: [16, 32, 48, 128],
              outputPath: 'icons/',
              name: '[name]_[width].[ext]',
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
};

// Build the extension for "Manifest Version 3" (Chromium, Firefox & others.)
const targetMV2 = Object.assign({}, targetMV3, {
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'build/mv2'),
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            experimentalWatchApi: true,
          },
        },
        exclude: /node_modules/,
      },
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
              manifestVersion: 2,
            },
          },
        ],
      },
      {
        test: /\.(jpe?g|png|webp)$/i,
        use: [
          // We are not going to use any of the images for real, throw away all output
          'null-loader',
          {
            loader: 'responsive-loader',
            options: {
              sizes: [16, 32, 48, 128],
              outputPath: 'icons/',
              name: '[name]_[width].[ext]',
            },
          },
        ],
      },
    ],
  },
});

// Read the environment variables, and check for the existence of the "MV" variable
// This can be used to only build the one or the other target.
module.exports = (env: { MV?: string }) => {
  const exports = [];

  if (env.MV) {
    exports.push(Number(env.MV) === 2 ? targetMV2 : targetMV3);
  } else {
    exports.push(targetMV3);
    exports.push(targetMV2);
  }

  return exports;
};
