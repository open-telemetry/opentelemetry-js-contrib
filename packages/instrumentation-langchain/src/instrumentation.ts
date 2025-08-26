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

import type * as CallbackManagerModuleV02 from "@langchain/core/callbacks/manager";
import type { CallbackManager } from "@langchain/core/callbacks/manager";
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from "@opentelemetry/instrumentation";
import { PACKAGE_VERSION } from "./version";
import { diag, Tracer, TracerProvider } from "@opentelemetry/api";
import { addTracerToHandlers } from "./instrumentationUtils";

const MODULE_NAME = "@langchain/core/callbacks";

const INSTRUMENTATION_NAME = "@aws/opentelemetry-instrumentation-langchain-v2";

/**
 * Flag to check if the openai module has been patched
 * Note: This is a fallback in case the module is made immutable (e.x. Deno, webpack, etc.)
 */
let _isModulePatched = false;

/**
 * function to check if instrumentation is enabled / disabled
 */
export function isPatched() {
  return _isModulePatched;
}

interface CallbackManagerModule {
  CallbackManager: typeof CallbackManager;
  isPatched?: boolean;
}


export class LangChainInstrumentation extends InstrumentationBase {
  private tracerProvider?: TracerProvider;
  private normalTracer: Tracer;

  constructor({
    instrumentationConfig,
    tracerProvider,
  }: {
    instrumentationConfig?: InstrumentationConfig;
    tracerProvider?: TracerProvider;
  } = {}) {
    super(
      INSTRUMENTATION_NAME,
      PACKAGE_VERSION,
      Object.assign({}, instrumentationConfig),
    );
    this.tracerProvider = tracerProvider;
    this.normalTracer = tracerProvider?.getTracer(INSTRUMENTATION_NAME, PACKAGE_VERSION) ?? this.tracer;
  }

  manuallyInstrument(module: CallbackManagerModule) {
    diag.debug(`Manually instrumenting ${MODULE_NAME}`);
    this.patch(module);
  }

  protected init(): InstrumentationModuleDefinition<CallbackManagerModule> {
    const module =
      new InstrumentationNodeModuleDefinition<CallbackManagerModule>(
        "@langchain/core/dist/callbacks/manager.cjs",
        ["^0.1.0", "^0.2.0"],
        this.patch.bind(this),
        this.unpatch.bind(this),
      );
    return module;
  }

  get tracer(): Tracer {
    if (this.tracerProvider) {
      return this.tracerProvider.getTracer(
        this.instrumentationName,
        this.instrumentationVersion,
      );
    }
    return super.tracer;
  }

  setTracerProvider(tracerProvider: TracerProvider): void {
    super.setTracerProvider(tracerProvider);
    this.tracerProvider = tracerProvider;
    this.normalTracer = tracerProvider.getTracer(
      this.instrumentationName,
      this.instrumentationVersion,
    );
  }

  private patch(
    module: CallbackManagerModule & {
      isPatched
  ?: boolean;
    },
    moduleVersion?: string,
  ) {
    diag.debug(
      `Applying patch for ${MODULE_NAME}${
        moduleVersion != null ? `@${moduleVersion}` : ""
      }`,
    );
    if (module?.isPatched
   || _isModulePatched
  
    ) {
      return module;
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instrumentation = this;

    /**
     * _configureSync is only available in v0.2.0 and above
     * It was added as a replacement to the configure method which is marked as soon to be deprecated
     * In v0.2.0 and above, the configure method is a wrapper around _configureSync
     * However, configure is not always called, where as _configureSync is always called
     * so we want to patch only configure sync if it's available
     * and only configure if _configureSync is not available so we don't get duplicate traces
     */
    if ("_configureSync" in module.CallbackManager) {
      this._wrap(module.CallbackManager, "_configureSync", (original) => {
        return function (
          this: typeof CallbackManagerModuleV02,
          ...args: Parameters<
            (typeof CallbackManagerModuleV02.CallbackManager)["_configureSync"]
          >
        ) {
            const inheritableHandlers = args[0];
            const newInheritableHandlers = addTracerToHandlers(
                instrumentation.normalTracer,
                inheritableHandlers,
            );
            args[0] = newInheritableHandlers;
            return original.apply(this, args);
        };
      });
    }
    _isModulePatched = true;
    try {
      // This can fail if the module is made immutable via the runtime or bundler
      module.isPatched = true;
    } catch (e) {
      diag.debug(`Failed to set ${MODULE_NAME} patched flag on the module`, e);
    }

    return module;
  }

  private unpatch(
    module?: CallbackManagerModule & {
      isPatched
  ?: boolean;
    },
    moduleVersion?: string,
  ) {
    if (module == null) {
      return;
    }
    diag.debug(
      `Removing patch for ${MODULE_NAME}${
        moduleVersion != null ? `@${moduleVersion}` : ""
      }`,
    );
    if (isWrapped(module.CallbackManager.configure)) {
      this._unwrap(module.CallbackManager, "configure");
    }
    /**
     * _configureSync is only available in v0.2.0 and above
     * Thus we only want to unwrap it if it's available and has been wrapped
     */
    if (
      "_configureSync" in module.CallbackManager &&
      isWrapped(module.CallbackManager._configureSync)
    ) {
      this._unwrap(module.CallbackManager, "_configureSync");
    }
    _isModulePatched = false;
    try {
      // This can fail if the module is made immutable via the runtime or bundler
      module.isPatched = false;
    } catch (e) {
      diag.warn(`Failed to unset ${MODULE_NAME} patched flag on the module`, e);
    }
    return module;
  }
}
