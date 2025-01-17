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
import { renderHook } from '@testing-library/react';
import useConsole from '../src/utils/hooks/useConsole';
import { beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';

describe('useConsole.ts', function () {
  const sandbox = sinon.createSandbox();

  let mockConsoleInfo: sinon.SinonSpy;
  let mockConsoleWarn: sinon.SinonSpy;

  beforeEach(function () {
    mockConsoleInfo = sandbox.spy(console, 'info');
    mockConsoleWarn = sandbox.spy(console, 'warn');
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('should not to print messages', () => {
    const { result } = renderHook(() => useConsole(false));
    const customConsole = result.current;

    customConsole.info('Info log.');
    customConsole.warn('Warn log.');

    sandbox.assert.notCalled(mockConsoleInfo);
    sandbox.assert.notCalled(mockConsoleWarn);
  });

  it('should print messages', () => {
    const { result } = renderHook(() => useConsole(true));
    const customConsole = result.current;

    customConsole.info('Info log.');
    customConsole.warn('Warn log.');

    sandbox.assert.calledOnceWithExactly(mockConsoleInfo, 'Info log.');
    sandbox.assert.calledOnceWithExactly(mockConsoleWarn, 'Warn log.');
  });

  it('should work as expected when the argument is updated', () => {
    const { result: customConsoleNotPrinting } = renderHook(() =>
      useConsole(false)
    );

    customConsoleNotPrinting.current.info('Info log.');
    sandbox.assert.notCalled(mockConsoleInfo);

    const { result: customConsolePrinting } = renderHook(() =>
      useConsole(true)
    );

    customConsolePrinting.current.info('Info log printed.');
    sandbox.assert.calledOnceWithExactly(mockConsoleInfo, 'Info log printed.');
  });
});
