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

import * as api from '@opentelemetry/api';
import { BasePlugin, isWrapped } from '@opentelemetry/core';
import * as shimmer from 'shimmer';
import { GeneralAttribute } from '@opentelemetry/semantic-conventions';
import { AttributeNames } from './enums/AttributeNames';
import { VERSION } from './version';
import * as React from 'react';
import {
  RenderFunction,
  ComponentDidMountFunction
} from './types';
/**
 * This class represents a react lifecycle plugin
 */
export class ReactLoad extends BasePlugin<unknown> {
  readonly component: string = 'react-load';
  readonly version: string = '1';
  moduleName = this.component;
  protected _config!: api.PluginConfig;
  private _reactComponents: React.Component[];
  private _parentSpanMap: WeakMap<React.Component, api.Span | undefined>;

  /**
   * @param reactComponent
   */
  constructor(reactComponent: any[]) {
    super('@opentelemetry/plugin-react-load', VERSION);
    this._reactComponents = reactComponent.map((item: any) => {
      return item.prototype;
    });
    this._parentSpanMap = new WeakMap<React.Component, api.Span | undefined>();
  }

   /**
   * Creates a new span as a child of the current parent span. 
   * If parent span is undefined, just the child is created.
   * @param react React component currently being instrumented
   * @param name name of span
   */
  private _createSpanWithParent(
    react: React.Component,
    name: string
  ): api.Span | undefined {
    return this._tracer.startSpan(name, {
      attributes: {
        [GeneralAttribute.COMPONENT]: this.moduleName,
        [AttributeNames.LOCATION_URL]: window.location.href,
        [AttributeNames.REACT_NAME]: react.constructor.name,
      },
      parent: this._getParentSpan(react),
    });
  }

   /**
   * Creates a new span
   * @param react React component currently being instrumented
   * @param name name of span
   */
  private _createSpan(react: React.Component, name: string): api.Span | undefined {
    return this._tracer.startSpan(name, {
      attributes: {
        [GeneralAttribute.COMPONENT]: this.moduleName,
        [AttributeNames.LOCATION_URL]: window.location.href,
        [AttributeNames.REACT_NAME]: react.constructor.name,
      },
    });
  }

   /**
   * Returns the current parent span. If one doesn't exist, 
   * this function creates a parent span
   * @param react React component parent span belongs to.
   */
  private _getParentSpan(react: React.Component): api.Span | undefined {
    let span: api.Span | undefined = this._parentSpanMap.get(react);
    if (!span) {
      span = this._createSpan(react, 'parent');
      this._parentSpanMap.set(react, span);
    }
    return span;
  }

  /**
   * Patches the render lifecycle method
   */
  private _patchRender() {
    return (original: RenderFunction): RenderFunction => {
      const plugin = this;
      return function patchRender(
        this: React.Component,
        ...args
      ): React.ReactNode {
        const span = plugin._createSpanWithParent(this, 'render');
        const apply = original.apply(this, args);
        
        if (span) {
          span.end();
        }

        return apply;
      };
    };
  }

  /**
   * Patches the componentDidMount lifecycle method
   */
  private _patchComponentDidMount() {
    return (original: ComponentDidMountFunction): ComponentDidMountFunction => {
      const plugin = this;
      if (!original) {
        this._logger.debug(
          'componentDidMount function was undefined, should always be defined when patching.'
        );
        return;
      }

      return function patchComponentDidMount(
        this: React.Component,
        ...args
      ): void {
        const span = plugin._createSpanWithParent(this, 'componentDidMount');
        const apply = original.apply(this, args);
        if (span) {
          span.end();
        }
        const mountingSpan = plugin._getParentSpan(this);
        if (mountingSpan) {
          mountingSpan.updateName(AttributeNames.MOUNTING_SPAN);
          mountingSpan.end();
          plugin._parentSpanMap.delete(this);
        }
        return apply;
      };
    };
  }

  /**
   * implements patch function
   */
  protected patch() {
    this._logger.debug('applying patch to', this.moduleName, this.version);
    this._reactComponents.forEach(prototype => {
      if (isWrapped(prototype.componentDidMount)) {
        shimmer.unwrap(prototype, 'componentDidMount');
        this._logger.debug(
          'removing previous patch from method componentDidMount'
        );
      }
      if (isWrapped(prototype.render)) {
        shimmer.unwrap(prototype, 'render');
        this._logger.debug('removing previous patch from method render');
      }

      // Lifecycle methods must exist when patching, even if not defined in component
      if (!prototype.render) {
        prototype.render = () => {
          return null;
        };
      }
      if (!prototype.componentDidMount) {
        prototype.componentDidMount = () => {};
      }

      shimmer.wrap(prototype, 'render', this._patchRender());
      shimmer.wrap(
        prototype,
        'componentDidMount',
        this._patchComponentDidMount()
      );
    });
    return this._moduleExports;
  }

  /**
   * implements unpatch function
   */
  protected unpatch() {
    this._logger.debug('removing patch from', this.moduleName, this.version);

    this._reactComponents.forEach(prototype => {
      shimmer.unwrap(prototype, 'render');
      shimmer.unwrap(prototype, 'componentDidMount');
    });

    this._parentSpanMap = new WeakMap<React.Component, api.Span | undefined>();
  }
}
