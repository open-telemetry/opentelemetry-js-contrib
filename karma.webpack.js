/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const webpack = require('webpack');

// This is the webpack configuration for browser Karma tests with coverage.
module.exports = {
  mode: 'development',
  target: 'web',
  output: { filename: 'bundle.js' },
  resolve: {
    extensions: ['.ts', '.js', '.tsx'],
    alias: {
      // Some ESM packages (e.g., sinon-esm) import 'process/browser' directly and require full path resolution
      'process/browser': require.resolve('process/browser'),
    },
    fallback: {
      // Enable the assert library polyfill because that is used in tests
      assert: require.resolve('assert/'),
      util: require.resolve('util/'),
      // Polyfill Node's process for browser bundles
      process: require.resolve('process/browser'),
      // Only node-only platform code uses `path`; browser code paths never reach
      // it. If that breaks: `TypeError: path.normalize is not a function`.
      path: false,
    },
  },
  devtool: 'eval-source-map',
  plugins: [
    // Karma+webpack bundles each package's src/ directly, so package.json#browser
    // doesn't apply; rewrite platform(/index) requests to /browser/ equivalents.
    new webpack.NormalModuleReplacementPlugin(
      /(^|[\\/])platform([\\/]index(\.ts)?)?$/,
      function (resource) {
        if (/[\\/]browser([\\/]|$)/.test(resource.request)) return;
        const issuer = resource.contextInfo && resource.contextInfo.issuer;
        if (!issuer || /[\\/]node_modules[\\/]/.test(issuer)) return;
        const original = resource.request;
        const rewritten = original.replace(
          /platform([\\/]index(?:\.ts)?)?$/,
          'platform/browser$1'
        );
        if (rewritten === original) {
          throw new Error(
            `karma platform-swap: outer regex matched ${JSON.stringify(original)} ` +
              'but inner replace did not rewrite it. The two regexes have drifted out of sync.'
          );
        }
        resource.request = rewritten;
      }
    ),
    new webpack.ProvidePlugin({
      // Make a global `process` variable that points to the `process` package,
      // because the `util` package expects there to be a global variable named `process`.
      // Thanks to https://stackoverflow.com/a/65018686/14239942
      // NOTE: I wish there was a better way as this pollutes the tests with a defined 'process' global.
      process: 'process/browser.js',
    }),
  ],
  module: {
    rules: [
      { test: /\.tsx?$/, use: 'ts-loader' },
      {
        test: /\.js$/,
        exclude: {
          and: [/node_modules/], // Exclude libraries in node_modules ...
          not: [
            // Except for a few of them that needs to be transpiled because they use modern syntax
            /zone.js/,
          ],
        },
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
      {
        enforce: 'post',
        exclude: /(node_modules|\.test\.[tj]sx?$)/,
        test: /\.ts$/,
        use: {
          loader: 'babel-loader',
          options: {
            plugins: ['babel-plugin-istanbul'],
          },
        },
      },
    ],
  },
};
