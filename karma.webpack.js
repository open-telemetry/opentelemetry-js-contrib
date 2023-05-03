/*!
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const path = require('path');
const os = require('os');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');


// This is the webpack configuration for browser Karma tests with coverage.
module.exports = {
  mode: 'development',
  target: 'web',
  output: {
    filename: '[name].js',
    path: path.join(os.tmpdir(), '_karma_22_webpack_') + Math.floor(Math.random() * 1000000) ,
  },
  resolve: { extensions: ['.ts', '.js', '.tsx'] },
  devtool: 'inline-source-map',
  module: {
    rules: [
      { test: /\.tsx?$/, use: 'ts-loader' },
      {
        enforce: 'post',
        exclude: /(node_modules|\.test\.[tj]sx?$)/,
        test: /\.ts$/,
        use: {
          loader: '@jsdevtools/coverage-istanbul-loader',
          options: {
            produceSourceMap: false,
            esModules: true
          }
        }
      }
    ]
  },
  plugins: [
		new NodePolyfillPlugin()
	],
  optimization: {
    runtimeChunk: false,
    splitChunks: false
  }
};
