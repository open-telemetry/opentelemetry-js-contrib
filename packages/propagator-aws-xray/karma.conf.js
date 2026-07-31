/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const webpack = require('webpack');

const karmaWebpackConfig = require('../../karma.webpack');
const karmaBaseConfig = require('../../karma.base');

module.exports = config => {
  {
    const plugins = (karmaWebpackConfig.plugins = []);
    plugins.push(
      new webpack.ProvidePlugin({
        process: 'process/browser',
      })
    );
  }

  {
    const plugins = (karmaBaseConfig.plugins = []);
    const rootPackageJson = require('../../package.json');
    const toAdd = Object.keys(rootPackageJson.devDependencies || {})
      .filter(packageName => packageName.startsWith('karma-'))
      .map(packageName => require(packageName));
    plugins.push(...toAdd);
  }

  config.set(
    Object.assign({}, karmaBaseConfig, {
      webpack: karmaWebpackConfig,
    })
  );
};
