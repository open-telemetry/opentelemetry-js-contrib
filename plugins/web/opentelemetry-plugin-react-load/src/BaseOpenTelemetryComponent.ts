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
import { isWrapped } from '@opentelemetry/core';
import * as shimmer from 'shimmer';
import { AttributeNames } from './enums/AttributeNames';
import * as React from 'react';
import { VERSION } from './version';
import {
  RenderFunction,
  ComponentDidMountFunction,
  ComponentDidUpdateFunction,
  ShouldComponentUpdateFunction,
  SetStateFunction,
  ForceUpdateFunction,
  GetSnapshotBeforeUpdateFunction,
  ComponentWillUnmountFunction,
} from './internal-types';

/**
 * This class is the base component for a React component with lifecycle instrumentation
 */
export class BaseOpenTelemetryComponent extends React.Component {
  readonly component: string = 'react-load';
  moduleName = this.component;
  private _parentSpanMap: WeakMap<React.Component, api.Span>;
  private static _tracer: api.Tracer;
  private static _logger: api.DiagLogger = api.diag;

  /**
   * @param props Props of the React component
   */
  constructor(props: Readonly<any>) {
    super(props);
    this._parentSpanMap = new WeakMap<React.Component, api.Span>();
    this.patch();
  }

  /**
   * Sets the tracer for all components being instrumented
   * @param name Name of tracer
   * @param version Version of tracer, this is optional. When not provided it will use the latest.
   */
  static setTracer(name: string, version?: string): void {
    BaseOpenTelemetryComponent._tracer = api.trace.getTracer(
      name,
      version ? version : VERSION
    );
  }

  /**
   * Sets the logger for all components being instrumented
   * @param logger
   */
  static setLogger(logger: api.DiagLogger): void {
    api.diag.setLogger(logger);
    BaseOpenTelemetryComponent._logger = logger;
  }

  /**
   * Creates a new span as a child of the current parent span.
   * If parent span is undefined, just the child is created.
   * @param react React component currently being instrumented
   * @param name Name of span
   * @param parentSpan parent span
   */
  private _createSpanWithParent(
    react: React.Component,
    name: string,
    parentSpan: api.Span
  ): api.Span {
    return BaseOpenTelemetryComponent._tracer.startSpan(
      name,
      {
        attributes: this._getAttributes(react),
      },
      parentSpan
        ? api.trace.setSpan(api.context.active(), parentSpan)
        : undefined
    );
  }

  /**
   * Creates a new span
   * @param react React component currently being instrumented
   * @param name Name of span
   */
  private _createSpan(react: React.Component, name: string): api.Span {
    return BaseOpenTelemetryComponent._tracer.startSpan(name, {
      attributes: this._getAttributes(react),
    });
  }

  /**
   * Provides instrumentation for a function
   * @param react React component currently instrumenting.
   * @param spanName Name to set the span of the instrumented function to.
   * @param original Original function currently being wrapped.
   * @parentName Name to set parent span to on error.
   */
  private _instrumentFunction(
    react: React.Component,
    spanName: string,
    parent: api.Span,
    original: any
  ) {
    const span = this._createSpanWithParent(react, spanName, parent);
    let wasError = false;
    try {
      return api.context.with(
        api.trace.setSpan(api.context.active(), span),
        () => {
          return original();
        }
      );
    } catch (err) {
      span.setAttribute(AttributeNames.REACT_ERROR, err.stack);
      wasError = true;
      throw err;
    } finally {
      span.end();
      if (wasError) {
        this._endParentSpan(react);
      }
    }
  }

  /**
   * Ends the current parent span.
   * @param react React component parent span belongs to.
   */
  private _endParentSpan(react: React.Component) {
    const parentSpan = this._parentSpanMap.get(react);
    if (parentSpan) {
      parentSpan.end();
      this._parentSpanMap.delete(react);
    }
  }

  /**
   * Returns attributes object for spans
   * @param react React component currently being instrumented
   **/
  private _getAttributes(react: React.Component) {
    let state: string;
    try {
      state = JSON.stringify(react.state);
    } catch {
      state = '{"message": "state could not be turned into string"}';
    }
    return {
      [AttributeNames.LOCATION_URL]: window.location.href,
      [AttributeNames.REACT_NAME]: react.constructor.name,
      [AttributeNames.REACT_STATE]: state,
    };
  }

  /**
   * This function returns a parent span. If the parent doesn't
   * exist, the function creates one
   * @param react React component parent span belongs to.
   */
  private _getParentSpan(react: React.Component, parentName: string): api.Span {
    const parentSpan: api.Span | undefined = this._parentSpanMap.get(react);
    if (!parentSpan) {
      const span = this._createSpan(react, parentName);
      this._parentSpanMap.set(react, span);
    }
    return this._parentSpanMap.get(react)!;
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
        // Render is the first method in the mounting flow, if a parent span wasn't created already then we're in the mounting flow
        let parentSpan: api.Span;
        if (!plugin._parentSpanMap.get(this)) {
          parentSpan = plugin._getParentSpan(
            this,
            AttributeNames.MOUNTING_SPAN
          );
        } else {
          parentSpan = plugin._getParentSpan(
            this,
            AttributeNames.UPDATING_SPAN
          );
        }

        return plugin._instrumentFunction(this, 'render', parentSpan, () => {
          return original!.apply(this, args);
        });
      };
    };
  }

  /**
   * Patches the componentDidMount lifecycle method
   */
  private _patchComponentDidMount() {
    return (original: ComponentDidMountFunction): ComponentDidMountFunction => {
      const plugin = this;

      return function patchComponentDidMount(
        this: React.Component,
        ...args
      ): void {
        const parentSpan = plugin._getParentSpan(
          this,
          AttributeNames.MOUNTING_SPAN
        );
        const apply = plugin._instrumentFunction(
          this,
          'componentDidMount',
          parentSpan,
          () => {
            return original!.apply(this, args);
          }
        );
        plugin._endParentSpan(this);
        return apply;
      };
    };
  }

  /**
   * Patches the setState function
   */
  private _patchSetState() {
    return (original: SetStateFunction): SetStateFunction => {
      const plugin = this;
      return function patchSetState(this: React.Component, ...args): void {
        const parentSpan = plugin._getParentSpan(
          this,
          AttributeNames.UPDATING_SPAN
        );
        return plugin._instrumentFunction(
          this,
          'setState()',
          parentSpan,
          () => {
            return original!.apply(this, args);
          }
        );
      };
    };
  }

  /**
   * Patches the forceUpdate function
   */
  private _patchForceUpdate() {
    return (original: ForceUpdateFunction): ForceUpdateFunction => {
      const plugin = this;
      return function patchForceUpdate(this: React.Component, ...args): void {
        const parentSpan = plugin._getParentSpan(
          this,
          AttributeNames.UPDATING_SPAN
        );
        return plugin._instrumentFunction(
          this,
          'forceUpdate()',
          parentSpan,
          () => {
            return original!.apply(this, args);
          }
        );
      };
    };
  }

  /**
   * Patches the shouldComponentUpdate lifecycle method
   */
  private _patchShouldComponentUpdate() {
    return (
      original: ShouldComponentUpdateFunction
    ): ShouldComponentUpdateFunction => {
      const plugin = this;

      return function patchShouldComponentUpdate(
        this: React.Component,
        ...args
      ): boolean {
        const parentSpan = plugin._getParentSpan(
          this,
          AttributeNames.UPDATING_SPAN
        );
        const apply = plugin._instrumentFunction(
          this,
          'shouldComponentUpdate',
          parentSpan,
          () => {
            return original!.apply(this, args);
          }
        );
        // if shouldComponentUpdate returns false, the component does not get
        // updated and no other lifecycle methods get called
        if (!apply) {
          plugin._endParentSpan(this);
        }

        return apply;
      };
    };
  }

  /**
   * Patches the shouldComponentUpdate lifecycle method
   */
  private _patchGetSnapshotBeforeUpdate() {
    return (
      original: GetSnapshotBeforeUpdateFunction
    ): GetSnapshotBeforeUpdateFunction => {
      const plugin = this;

      return function patchGetSnapshotBeforeUpdate(
        this: React.Component,
        ...args
      ): any {
        const parentSpan = plugin._getParentSpan(
          this,
          AttributeNames.UPDATING_SPAN
        );
        return plugin._instrumentFunction(
          this,
          'getSnapshotBeforeUpdate',
          parentSpan,
          () => {
            return original!.apply(this, args);
          }
        );
      };
    };
  }

  /**
   * Patches the componentDidUpdate lifecycle method
   */
  private _patchComponentDidUpdate() {
    return (
      original: ComponentDidUpdateFunction
    ): ComponentDidUpdateFunction => {
      const plugin = this;

      return function patchComponentDidUpdate(
        this: React.Component,
        ...args
      ): void {
        const parentSpan = plugin._getParentSpan(
          this,
          AttributeNames.UPDATING_SPAN
        );
        const apply = plugin._instrumentFunction(
          this,
          'componentDidUpdate',
          parentSpan,
          () => {
            return original!.apply(this, args);
          }
        );
        plugin._endParentSpan(this);
        return apply;
      };
    };
  }

  /**
   * Patches the componentWillUnmount lifecycle method
   */
  private _patchComponentWillUnmount() {
    return (
      original: ComponentWillUnmountFunction
    ): ComponentWillUnmountFunction => {
      const plugin = this;

      return function patchComponentWillUnmount(
        this: React.Component,
        ...args
      ): void {
        const parentSpan = plugin._getParentSpan(
          this,
          AttributeNames.UNMOUNTING_SPAN
        );
        const apply = plugin._instrumentFunction(
          this,
          'componentWillUnmount',
          parentSpan,
          () => {
            return original!.apply(this, args);
          }
        );
        plugin._endParentSpan(this);
        return apply;
      };
    };
  }

  /**
   * patch function which wraps all the lifecycle methods
   */
  public patch(): void {
    BaseOpenTelemetryComponent._logger.debug(
      'applying patch to',
      this.moduleName,
      VERSION
    );

    if (isWrapped(this.render)) {
      shimmer.unwrap(this, 'render');
      BaseOpenTelemetryComponent._logger.warn(
        'removing previous patch from method render'
      );
    }
    if (isWrapped(this.componentDidMount)) {
      shimmer.unwrap(this, 'componentDidMount');
      BaseOpenTelemetryComponent._logger.warn(
        'removing previous patch from method componentDidMount'
      );
    }
    if (isWrapped(this.shouldComponentUpdate)) {
      shimmer.unwrap(this, 'shouldComponentUpdate');
      BaseOpenTelemetryComponent._logger.warn(
        'removing previous patch from method shouldComponentUpdate'
      );
    }
    if (isWrapped(this.getSnapshotBeforeUpdate)) {
      shimmer.unwrap(this, 'getSnapshotBeforeUpdate');
      BaseOpenTelemetryComponent._logger.warn(
        'removing previous patch from method getSnapshotBeforeUpdate'
      );
    }
    if (isWrapped(this.setState)) {
      shimmer.unwrap(this, 'setState');
      BaseOpenTelemetryComponent._logger.warn(
        'removing previous patch from method setState'
      );
    }
    if (isWrapped(this.forceUpdate)) {
      shimmer.unwrap(this, 'forceUpdate');
      BaseOpenTelemetryComponent._logger.warn(
        'removing previous patch from method forceUpdate'
      );
    }
    if (isWrapped(this.componentDidUpdate)) {
      shimmer.unwrap(this, 'componentDidUpdate');
      BaseOpenTelemetryComponent._logger.warn(
        'removing previous patch from method componentDidUpdate'
      );
    }
    if (isWrapped(this.componentWillUnmount)) {
      shimmer.unwrap(this, 'componentWillUnmount');
      BaseOpenTelemetryComponent._logger.warn(
        'removing previous patch from method componentWillUnmount'
      );
    }

    // Lifecycle methods must exist when patching, even if not defined in component
    if (!this.render) {
      this.render = () => {
        return null;
      };
    }
    if (!this.componentDidMount) {
      this.componentDidMount = () => {
        return;
      };
    }
    if (!this.shouldComponentUpdate) {
      this.shouldComponentUpdate = () => {
        return true;
      };
    }
    if (!this.getSnapshotBeforeUpdate) {
      this.getSnapshotBeforeUpdate = () => {
        return null;
      };
    }
    if (!this.componentDidUpdate) {
      this.componentDidUpdate = () => {
        return;
      };
    }
    if (!this.componentWillUnmount) {
      this.componentWillUnmount = () => {
        return;
      };
    }

    shimmer.wrap(this, 'render', this._patchRender());
    shimmer.wrap(this, 'componentDidMount', this._patchComponentDidMount());
    shimmer.wrap(this, 'setState', this._patchSetState());
    shimmer.wrap(this, 'forceUpdate', this._patchForceUpdate());
    shimmer.wrap(
      this,
      'shouldComponentUpdate',
      this._patchShouldComponentUpdate()
    );
    shimmer.wrap(
      this,
      'getSnapshotBeforeUpdate',
      this._patchGetSnapshotBeforeUpdate()
    );
    shimmer.wrap(this, 'componentDidUpdate', this._patchComponentDidUpdate());
    shimmer.wrap(
      this,
      'componentWillUnmount',
      this._patchComponentWillUnmount()
    );
  }

  /**
   * unpatch function to unwrap all the lifecycle methods
   */
  public unpatch(): void {
    BaseOpenTelemetryComponent._logger.debug(
      'removing patch from',
      this.moduleName,
      VERSION
    );

    shimmer.unwrap(this, 'render');

    shimmer.unwrap(this, 'componentDidMount');

    shimmer.unwrap(this, 'setState');
    shimmer.unwrap(this, 'forceUpdate');
    shimmer.unwrap(this, 'shouldComponentUpdate');
    shimmer.unwrap(this, 'getSnapshotBeforeUpdate');
    shimmer.unwrap(this, 'componentDidUpdate');

    shimmer.unwrap(this, 'componentWillUnmount');

    this._parentSpanMap = new WeakMap<React.Component, api.Span>();
  }
}
