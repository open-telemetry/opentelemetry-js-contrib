/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const webpack = require('webpack');
const { merge } = require('webpack-merge');
const path = require('path');

const directory = path.resolve(__dirname);

const common = {
  mode: 'development',
  entry: {
    'document-load': path.resolve(__dirname, 'examples/document-load/index.js'),
    meta: path.resolve(__dirname, 'examples/meta/index.js'),
    'user-interaction': path.resolve(
      __dirname,
      'examples/user-interaction/index.js'
    ),
    navigation: path.resolve(__dirname, 'examples/navigation/index.js'),
    'react-spa': path.resolve(__dirname, 'examples/react-spa/index.jsx'),
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
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    modules: [path.resolve(directory), 'node_modules'],
    extensions: ['.ts', '.js', '.jsx', '.json'],
  },
};

const devConfig = {
  devtool: 'eval-source-map',
  devServer: {
    static: [
      {
        directory: path.resolve(__dirname, 'examples'),
      },
      {
        directory: path.resolve(__dirname, 'dist'),
        publicPath: '/',
      },
    ],
    compress: true,
    port: 8090,
    hot: true,
    host: '0.0.0.0',
    historyApiFallback: {
      rewrites: [
        { from: /^\/navigation/, to: '/navigation/index.html' },
        { from: /^\/react-spa/, to: '/react-spa/index.html' },
      ],
    },
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('development'),
    }),
  ],
};

module.exports = merge(common, devConfig);
