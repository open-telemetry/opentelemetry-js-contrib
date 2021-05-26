module.exports = {
  "env": {
    "mocha": true,
    "commonjs": true,
    "browser": true,
    "jquery": true
  },
  "ignorePatterns": [
    ".eslintrc.js",
    "build/*",
    "ts-build/*"
  ],
  plugins: [
    "@typescript-eslint",
    "json5",
    "header"
  ],
  ...require('../../eslint.config.js')
};
