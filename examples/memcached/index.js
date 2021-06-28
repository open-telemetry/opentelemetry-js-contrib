'use strict';

require('./tracer')('example-resource');
const Memcached = require('memcached');
const assert = require('assert');

const KEY = '_KEY_';
const VALUE = `RAND:${Math.random().toFixed(4)}`;
const LT = 10;
const client = new Memcached();

client.set(KEY, VALUE, LT, (err) => {
  assert.strictEqual(err, undefined);
  client.get(KEY, (err, result) => {
    assert.strictEqual(err, undefined);
    assert.strictEqual(result, VALUE);
    console.log('Sleeping 5 seconds before shutdown to ensure all records are flushed.');
    setTimeout(() => { console.log('Completed.'); }, 5000);
  });
});
