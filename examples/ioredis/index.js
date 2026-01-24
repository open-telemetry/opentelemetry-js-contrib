'use strict';

// Require tracer before any other modules
require('./tracer');
const Redis = require('ioredis');

const redis = new Redis();

async function main() {
  try {
    await redis.set('test', 'data');
  } catch (error) {
    console.error(error);
  }

  // The process must live for at least the interval past any traces that
  // must be exported, or some risk being lost if they are recorded after the
  // last export.
  console.log('Sleeping 5 seconds before shutdown to ensure all records are flushed.');
  setTimeout(() => { console.log('Completed.'); }, 5000);
}

main();
