'use strict';

const semver = require('semver');

if (semver.satisfies(process.version, '>=12.0.0')) {
  module.exports = {
    spec: 'test/**/*.ts',
  };
} else {
  console.log(`Hapi instrumentation tests skipped for Node.js ${process.version} - unsupported by Hapi`);
  module.exports = {};
}
