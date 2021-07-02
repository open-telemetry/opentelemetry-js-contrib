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

/* eslint-disable node/no-unpublished-import */

import { ProgrammaticContentScriptInjector } from '../src/background/ProgrammaticContentScriptInjector';
import * as chromeMock from 'sinon-chrome';
import * as assert from 'assert';
import sinon = require('sinon');

import { TAB_ID } from './utils';
import { CONTENT_SCRIPT_NAME, TabStatus } from '../src/types';

describe('ProgrammaticContentScriptInjector', () => {
  let listener: ProgrammaticContentScriptInjector;
  let sandbox: sinon.SinonSandbox;

  before(() => {
    sandbox = sinon.createSandbox();
    listener = new ProgrammaticContentScriptInjector(
      chromeMock as unknown as typeof chrome
    );
    listener.register();
  });

  afterEach(async () => {
    sandbox.restore();
  });

  it('should subscribe on chrome.tabs.onUpdated', () => {
    assert.ok(chromeMock.tabs.onUpdated.addListener.calledOnce);
  });

  it('should only be triggered on tab status "loading"', () => {
    const spy = sandbox.spy(listener, 'injectContentScript');
    chromeMock.tabs.onUpdated.dispatch(TAB_ID, {
      status: TabStatus.COMPLETE,
    });
    chromeMock.tabs.onUpdated.dispatch(TAB_ID, {
      status: TabStatus.UNLOADED,
    });
    assert.ok(spy.notCalled);
    assert.ok(chromeMock.tabs.get.notCalled);

    chromeMock.tabs.onUpdated.dispatch(TAB_ID, {
      status: TabStatus.LOADING,
    });
    assert.ok(spy.calledOnce, 'injectContentScript not triggered on "loading"');
    assert.ok(chromeMock.tabs.get.calledOnce);
  });

  it('should inject the content script if the url property of a tab is accessible', () => {
    chromeMock.tabs.get.reset();
    chromeMock.tabs.get
      .onFirstCall()
      .callsArgWith(1, { url: undefined } as chrome.tabs.Tab);
    chromeMock.tabs.get
      .onSecondCall()
      .callsArgWith(1, { url: 'http://www.example.com' } as chrome.tabs.Tab);
    chromeMock.tabs.get
      .onThirdCall()
      .callsArgWith(1, { url: 'http://www.example.com' } as chrome.tabs.Tab);

    chromeMock.tabs.onUpdated.dispatch(TAB_ID, {
      status: TabStatus.LOADING,
    });

    assert.ok(chromeMock.tabs.executeScript.notCalled);

    chromeMock.tabs.onUpdated.dispatch(TAB_ID, {
      status: TabStatus.LOADING,
    });

    assert.ok(
      chromeMock.tabs.executeScript.calledOnceWith(TAB_ID, {
        file: CONTENT_SCRIPT_NAME,
        allFrames: true,
      })
    );

    const chromeMockV3 = chromeMock as typeof chromeMock & {
      scripting: {
        executeScript: (args: any) => void;
      };
    };

    chromeMockV3.scripting = {
      executeScript: args => {
        assert.deepStrictEqual(args, {
          target: {
            allFrames: true,
            tabId: TAB_ID,
          },
          files: [CONTENT_SCRIPT_NAME],
        });
      },
    };

    chromeMock.tabs.onUpdated.dispatch(TAB_ID, {
      status: TabStatus.LOADING,
    });
  });
});
