/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const assert = require('node:assert/strict');
const { gunzipSync } = require('node:zlib');
const pprof = require('@datadog/pprof');
const {
  Function: PprofFunction,
  Line,
  Location,
  Mapping,
  Profile,
  Sample,
  StringTable,
  ValueType,
} = require('pprof-format');

describe('NodeProfiling', () => {
  let exporter;
  let exportedBatches;
  let originals;
  let timeProfileCalls;

  beforeEach(() => {
    exportedBatches = [];
    timeProfileCalls = [];
    exporter = {
      export: async batch => {
        exportedBatches.push(batch);
      },
    };

    originals = {
      heapProfile: pprof.heap.profile,
      heapStart: pprof.heap.start,
      heapStop: pprof.heap.stop,
      timeProfile: pprof.time.profile,
    };

    pprof.time.profile = async options => {
      timeProfileCalls.push(options);
      return makeProfile({
        sampleTypes: options.collectCpuTime
          ? [
              ['sample', 'count', 3],
              ['wall', 'nanoseconds', 30],
              ['cpu', 'nanoseconds', 20],
            ]
          : [
              ['sample', 'count', 3],
              ['wall', 'nanoseconds', 30],
            ],
      });
    };
    pprof.heap.start = () => {};
    pprof.heap.profile = () =>
      makeProfile({
        sampleTypes: [
          ['objects', 'count', 7],
          ['space', 'bytes', 70],
        ],
      });
    pprof.heap.stop = () => {};
  });

  afterEach(() => {
    pprof.heap.profile = originals.heapProfile;
    pprof.heap.start = originals.heapStart;
    pprof.heap.stop = originals.heapStop;
    pprof.time.profile = originals.timeProfile;
  });

  function loadNodeProfiling() {
    const profilerModulePath = require.resolve('../src/profiler');
    delete require.cache[profilerModulePath];
    return require('../src/profiler').NodeProfiling;
  }

  async function collectWith(options = {}) {
    const NodeProfiling = loadNodeProfiling();
    const profiler = new NodeProfiling({
      exporter,
      intervalMillis: 10_000,
      wallDurationMillis: 1_000,
      profileTypes: ['wall', 'heap'],
      ...options,
    });

    await profiler.collectOnce();

    assert.equal(timeProfileCalls.length, 1);
    assert.equal(exportedBatches.length, 1);

    return exportedBatches[0];
  }

  it('默认会在 wall profile 中启用 cpu time 采集', async () => {
    const batch = await collectWith();
    const decoded = batch.profiles.map(profile => [
      profile.filename,
      readSampleTypes(decodeProfile(profile.data)),
    ]);

    assert.deepEqual(timeProfileCalls[0], {
      durationMillis: 1_000,
      collectCpuTime: true,
      useCPED: true,
      withContexts: true,
    });
    assert.deepEqual(
      batch.profiles.map(profile => [profile.type, profile.filename]),
      [
        ['wall', 'wall.pprof'],
        ['space', 'space.pprof'],
      ]
    );
    assert.deepEqual(decoded, [
      [
        'wall.pprof',
        ['sample/count', 'cpu/nanoseconds', 'wall/nanoseconds'],
      ],
      ['space.pprof', ['objects/count', 'space/bytes']],
    ]);
  });

  it('cpuProfilingEnabled=false 时会关闭 cpu time 采集', async () => {
    const batch = await collectWith({
      cpuProfilingEnabled: false,
    });
    const decoded = batch.profiles.map(profile => [
      profile.filename,
      readSampleTypes(decodeProfile(profile.data)),
    ]);

    assert.deepEqual(timeProfileCalls[0], {
      durationMillis: 1_000,
      collectCpuTime: false,
      useCPED: false,
      withContexts: false,
    });
    assert.deepEqual(decoded, [
      ['wall.pprof', ['sample/count', 'wall/nanoseconds']],
      ['space.pprof', ['objects/count', 'space/bytes']],
    ]);
  });

  it('仍兼容已废弃的 collectCpuTime 配置', async () => {
    await collectWith({
      collectCpuTime: false,
    });

    assert.deepEqual(timeProfileCalls[0], {
      durationMillis: 1_000,
      collectCpuTime: false,
      useCPED: false,
      withContexts: false,
    });
  });

  it('cpuProfilingEnabled 的优先级高于 collectCpuTime', async () => {
    await collectWith({
      cpuProfilingEnabled: true,
      collectCpuTime: false,
    });

    assert.deepEqual(timeProfileCalls[0], {
      durationMillis: 1_000,
      collectCpuTime: true,
      useCPED: true,
      withContexts: true,
    });
  });
});

function makeProfile({ sampleTypes }) {
  const strings = new StringTable();
  const fn = new PprofFunction({
    id: 1,
    name: strings.dedup('handler'),
    systemName: strings.dedup('handler'),
    filename: strings.dedup('app.js'),
    startLine: 1,
  });
  const mapping = new Mapping({
    id: 1,
    hasFunctions: true,
    hasFilenames: true,
    hasLineNumbers: true,
    hasInlineFrames: true,
  });
  const location = new Location({
    id: 1,
    mappingId: 1,
    address: 1,
    line: [
      new Line({
        functionId: 1,
        line: 1,
      }),
    ],
  });

  return new Profile({
    sampleType: sampleTypes.map(
      ([type, unit]) =>
        new ValueType({
          type: strings.dedup(type),
          unit: strings.dedup(unit),
        })
    ),
    sample: [
      new Sample({
        locationId: [1],
        value: sampleTypes.map(([, , value]) => value),
      }),
    ],
    mapping: [mapping],
    location: [location],
    function: [fn],
    stringTable: strings,
    timeNanos: 1n,
    durationNanos: 10n,
  });
}

function decodeProfile(buffer) {
  return Profile.decode(gunzipSync(buffer));
}

function readSampleTypes(profile) {
  const strings = Array.isArray(profile.stringTable.strings)
    ? profile.stringTable.strings
    : profile.stringTable;
  return profile.sampleType.map(
    valueType =>
      `${strings[Number(valueType.type)]}/${strings[Number(valueType.unit)]}`
  );
}
