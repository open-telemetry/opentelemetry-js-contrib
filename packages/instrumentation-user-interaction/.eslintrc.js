module.exports = {
    "env": {
        "mocha": true,
        "commonjs": true,
        "browser": true,
        "jquery": true
    },
    "globals": {
        "Zone": "readonly"
    },
    ...require('../../eslint.config.js')
}
