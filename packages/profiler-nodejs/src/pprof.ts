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

import { gzipSync } from 'node:zlib';

import type { Profile, StringTable } from 'pprof-format';

import type { CollectedProfile, NodeProfileType } from './types';

type SourceProfile = {
  type: NodeProfileType;
  profile: Profile;
};

type ExportDefinition = {
  filename: string;
  profileType: NodeProfileType;
  sampleTypes: Array<{ sourceType: string; sourceUnit: string }>;
};

const EXPORT_DEFINITIONS: ExportDefinition[] = [
  {
    filename: 'wall.pprof',
    profileType: 'wall',
    sampleTypes: [
      { sourceType: 'sample', sourceUnit: 'count' },
      { sourceType: 'cpu', sourceUnit: 'nanoseconds' },
      { sourceType: 'wall', sourceUnit: 'nanoseconds' },
    ],
  },
  {
    filename: 'space.pprof',
    profileType: 'heap',
    sampleTypes: [
      { sourceType: 'objects', sourceUnit: 'count' },
      { sourceType: 'space', sourceUnit: 'bytes' },
    ],
  },
];

export function buildDatakitCompatibleNodeProfiles(
  profiles: SourceProfile[]
): CollectedProfile[] {
  const byType = new Map<NodeProfileType, Profile>();
  for (const source of profiles) {
    byType.set(source.type, source.profile);
  }

  const exported: CollectedProfile[] = [];
  for (const definition of EXPORT_DEFINITIONS) {
    const profile = byType.get(definition.profileType);
    if (profile === undefined) {
      continue;
    }
    exported.push(buildFilteredProfile(profile, definition));
  }

  if (exported.length === 0) {
    throw new Error('no compatible Node.js profiles were produced');
  }

  return exported;
}

function buildFilteredProfile(
  profile: Profile,
  definition: ExportDefinition
): CollectedProfile {
  const strings = getStringEntries(profile.stringTable);
  const sampleTypeIndices = definition.sampleTypes
    .map(sampleType => findSampleTypeIndex(profile, strings, sampleType))
    .filter((idx): idx is number => idx !== -1);

  if (sampleTypeIndices.length === 0) {
    throw new Error(`profile ${definition.profileType} did not contain expected sample types`);
  }

  const originalSampleType = profile.sampleType;
  const originalSampleValues = profile.sample.map(sample => sample.value);
  const originalDefaultSampleType = profile.defaultSampleType;

  try {
    profile.sampleType = sampleTypeIndices.map(idx => originalSampleType[idx]);
    for (const sample of profile.sample) {
      sample.value = sampleTypeIndices.map(idx => sample.value[idx] ?? 0);
    }

    if (profile.sampleType.length > 0) {
      profile.defaultSampleType = profile.sampleType[0].type;
    }

    return {
      type: definition.filename.replace(/\.pprof$/, ''),
      filename: definition.filename,
      data: Buffer.from(gzipSync(profile.encode())),
    };
  } finally {
    profile.sampleType = originalSampleType;
    for (let idx = 0; idx < profile.sample.length; idx++) {
      profile.sample[idx].value = originalSampleValues[idx];
    }
    profile.defaultSampleType = originalDefaultSampleType;
  }
}

function findSampleTypeIndex(
  profile: Profile,
  strings: string[],
  sampleType: { sourceType: string; sourceUnit: string }
): number {
  return profile.sampleType.findIndex(
    valueType =>
      strings[Number(valueType.type)] === sampleType.sourceType &&
      strings[Number(valueType.unit)] === sampleType.sourceUnit
  );
}

function getStringEntries(table: StringTable): string[] {
  const withStrings = table as StringTable & { strings?: string[] };
  if (Array.isArray(withStrings.strings)) {
    return withStrings.strings;
  }
  return table as unknown as string[];
}
