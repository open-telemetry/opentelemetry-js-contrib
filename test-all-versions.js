#!/usr/bin/env node
'use strict';

const { exec, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const util = require('util');
const https = require('https');
const isCI = require('is-ci');
const yaml = require('js-yaml');
const once = require('once');
const merge = require('deepmerge');
const pkgVersions = require('npm-package-versions');
const parseEnvString = require('parse-env-string');
const semver = require('semver');
const afterAll = require('after-all-results');
const resolve = require('resolve');
const importFresh = require('import-fresh');
const install = require('spawn-npm-install');
const differ = require('ansi-diff-stream');
const cliSpinners = require('cli-spinners');
const which = require('which');
const argv = require('minimist')(process.argv.slice(2));

const npm5plus = semver.gte(
  execSync('npm -v', { encoding: 'utf-8' }).trim(),
  '5.0.0'
);

// in case npm ever gets installed as a dependency, make sure we always access
// it from it's original location
const npmCmd = which.sync(process.platform === 'win32' ? 'npm.cmd' : 'npm');

process.env.PATH =
  'node_modules' + require('path').sep + '.bin:' + process.env.PATH;

if (argv.help || argv.h) {
  console.log('Usage: tav [options] [<module> <semver> <command> [args...]]');
  console.log();
  console.log('Options:');
  console.log('  -h, --help        show this help');
  console.log('  -v, --version     show the tav version and exit');
  console.log(
    "  -q, --quiet       don't output stdout from tests unless an error occurs"
  );
  console.log(
    '  --registry=<url>  use a custom registry (e.g. --registry=https://registry.example.com)'
  );
  console.log('  --verbose         output a lot of information while running');
  console.log('  --dry-run         do a dry-run (no tests will be executed)');
  console.log(
    '  --compat          output just module version compatibility - no errors'
  );
  console.log(
    '  --ci              only run on CI servers when using .tav.yml file'
  );
  process.exit();
} else if (argv.version || argv.v) {
  console.log('tav ' + require('./package.json').version);
  process.exit();
}

const tests = argv._.length === 0 ? getConfFromFile() : getConfFromArgs();

let log, verbose, spinner, logSymbols, diff;
if (argv.compat) {
  logSymbols = require('log-symbols');
  // "hack" to make the spinner spin more
  log = verbose = function () {
    spinner && spinner();
  };
  diff = differ();
  diff.pipe(process.stdout);
} else {
  verbose = argv.verbose ? console.log.bind(console) : function () {};
  log = console.log.bind(console);
}

runTests();

function getConfFromFile() {
  return normalizeConf(loadYaml());
}

function getConfFromArgs() {
  return normalizeConf({
    [argv._.shift()]: {
      // module name
      versions: argv._.shift(), // module semver
      commands: argv._.join(' '), // test command
    },
  });
}

function loadYaml() {
  return yaml.load(fs.readFileSync('.tav.yml').toString());
}

function normalizeConf(conf) {
  const whitelist = process.env.TAV?.split(',');

  return flatten(
    Object.keys(conf)
      .filter(function (name) {
        // Only run selected test if TAV environment variable is used
        return whitelist ? whitelist.indexOf(name) !== -1 : true;
      })
      .map(function (name) {
        const moduleConf = conf[name];
        const normalized = { name, env: moduleConf.jobs && moduleConf.env };
        normalized.jobs = moduleConf.jobs || toArray(moduleConf);
        return normalized;
      })
      .map(function ({ name, env: globalEnv, jobs }) {
        return flatten(
          jobs
            .filter(
              job => !job.node || semver.satisfies(process.version, job.node)
            )
            .map(job => {
              if (!job.versions)
                throw new Error(`Missing "versions" property for ${name}`);

              job.name = name;
              job.commands = toArray(job.commands);
              job.peerDependencies = toArray(job.peerDependencies);

              return mergeEnvMatrix(globalEnv, job.env).map(env => {
                job.env = parseEnvString(env);
                return merge({}, job);
              });
            })
        );
      })
  );
}

function mergeEnvMatrix(globalEnv, localEnv) {
  globalEnv = toArray(globalEnv);
  if (globalEnv.length === 0) globalEnv.push('');
  localEnv = toArray(localEnv);
  if (localEnv.length === 0) localEnv.push('');

  const env = [];

  for (const e1 of globalEnv) {
    for (const e2 of localEnv) {
      env.push(e1 + ' ' + e2);
    }
  }

  return env;
}

function runTests(err) {
  if (argv.ci && !isCI) return;
  if (err || tests.length === 0) return done(err);
  test(tests.pop(), runTests);
}

function test(opts, cb) {
  verbose('-- preparing test', opts);

  if (argv.compat) console.log('Testing compatibility with %s:', opts.name);

  pkgVersions(
    opts.name,
    argv.registry || opts.registry,
    function (err, versions) {
      if (err) return cb(err);

      verbose(
        '-- %d available package versions:',
        versions.length,
        versions.join(', ')
      );
      verbose(
        '-- applying version filter to available packages:',
        opts.versions
      );

      filterVersions(opts, versions, (err, versions) => {
        if (err) return cb(err);

        verbose(
          '-- %d package versions matching filter:',
          versions.length,
          versions.join(', ')
        );

        if (versions.length === 0) {
          cb(
            new Error(
              `No versions of ${opts.name} matching filter: ${opts.versions}`
            )
          );
          return;
        }

        run();

        function run(err) {
          if (err || versions.length === 0) return cb(err);
          const version = versions.pop();
          if (argv.compat) spinner = getSpinner(version)();
          testVersion(opts, version, function (err) {
            if (argv.compat) {
              spinner.done(!err);
              run();
            } else {
              run(err);
            }
          });
        }
      });
    }
  );
}

function testVersion(test, version, cb) {
  let cmdIndex = 0;

  preinstall(function (err) {
    if (err) return cb(err);
    const packages = [...test.peerDependencies, `${test.name}@${version}`];
    ensurePackages(packages, test.registry, runNextCmd);
  });

  function runNextCmd(err) {
    if (err || cmdIndex === test.commands.length) return cb(err);

    pretest(function (err) {
      if (err) return cb(err);

      testCmd(
        test.name,
        version,
        test.commands[cmdIndex++],
        test.env,
        function (code) {
          if (code !== 0) {
            const err = new Error(`Test exited with code ${code}`);
            err.exitCode = code;
            return cb(err);
          }
          posttest(runNextCmd);
        }
      );
    });
  }

  function preinstall(cb) {
    if (!test.preinstall) return process.nextTick(cb);
    log('-- running preinstall "%s" for %s', test.preinstall, test.name);
    execute(test.preinstall, test.name, cb);
  }

  function pretest(cb) {
    if (!test.pretest) return process.nextTick(cb);
    log('-- running pretest "%s" for %s', test.pretest, test.name);
    execute(test.pretest, test.name, cb);
  }

  function posttest(cb) {
    if (!test.posttest) return process.nextTick(cb);
    log('-- running posttest "%s" for %s', test.posttest, test.name);
    execute(test.posttest, test.name, cb);
  }
}

function testCmd(name, version, cmd, env, cb) {
  log('-- running test "%s" with %s (env: %O)', cmd, name, env);
  const opts = { env: Object.assign({}, env, process.env) };
  execute(cmd, name + '@' + version, opts, cb);
}

function execute(cmd, name, opts, cb) {
  if (typeof opts === 'function') return execute(cmd, name, null, opts);

  if (argv['dry-run']) {
    // Dry-run.
    setImmediate(cb, 0);
    return;
  }

  let stdout = '';
  const cp = exec(cmd, opts);
  cp.on('close', function (code) {
    if (code !== 0) {
      log('-- detected failing command, flushing stdout...');
      log(stdout);
    }
    cb(code);
  });
  cp.on('error', function (err) {
    console.error('-- error running "%s" with %s', cmd, name);
    console.error(err.stack);
    cb(err.code || 1);
  });
  if (argv.compat) {
    // "hack" to make the spinner move
    cp.stdout.on('data', spinner);
    cp.stderr.on('data', spinner);
  } else {
    if (!argv.quiet && !argv.q) {
      cp.stdout.pipe(process.stdout);
    } else {
      // store output in case we needed if an error occurs
      cp.stdout.on('data', function (chunk) {
        stdout += chunk;
      });
    }
    cp.stderr.pipe(process.stderr);
  }
}

function ensurePackages(packages, registry, cb) {
  log('-- required packages %j', packages);

  if (npm5plus) {
    // npm5 will uninstall everything that's not in the local package.json and
    // not in the install string. This might make tests fail. So if we detect
    // npm5, we just force install everything all the time.
    attemptInstall(packages, registry, cb);
    return;
  }

  const next = afterAll(function (_, packages) {
    packages = packages.filter(function (pkg) {
      return !!pkg;
    });
    if (packages.length > 0) attemptInstall(packages, registry, cb);
    else cb();
  });

  packages.forEach(function (dependency) {
    const done = next();
    const parts = dependency.split('@');
    const name = parts[0];
    const version = parts[1];

    verbose('-- resolving %s/package.json in %s', name, process.cwd());

    resolve(
      name + '/package.json',
      { basedir: process.cwd() },
      function (err, pkg) {
        const installedVersion = err ? null : importFresh(pkg).version;

        verbose('-- installed version:', installedVersion);

        if (installedVersion && semver.satisfies(installedVersion, version)) {
          log('-- reusing already installed %s', dependency);
          done();
          return;
        }

        done(null, dependency);
      }
    );
  });
}

function attemptInstall(packages, registry, cb, attempts = 1) {
  log('-- installing %j', packages);
  if (argv['dry-run']) {
    // Dry-run.
    setImmediate(cb, 0);
    return;
  }

  /** @type {(err?: Error) => void} */
  const done = once(function (err) {
    clearTimeout(timeout);

    if (!err) return cb();

    if (++attempts <= 10) {
      console.warn(
        '-- error installing %j (%s) - retrying (%d/10)...',
        packages,
        err.message,
        attempts
      );
      attemptInstall(packages, registry, cb, attempts);
    } else {
      console.error('-- error installing %j - aborting!', packages);
      console.error(err.stack);
      cb(err.code || 1);
    }
  });

  const opts = { noSave: true, command: npmCmd };
  if (argv.verbose) opts.stdio = 'inherit';
  if (argv.registry || registry) opts.registry = argv.registry || registry;

  // npm on Travis have a tendency to hang every once in a while
  // (https://twitter.com/wa7son/status/1006859826549477378). We'll use a
  // timeout to abort and retry the install in case it hasn't finished within 2
  // minutes.
  const timeout = setTimeout(function () {
    done(new Error('npm install took too long'));
  }, 2 * 60 * 1000);

  install(packages, opts, done).on('error', done);
}

function getSpinner(str) {
  const frames = cliSpinners.dots.frames;
  let i = 0;
  const spin = function () {
    if (spin.isDone) return spin;
    diff.write(util.format('%s %s', frames[i++ % frames.length], str));
    return spin;
  };
  spin.done = function (success) {
    diff.write(
      util.format('%s %s', success ? logSymbols.success : logSymbols.error, str)
    );
    diff.reset();
    spin.isDone = true;
    process.stdout.write(os.EOL);
  };
  return spin;
}

function done(err) {
  if (err) {
    console.error('-- fatal: ' + err.message);
    process.exit(err.exitCode || 1);
  }
  log('-- ok');
}

function toArray(obj) {
  return Array.isArray(obj) ? obj : obj == null ? [] : [obj];
}

function flatten(arr) {
  return Array.prototype.concat.apply([], arr);
}

function filterVersions(opts, versions, cb) {
  const includeVersions = opts.versions.include ?? opts.versions;
  const excludeVersions = opts.versions.exclude;
  const mode = opts.versions.mode;

  versions = versions.filter(function (version) {
    return (
      semver.satisfies(version, includeVersions) &&
      !semver.satisfies(version, excludeVersions)
    );
  });

  switch (mode) {
    case undefined:
    case 'all':
      return cb(null, versions);
    case 'latest-majors':
      return cb(null, getLatestMajors(versions));
    case 'latest-minors':
      return cb(null, getLatestMinors(versions));
    default: {
      const result = mode.match(
        /^max-(?<max>\d+)(-(?<algo>evenly|random|latest|popular))?$/
      );
      if (!result) return cb(new Error(`Unknown mode: ${mode}`));
      const max = parseInt(result.groups.max, 10);
      if (max < 2) return cb(new Error('max-{N}: N has to be larger than 2'));
      if (max >= versions.length - 2) return cb(null, versions);
      switch (result.groups.algo ?? 'evenly') {
        case 'evenly':
          return cb(null, getMaxEvenly(versions, max));
        case 'random':
          return cb(null, getMaxRandom(versions, max));
        case 'latest':
          return cb(null, versions.slice(max * -1));
        case 'popular':
          return getMaxPopular(opts.name, versions, max, cb);
      }
    }
  }
}

/**
 * From a given ordered list of versions returns the first, num in between and last. Example
 * - input: ['5.0.0', '5.0.1', '5.1.0', '5.2.0', '5.3.0', '5.4.0', '5.5.0', '5.6.0', '5.7.0', '5.8.0', '5.8.1', '5.9.0']
 * - input: num = 5
 * - output: ['5.0.0', '5.1.0', '5.3.0', '5.5.0', '5.7.0', '5.8.1', '5.9.0']
 *             first   ^^^^^^^^^ 3 version in between ^^^^^^^^^^^^    last
 */
function getMaxEvenly(versions, max) {
  const spacing = (versions.length - 2) / (max - 2);
  const indicies = new Set([0, versions.length - 1]);
  for (let n = 1; n <= max - 2; n++) {
    indicies.add(Math.floor(spacing * n) - 1);
  }
  return versions.filter((_, index) => indicies.has(index));
}

function getMaxRandom(versions, max) {
  const indicies = new Set();
  while (indicies.size < max) {
    indicies.add(Math.floor(Math.random() * versions.length));
  }
  return versions.filter((_, index) => indicies.has(index));
}

/**
 * Get the most popular versions of a package from the npm registry. Popularity is
 * based on the number of downloads in the last week.
 *
 * @param {string} name - The name of the package to get the popular versions for
 * @param {string[]} versions - The versions to filter
 * @param {number} max - The maximum number of versions to return
 * @param {function(Error?, string[]): void} cb - The callback to call with the result
 */
function getMaxPopular(name, versions, max, cb) {
  https.get(`https://api.npmjs.org/versions/${name}/last-week`, res => {
    const buffers = [];
    const done = once(cb);

    res.on('error', done);
    res.on('data', chunk => buffers.push(chunk));
    res.on('end', () => {
      const downloads = Object.entries(
        JSON.parse(Buffer.concat(buffers).toString()).downloads
      );
      done(
        null,
        downloads
          .filter(a => versions.includes(a[0]))
          .sort((a, b) => b[1] - a[1])
          .slice(0, max)
          .map(a => a[0])
      );
    });
  });
}

function getLatestMajors(versions) {
  return versions
    .map(semver.parse)
    .sort(semver.rcompare)
    .reduce((result, version) => {
      const smallestSeenMajor = result[0]?.major ?? Number.MAX_SAFE_INTEGER;
      if (version.major < smallestSeenMajor) result.unshift(version);
      return result;
    }, [])
    .map(v => v.raw);
}

function getLatestMinors(versions) {
  return versions
    .map(semver.parse)
    .sort(semver.rcompare)
    .reduce((result, version) => {
      const smallestSeenMajor = result[0]?.major ?? Number.MAX_SAFE_INTEGER;
      const smallestSeenMinor = result[0]?.minor ?? Number.MAX_SAFE_INTEGER;
      if (
        version.major < smallestSeenMajor ||
        version.minor < smallestSeenMinor
      )
        result.unshift(version);
      return result;
    }, [])
    .map(v => v.raw);
}
