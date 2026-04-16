/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
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
      '0::/system.slice/containerd.service/kubepods-burstable-pod2c4b2241-5c01-11e9-8e4e-42010a800002.slice:cri-containerd-1234567890abcdef.extra';
    const expected = '1234567890abcdef';
    assert.strictEqual(extractContainerIdFromLine(line), expected);
  });

  it('should return containerid for valid hex string with any length', () => {
    const line =
      '11:devices:/docker/1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde';
    assert.strictEqual(
      extractContainerIdFromLine(line),
      '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde'
    );
  });

  it('should extract container ID with additional suffix', () => {
    const line =
      '11:devices:/docker/1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef.suffix';
    const expected =
      '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    assert.strictEqual(extractContainerIdFromLine(line), expected);
  });
});
