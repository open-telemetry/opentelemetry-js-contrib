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

import {reset,storage,chromeMock,runtime} from 'sinon-chrome';
import {ok,deepStrictEqual} from 'assert';
import {SinonSandbox,createSandbox} from 'sinon';

import { InstrumentationInjector } from '../src/contentScript/InstrumentationInjector';
import { JSDOM } from 'jsdom';
import {
  DomAttributes,
  DomElements,
  INSTRUMENTATION_SCRIPT_NAME,
  Settings,
} from '../src/types';
import { TEST_URL } from './utils';

describe('InstrumentationInjector', () => {
  let sandbox: SinonSandbox;
  let injector: InstrumentationInjector;
  let jsdom: JSDOM;

  beforeEach(() => {
    sandbox = createSandbox();
    jsdom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: TEST_URL,
    });
    injector = new InstrumentationInjector(
      chromeMock as unknown as typeof chrome,
      jsdom.window.document,
      {
        log: () => {},
      } as Console
    );
  });

  afterEach(async () => {
    sandbox.restore();
    reset();
  });

  describe('checkUrlFilter', () => {
    it('matches on parts of the URL', () => {
      ok(
        InstrumentationInjector.checkUrlFilter(
          'example',
          'http://www.example.com'
        )
      );

      ok(
        InstrumentationInjector.checkUrlFilter(
          'www.exa',
          'http://www.example.com'
        )
      );

      ok(
        !InstrumentationInjector.checkUrlFilter('123', 'http://www.example.com')
      );
    });

    it('accepts "*" as a catch all', () => {
      ok(
        InstrumentationInjector.checkUrlFilter('*', 'http://www.example.com')
      );

      ok(
        InstrumentationInjector.checkUrlFilter(
          '*',
          'http://www.opentelemetry.io'
        )
      );
    });
  });

  describe('execute', () => {
    it('should load settings from storage', () => {
      injector.execute();
      ok(storage.local.get.calledOnceWith('settings'));
    });

    it('should only inject instrumentation if urlFilter matches', () => {
      const spy = sandbox.spy(injector, 'inject');
      storage.local.get.onFirstCall().callsArgWith(1, {
        settings: {
          urlFilter: '123',
        },
      });
      storage.local.get.onSecondCall().callsArgWith(1, {
        settings: {
          urlFilter: 'example',
        },
      });

      injector.execute();
      ok(spy.notCalled);

      injector.execute();
      ok(spy.calledOnce);
    });
  });

  describe('inject', () => {
    it('adds a script element to the DOM that loads the instrumentation code', () => {
      const scriptName = `chrome-extension://id/${INSTRUMENTATION_SCRIPT_NAME}`;

      runtime.getURL.onFirstCall().returns(scriptName);

      const settings = { exporters: {} };
      injector.inject(settings as Settings);
      const configTag = jsdom.window.document.getElementById(
        DomElements.CONFIG_TAG
      );
      ok(configTag instanceof jsdom.window.HTMLScriptElement);
      deepStrictEqual(
        settings,
        JSON.parse(
          String(configTag.getAttribute(`data-${DomAttributes.CONFIG}`))
        )
      );
      ok(configTag.getAttribute('src'), scriptName);
    });
  });
});
