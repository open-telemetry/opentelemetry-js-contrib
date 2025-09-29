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

'use strict';

const webpack = require('webpack');
const webpackMerge = require('webpack-merge');
const path = require('path');

const directory = path.resolve(__dirname);

const common = {
  mode: 'development',
  entry: {
    'document-load': 'examples/document-load/index.js',
    meta: 'examples/meta/index.js',
    'user-interaction': 'examples/user-interaction/index.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    // sourceMapFilename: '[file].map',
  },
  target: 'web',
  module: {
    rules: [
      {
        test: /\.js[x]?$/,
        exclude: /(node_modules)/,
        use: {
          loader: 'babel-loader',
        },
      },
      {
        test: /\.ts$/,
        exclude: /(node_modules)/,
        use: {
          loader: 'ts-loader',
        },
      },
    ],
  },
  resolve: {
    modules: [path.resolve(directory), 'node_modules'],
    extensions: ['.ts', '.js', '.jsx', '.json'],
  },
};

module.exports = webpackMerge(common, {
  devtool: 'eval-source-map',
  devServer: {
    static: path.resolve(path.join(__dirname, 'examples')),
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('development'),
    }),
  ],
});
