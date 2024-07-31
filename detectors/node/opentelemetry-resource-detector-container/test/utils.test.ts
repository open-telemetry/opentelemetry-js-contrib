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

import * as assert from 'assert';
import { extractContainerIdFromLine } from '../src/detectors/utils';

describe(' extractContainerId from line tests', () => {
  it('should extract container ID from crio-prefixed line', () => {
    const line =
      '11:devices:/kubepods.slice/kubepods-besteffort.slice/kubepods-besteffort-pod5c5979ec_6b2b_11e9_a923_42010a800002.slice/crio-1234567890abcdef.scope';
    const expected = '1234567890abcdef';
    assert.strictEqual(extractContainerIdFromLine(line), expected);
  });

  it('should extract container ID from docker-prefixed line', () => {
    const line =
      '11:devices:/docker/1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const expected =
      '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    assert.strictEqual(extractContainerIdFromLine(line), expected);
  });

  it('should extract container ID from cri-containerd-prefixed line', () => {
    const line =
      '11:devices:/kubepods/burstable/pod2c4b2241-5c01-11e9-8e4e-42010a800002/cri-containerd-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const expected =
      '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    assert.strictEqual(extractContainerIdFromLine(line), expected);
  });

  it('should handle containerd v1.5.0+ format with systemd cgroup driver', () => {
    const line =
      '0::/system.slice/containerd.service/kubepods-burstable-pod2c4b2241-5c01-11e9-8e4e-42010a800002.slice:cri-containerd:1234567890abcdef';
    const expected = '1234567890abcdef';
    assert.strictEqual(extractContainerIdFromLine(line), expected);
  });

  it('should return undefined for invalid container ID', () => {
    const line =
      '11:devices:/kubepods.slice/kubepods-besteffort.slice/kubepods-besteffort-pod5c5979ec_6b2b_11e9_a923_42010a800002.slice/invalid-id.scope';
    assert.strictEqual(extractContainerIdFromLine(line), undefined);
  });

  it('should return undefined for empty line', () => {
    const line = '';
    assert.strictEqual(extractContainerIdFromLine(line), undefined);
  });

  it('should return undefined for line without container ID', () => {
    const line = '11:devices:/';
    assert.strictEqual(extractContainerIdFromLine(line), undefined);
  });

  // Additional test cases
  it('should handle line with multiple colons', () => {
    const line =
      '0::/system.slice/containerd.service/kubepods-burstable-pod2c4b2241-5c01-11e9-8e4e-42010a800002.slice:cri-containerd:1234567890abcdef:extra';
    const expected = '1234567890abcdef';
    assert.strictEqual(extractContainerIdFromLine(line), expected);
  });

  it('should return undefined for valid hex string but incorrect length', () => {
    const line =
      '11:devices:/docker/1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde';
    assert.strictEqual(extractContainerIdFromLine(line), undefined);
  });

  it('should extract container ID with additional suffix', () => {
    const line =
      '11:devices:/docker/1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef.suffix';
    const expected =
      '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    assert.strictEqual(extractContainerIdFromLine(line), expected);
  });

  it('should extract container ID with additional prefix', () => {
    const line =
      '11:devices:/docker/prefix-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const expected =
      '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    assert.strictEqual(extractContainerIdFromLine(line), expected);
  });
});
