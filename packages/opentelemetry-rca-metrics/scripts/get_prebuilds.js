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
'use strict';

/* eslint-disable no-console */

const axios = require('axios');
const checksum = require('checksum');
const fs = require('fs');
const os = require('os');
const path = require('path');
const exec = require('./exec.js');

const MAIN_FOLDER = path.resolve(__dirname, '..');
const ARTIFACTS_FOLDER = path.resolve(MAIN_FOLDER, 'artifacts');

console.log('Downloading rca-metrics compiled files for release.');
const TOKEN = process.env.CIRCLE_TOKEN;

if (!TOKEN) {
  throw new Error(
    [
      'The prepublish script needs to authenticate to CircleCI.',
      'Please set the CIRCLE_TOKEN environment variable.',
    ].join(' ')
  );
}

const revision = exec.pipe('git rev-parse HEAD');

console.log(revision);

// const branch = exec.pipe(`git symbolic-ref --short HEAD`);
const branch = 'master';

console.log(branch);

const client = axios.create({
  baseURL: 'https://circleci.com/api/v2/',
  timeout: 5000,
  headers: {
    'Circle-Token': TOKEN,
  },
});

const fetch = (url, options) => {
  console.log(`GET ${url}`);

  return client
    .get(url, options)
    .catch(() => client.get(url, options))
    .catch(() => client.get(url, options));
};

getPipeline()
  .then(getWorkflow)
  .then(getPrebuildsJob)
  .then(getPrebuildArtifacts)
  .then(downloadArtifacts)
  .then(validatePrebuilds)
  .then(copyPrebuilds)
  .catch(e => {
    process.exitCode = 1;
    console.error(e);
  });

function getPipeline() {
  return fetch(
    `project/gh/open-telemetry/opentelemetry-js-contrib/pipeline?branch=${branch}`
  ).then(response => {
    const pipeline = response.data.items.find(
      item => item.vcs.revision === revision
    );

    if (!pipeline) {
      throw new Error(
        `Unable to find CircleCI pipeline for ${branch}@${revision}.`
      );
    }

    return pipeline;
  });
}

function getWorkflow(pipeline) {
  return fetch(`pipeline/${pipeline.id}/workflow`).then(response => {
    const workflows = response.data.items.sort((a, b) =>
      a.stopped_at < b.stopped_at ? 1 : -1
    );
    const running = workflows.find(workflow => !workflow.stopped_at);

    if (running) {
      throw new Error(
        `Workflow ${running.id} is still running for pipeline ${pipeline.id}.`
      );
    }

    const workflow = workflows[0];

    if (!workflow) {
      throw new Error(
        `Unable to find CircleCI workflow for pipeline ${pipeline.id}.`
      );
    }

    if (workflow.status !== 'success') {
      throw new Error(
        `Aborting because CircleCI workflow ${workflow.id} did not succeed.`
      );
    }

    return workflow;
  });
}

function getPrebuildsJob(workflow) {
  return fetch(`workflow/${workflow.id}/job`).then(response => {
    const job = response.data.items.find(
      item => item.name === 'build-native-stats'
    );

    if (!job) {
      throw new Error(`Missing prebuild jobs in workflow ${workflow.id}.`);
    }

    return job;
  });
}

function getPrebuildArtifacts(job) {
  return fetch(
    `project/github/open-telemetry/opentelemetry-js-contrib/${job.job_number}/artifacts`
  ).then(response => {
    const artifacts = response.data.items.filter(artifact =>
      /\/prebuilds\.tgz/.test(artifact.url)
    );

    if (artifacts.length === 0) {
      throw new Error(`Missing artifacts in job ${job.job_number}.`);
    }

    return artifacts;
  });
}

function downloadArtifacts(artifacts) {
  const files = artifacts.map(artifact => artifact.url);

  return Promise.all(files.map(downloadArtifact));
}

function downloadArtifact(file) {
  return fetch(file, { responseType: 'stream' }).then(response => {
    const parts = file.split('/');
    const basename = os.tmpdir();
    const filename = parts.slice(-1)[0];

    return new Promise((resolve, reject) => {
      response.data
        .pipe(fs.createWriteStream(path.join(basename, filename)))
        .on('finish', () => resolve())
        .on('error', reject);
    });
  });
}

function validatePrebuilds() {
  const file = path.join(os.tmpdir(), 'prebuilds.tgz');
  const content = fs.readFileSync(file);
  const sum = fs.readFileSync(path.join(`${file}.sha1`), 'ascii');

  if (sum !== checksum(content)) {
    throw new Error('Invalid checksum for "prebuilds.tgz".');
  }
}

function copyPrebuilds() {
  const filename = 'prebuilds.tgz';

  fs.copyFileSync(
    path.join(os.tmpdir(), filename),
    path.join(ARTIFACTS_FOLDER, filename)
  );
  fs.copyFileSync(
    path.join(os.tmpdir(), `${filename}.sha1`),
    path.join(ARTIFACTS_FOLDER, `${filename}.sha1`)
  );
}
