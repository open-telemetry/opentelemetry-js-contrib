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

import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import OpenAI from 'openai';
import OpenAIWrapper from './wrapper';
import InstrumentationHelperConfig from './config';
import { OpenAIInstrumentationConfig } from './types';

export class OpenAIInstrumentation extends InstrumentationBase<OpenAIInstrumentationConfig> {
  constructor(config: OpenAIInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    InstrumentationHelperConfig.updateConfig(config);
  }

  protected init():
    | void
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[] {
    const initModule = new InstrumentationNodeModuleDefinition(
      'openai',
      ['>=3.1.0 <5'],
      (module: any) => {
        const moduleExports: typeof OpenAI =
          module[Symbol.toStringTag] === 'Module'
            ? module.default // ESM
            : module; // CommonJS

        this.patch(moduleExports);
        return moduleExports;
      },
      (module: any) => {
        const moduleExports: typeof OpenAI =
          module[Symbol.toStringTag] === 'Module'
            ? module.default // ESM
            : module; // CommonJS
        if (moduleExports !== undefined) {
          this.unpatch(moduleExports);
        }
      }
    );

    return [initModule];
  }

  public manualPatch(openai: typeof OpenAI): void {
    this.patch(openai);
  }

  protected patch(moduleExports: typeof OpenAI) {
    try {
      if (isWrapped(moduleExports.OpenAI.Chat.Completions.prototype.create)) {
        this._unwrap(moduleExports.OpenAI.Chat.Completions.prototype, 'create');
      }

      this._wrap(
        moduleExports.OpenAI.Chat.Completions.prototype,
        'create',
        OpenAIWrapper._patchChatCompletionCreate(this.tracer)
      );
    } catch (e) {
      console.error('Error in _patch method:', e);
    }
  }

  protected unpatch(moduleExports: typeof OpenAI) {
    this._unwrap(moduleExports.OpenAI.Chat.Completions.prototype, 'create');
  }
}
