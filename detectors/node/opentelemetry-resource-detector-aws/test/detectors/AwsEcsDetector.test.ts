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
import * as nock from 'nock';
import * as sinon from 'sinon';
import { awsEcsDetector, AwsEcsDetectorSync } from '../../src';
import {
  assertEmptyResource,
  assertContainerResource,
} from '@opentelemetry/contrib-test-utils';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_AWS_ECS_CLUSTER_ARN,
  ATTR_AWS_ECS_CONTAINER_ARN,
  ATTR_AWS_ECS_LAUNCHTYPE,
  ATTR_AWS_ECS_TASK_ARN,
  ATTR_AWS_ECS_TASK_FAMILY,
  ATTR_AWS_ECS_TASK_REVISION,
  ATTR_AWS_LOG_GROUP_ARNS,
  ATTR_AWS_LOG_GROUP_NAMES,
  ATTR_AWS_LOG_STREAM_ARNS,
  ATTR_AWS_LOG_STREAM_NAMES,
  ATTR_CLOUD_ACCOUNT_ID,
  ATTR_CLOUD_AVAILABILITY_ZONE,
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_REGION,
  ATTR_CLOUD_RESOURCE_ID,
  CLOUD_PROVIDER_VALUE_AWS,
  CLOUD_PLATFORM_VALUE_AWS_ECS,
} from '../../src/semconv';
import { readFileSync } from 'fs';
import * as os from 'os';
import { join } from 'path';

interface EcsResourceAttributes {
  readonly accountId?: string;
  readonly region?: string;
  readonly zone?: string;
  readonly clusterArn?: string;
  readonly containerArn?: string;
  readonly launchType?: 'ec2' | 'fargate';
  readonly taskArn?: string;
  readonly taskFamily?: string;
  readonly taskRevision?: string;
  readonly logGroupNames?: Array<string>;
  readonly logGroupArns?: Array<string>;
  readonly logStreamNames?: Array<string>;
  readonly logStreamArns?: Array<string>;
}

const assertEcsResource = (
  resource: Resource,
  validations: EcsResourceAttributes
) => {
  assert.strictEqual(
    resource.attributes[ATTR_CLOUD_PROVIDER],
    CLOUD_PROVIDER_VALUE_AWS
  );
  assert.strictEqual(
    resource.attributes[ATTR_CLOUD_PLATFORM],
    CLOUD_PLATFORM_VALUE_AWS_ECS
  );
  if (validations.accountId) {
    assert.strictEqual(
      resource.attributes[ATTR_CLOUD_ACCOUNT_ID],
      validations.accountId
    );
  }
  if (validations.region) {
    assert.strictEqual(
      resource.attributes[ATTR_CLOUD_REGION],
      validations.region
    );
  }
  if (validations.zone) {
    assert.strictEqual(
      resource.attributes[ATTR_CLOUD_AVAILABILITY_ZONE],
      validations.zone
    );
  }
  if (validations.containerArn) {
    assert.strictEqual(
      resource.attributes[ATTR_AWS_ECS_CONTAINER_ARN],
      validations.containerArn
    );
    assert.strictEqual(
      resource.attributes[ATTR_CLOUD_RESOURCE_ID],
      validations.containerArn
    );
  }
  if (validations.clusterArn) {
    assert.strictEqual(
      resource.attributes[ATTR_AWS_ECS_CLUSTER_ARN],
      validations.clusterArn
    );
  }
  if (validations.launchType) {
    assert.strictEqual(
      resource.attributes[ATTR_AWS_ECS_LAUNCHTYPE],
      validations.launchType
    );
  }
  if (validations.taskArn) {
    assert.strictEqual(
      resource.attributes[ATTR_AWS_ECS_TASK_ARN],
      validations.taskArn
    );
  }
  if (validations.taskFamily) {
    assert.strictEqual(
      resource.attributes[ATTR_AWS_ECS_TASK_FAMILY],
      validations.taskFamily
    );
  }
  if (validations.taskRevision) {
    assert.strictEqual(
      resource.attributes[ATTR_AWS_ECS_TASK_REVISION],
      validations.taskRevision
    );
  }
  if (validations.logGroupNames) {
    assert.deepEqual(
      resource.attributes[ATTR_AWS_LOG_GROUP_NAMES],
      validations.logGroupNames
    );
  }
  if (validations.logGroupArns) {
    assert.deepEqual(
      resource.attributes[ATTR_AWS_LOG_GROUP_ARNS],
      validations.logGroupArns
    );
  }
  if (validations.logStreamNames) {
    assert.deepEqual(
      resource.attributes[ATTR_AWS_LOG_STREAM_NAMES],
      validations.logStreamNames
    );
  }
  if (validations.logStreamArns) {
    assert.deepEqual(
      resource.attributes[ATTR_AWS_LOG_STREAM_ARNS],
      validations.logStreamArns
    );
  }
};

describe('AwsEcsResourceDetector', () => {
  const errorMsg = {
    fileNotFoundError: new Error('cannot find cgroup file'),
  };

  const correctCgroupData =
    'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm';
  const unexpectedCgroupdata =
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const noisyCgroupData = `\n\n\n abcdefghijklmnopqrstuvwxyz \n ${correctCgroupData}`;
  const multiValidCgroupData = `${unexpectedCgroupdata}\n${correctCgroupData}\nbcd${unexpectedCgroupdata}`;
  const hostNameData = 'abcd.test.testing.com';

  let readStub;

  beforeEach(() => {
    process.env.ECS_CONTAINER_METADATA_URI_V4 = '';
    process.env.ECS_CONTAINER_METADATA_URI = '';
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should successfully return resource data with noisy cgroup file', async () => {
    process.env.ECS_CONTAINER_METADATA_URI = 'ecs_metadata_v3_uri';
    sinon.stub(os, 'hostname').returns(hostNameData);
    readStub = sinon
      .stub(AwsEcsDetectorSync, 'readFileAsync' as any)
      .resolves(noisyCgroupData);

    const resource = await awsEcsDetector.detect();
    await resource.waitForAsyncAttributes?.();

    sinon.assert.calledOnce(readStub);
    assert.ok(resource);
    assertEcsResource(resource, {});
    assertContainerResource(resource, {
      name: 'abcd.test.testing.com',
      id: 'bcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm',
    });
  });

  it('should always return first valid line of data', async () => {
    process.env.ECS_CONTAINER_METADATA_URI = 'ecs_metadata_v3_uri';
    sinon.stub(os, 'hostname').returns(hostNameData);
    readStub = sinon
      .stub(AwsEcsDetectorSync, 'readFileAsync' as any)
      .resolves(multiValidCgroupData);

    const resource = await awsEcsDetector.detect();
    await resource.waitForAsyncAttributes?.();

    sinon.assert.calledOnce(readStub);
    assert.ok(resource);
    assertEcsResource(resource, {});
    assertContainerResource(resource, {
      name: 'abcd.test.testing.com',
      id: 'bcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm',
    });
  });

  it('should empty resource without accessing files', async () => {
    sinon.stub(os, 'hostname').returns(hostNameData);
    readStub = sinon
      .stub(AwsEcsDetectorSync, 'readFileAsync' as any)
      .resolves(correctCgroupData);

    const resource = await awsEcsDetector.detect();
    await resource.waitForAsyncAttributes?.();

    sinon.assert.notCalled(readStub);
    assert.ok(resource);
    assertEmptyResource(resource);
  });

  describe('with Metadata URI v4 available', () => {
    const ECS_CONTAINER_METADATA_URI_V4 =
      'http://169.254.170.2/v4/96d36db6cf2942269b2c2c0c9540c444-4190541037';

    beforeEach(() => {
      process.env.ECS_CONTAINER_METADATA_URI_V4 = ECS_CONTAINER_METADATA_URI_V4;
    });

    describe('when successfully retrieving the data', () => {
      function generateLaunchTypeTests(
        resourceAttributes: EcsResourceAttributes,
        suffix = ''
      ) {
        let nockScope: nock.Scope;

        beforeEach(() => {
          function readTestFileName(testFileName: string) {
            const testResource = join(
              __dirname,
              `test-resources/${testFileName}`
            );

            return readFileSync(testResource, 'utf-8');
          }

          const containerResponseBody = readTestFileName(
            `metadatav4-response-container-${resourceAttributes.launchType!}${suffix}.json`
          );
          const taskResponseBody = readTestFileName(
            `metadatav4-response-task-${resourceAttributes.launchType!}${suffix}.json`
          );

          nockScope = nock('http://169.254.170.2:80')
            .persist(false)
            .get('/v4/96d36db6cf2942269b2c2c0c9540c444-4190541037')
            .reply(200, () => containerResponseBody)
            .get('/v4/96d36db6cf2942269b2c2c0c9540c444-4190541037/task')
            .reply(200, () => taskResponseBody);
        });

        afterEach(() => {
          if (nockScope) {
            nockScope.done();
          }
        });

        it('should successfully return resource data', async () => {
          sinon.stub(os, 'hostname').returns(hostNameData);
          readStub = sinon
            .stub(AwsEcsDetectorSync, 'readFileAsync' as any)
            .resolves(correctCgroupData);

          const resource = await awsEcsDetector.detect();
          await resource.waitForAsyncAttributes?.();

          sinon.assert.calledOnce(readStub);
          assert.ok(resource);
          assertEcsResource(resource, resourceAttributes);
          assertContainerResource(resource, {
            name: 'abcd.test.testing.com',
            id: 'bcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm',
          });
        });

        it('should return resource only with hostname attribute without cgroup file', async () => {
          sinon.stub(os, 'hostname').returns(hostNameData);
          readStub = sinon
            .stub(AwsEcsDetectorSync, 'readFileAsync' as any)
            .rejects(errorMsg.fileNotFoundError);

          const resource = await awsEcsDetector.detect();
          await resource.waitForAsyncAttributes?.();

          sinon.assert.calledOnce(readStub);
          assert.ok(resource);
          assertEcsResource(resource, resourceAttributes);
          assertContainerResource(resource, {
            name: 'abcd.test.testing.com',
          });
        });

        it('should return resource only with hostname attribute when cgroup file does not contain valid container ID', async () => {
          sinon.stub(os, 'hostname').returns(hostNameData);
          readStub = sinon
            .stub(AwsEcsDetectorSync, 'readFileAsync' as any)
            .resolves('');

          const resource = await awsEcsDetector.detect();
          await resource.waitForAsyncAttributes?.();

          sinon.assert.calledOnce(readStub);
          assert.ok(resource);
          assertEcsResource(resource, resourceAttributes);
          assertContainerResource(resource, {
            name: 'abcd.test.testing.com',
          });
        });

        it('should return resource only with container ID attribute without hostname', async () => {
          sinon.stub(os, 'hostname').returns('');
          readStub = sinon
            .stub(AwsEcsDetectorSync, 'readFileAsync' as any)
            .resolves(correctCgroupData);

          const resource = await awsEcsDetector.detect();
          await resource.waitForAsyncAttributes?.();

          sinon.assert.calledOnce(readStub);
          assert.ok(resource);
          assertEcsResource(resource, resourceAttributes);
          assertContainerResource(resource, {
            id: 'bcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm',
          });
        });

        it('should return metadata v4 resource attributes when both hostname and container ID are invalid', async () => {
          sinon.stub(os, 'hostname').returns('');
          readStub = sinon
            .stub(AwsEcsDetectorSync, 'readFileAsync' as any)
            .rejects(errorMsg.fileNotFoundError);

          const resource = await awsEcsDetector.detect();
          await resource.waitForAsyncAttributes?.();

          sinon.assert.calledOnce(readStub);
          assert.ok(resource);
          assertEcsResource(resource, resourceAttributes);
        });
      }

      describe('on Ec2', () => {
        describe('with AWS CloudWatch as log driver', () => {
          generateLaunchTypeTests({
            clusterArn: 'arn:aws:ecs:us-west-2:111122223333:cluster/default',
            containerArn:
              'arn:aws:ecs:us-west-2:111122223333:container/0206b271-b33f-47ab-86c6-a0ba208a70a9',
            launchType: 'ec2',
            taskArn:
              'arn:aws:ecs:us-west-2:111122223333:task/default/158d1c8083dd49d6b527399fd6414f5c',
            taskFamily: 'curltest',
            taskRevision: '26',
            logGroupNames: ['/ecs/metadata'],
            logGroupArns: [
              'arn:aws:logs:us-west-2:111122223333:log-group:/ecs/metadata',
            ],
            logStreamNames: ['ecs/curl/8f03e41243824aea923aca126495f665'],
            logStreamArns: [
              'arn:aws:logs:us-west-2:111122223333:log-group:/ecs/metadata:log-stream:ecs/curl/8f03e41243824aea923aca126495f665',
            ],
          });
        });
      });

      describe('on Fargate', () => {
        describe('with AWS CloudWatch as log driver', () => {
          generateLaunchTypeTests({
            accountId: '111122223333',
            region: 'us-west-2',
            zone: 'us-west-2a',
            clusterArn: 'arn:aws:ecs:us-west-2:111122223333:cluster/default',
            containerArn:
              'arn:aws:ecs:us-west-2:111122223333:container/05966557-f16c-49cb-9352-24b3a0dcd0e1',
            launchType: 'fargate',
            taskArn:
              'arn:aws:ecs:us-west-2:111122223333:task/default/e9028f8d5d8e4f258373e7b93ce9a3c3',
            taskFamily: 'curltest',
            taskRevision: '3',
            logGroupNames: ['/ecs/containerlogs'],
            logGroupArns: [
              'arn:aws:logs:us-west-2:111122223333:log-group:/ecs/containerlogs',
            ],
            logStreamNames: ['ecs/curl/cd189a933e5849daa93386466019ab50'],
            logStreamArns: [
              'arn:aws:logs:us-west-2:111122223333:log-group:/ecs/containerlogs:log-stream:ecs/curl/cd189a933e5849daa93386466019ab50',
            ],
          });
        });

        describe('with AWS Firelens as log driver', () => {
          generateLaunchTypeTests(
            {
              clusterArn: 'arn:aws:ecs:us-west-2:111122223333:cluster/default',
              containerArn:
                'arn:aws:ecs:us-west-2:111122223333:container/05966557-f16c-49cb-9352-24b3a0dcd0e1',
              launchType: 'fargate',
              taskArn:
                'arn:aws:ecs:us-west-2:111122223333:task/default/e9028f8d5d8e4f258373e7b93ce9a3c3',
              taskFamily: 'curltest',
              taskRevision: '3',
              logGroupNames: undefined,
              logGroupArns: undefined,
              logStreamNames: undefined,
              logStreamArns: undefined,
            },
            '-logsfirelens'
          );
        });
      });
    });

    describe('when failing to fetch metadata', async () => {
      const error = new Error('ERROR');

      beforeEach(() => {
        sinon.stub(AwsEcsDetectorSync, '_getUrlAsJson' as any).rejects(error);
      });

      it('should return empty resource if when there is an error', async () => {
        const resource = await awsEcsDetector.detect();
        await resource.waitForAsyncAttributes?.();

        assert.deepStrictEqual(resource.attributes, {});
      });
    });
  });
});
