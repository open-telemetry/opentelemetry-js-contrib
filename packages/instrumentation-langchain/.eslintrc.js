// module.exports = {
//     "env": {
//         "mocha": true,
//         "node": true
//     },
//     ...require('../../eslint.config.js')
// }


module.exports = {
  "env": {
    "mocha": true,
    "node": true
  },
  "extends": "../../eslint.config.js",
  "ignorePatterns": ["dist/", "*.d.ts"],
  "root": true
};