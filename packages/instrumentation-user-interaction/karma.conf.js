/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const karmaWebpackConfig = require('../../karma.webpack');
const karmaBaseConfig = require('../../karma.base');

module.exports = config => {
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
