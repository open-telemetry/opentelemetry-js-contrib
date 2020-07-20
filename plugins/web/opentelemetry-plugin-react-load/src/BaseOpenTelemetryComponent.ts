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
import { GeneralAttribute } from '@opentelemetry/semantic-conventions';
import { AttributeNames } from './enums/AttributeNames';
// import { VERSION } from './version';
import * as React from 'react';
import {
  RenderFunction,
  ComponentDidMountFunction,
  ComponentDidUpdateFunction,
  ShouldComponentUpdateFunction,
  SetStateFunction,
  ForceUpdateFunction,
  GetSnapshotBeforeUpdateFunction,
  ComponentWillUnmountFunction
} from './types';
// import { BaseOpenTelemetryComponent } from './BaseOpenTelemetryComponent';

/**
 * This class represents a react lifecycle plugin
 */
export class BaseOpenTelemetryComponent extends React.Component {
  readonly component: string = 'react-load';
  readonly version: string = '1';
  moduleName = this.component;
  private _parentSpanMap: WeakMap<React.Component, api.Span | undefined>;
  private static _tracer: api.Tracer;
  private static _logger: api.Logger;
  /**
   * @param reactComponent
   */
  constructor(props: any) {
    super(props);
    this._parentSpanMap = new WeakMap<React.Component, api.Span | undefined>();
    this.patch();
  }

  static setTracer(name: string, version?: string){
    this._tracer = api.trace.getTracer(name, version)
  }

  static setLogger(logger: api.Logger){
    this._logger = logger;
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
    return BaseOpenTelemetryComponent._tracer.startSpan(name, {
      attributes: this._getAttributes(react),
      parent: this._getParentSpan(react),
    });
  }

   /**
   * Creates a new span
   * @param react React component currently being instrumented
   * @param name name of span
   */
  private _createSpan(react: React.Component, name: string): api.Span | undefined {
    return BaseOpenTelemetryComponent._tracer.startSpan(name, {
      attributes: this._getAttributes(react)
    });
  }

  private _instrumentFunction(react: React.Component, spanName: string, apply: Function, parentName: string){
    const span = this._createSpanWithParent(react, spanName);
    let res;
    try {
      res = apply();
    } catch (err) {
      if (span) {
        span.setAttribute(AttributeNames.REACT_ERROR, err.stack);
        span.end();
      }
      this._endParentSpan(react, parentName)
      throw err;
    }
    
    if (span) {
      span.end();
    }
    return res;
  }

  private _endParentSpan(react: React.Component, name?: string){
    const mountingSpan = this._getParentSpan(react);
    if (mountingSpan) {
      if(name){
        mountingSpan.updateName(name);
      }
      mountingSpan.end();
      this._parentSpanMap.delete(react);
    }
  }

   /**
   * Returns attributes object for spans
   * @param react React component currently being instrumented
   **/
  private _getAttributes(react: React.Component) {
    let state = "";
    try{
      state = JSON.stringify(react.state)
    } catch {
      state = "state could not be turned into string"
    }
    return {
      [GeneralAttribute.COMPONENT]: this.moduleName,
      [AttributeNames.LOCATION_URL]: window.location.href,
      [AttributeNames.REACT_NAME]: react.constructor.name,
      [AttributeNames.REACT_STATE]: state
    }
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
        // TODO: Get parent name and determine if we need to pass in mounting or updating
        return plugin._instrumentFunction(this, 'render', () => { return original!.apply(this, args)}, 'parentName');
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
        const apply = plugin._instrumentFunction(this, 'componentDidMount', () => { return original!.apply(this, args)}, AttributeNames.MOUNTING_SPAN);
        plugin._endParentSpan(this, AttributeNames.MOUNTING_SPAN);
        return apply;
      };
    };
  }

  /**
   * Patches the setState function
   */
  private _patchSetState(){
    return (original: SetStateFunction): SetStateFunction => {
      const plugin = this;
      return function patchSetState(
        this: React.Component,
        ...args
      ): void {
        return plugin._instrumentFunction(this, 'setState()', () => { return original!.apply(this, args)}, AttributeNames.UPDATING_SPAN);;
      };
    };
  }

   /**
   * Patches the forceUpdate function
   */
  private _patchForceUpdate(){
    return (original: ForceUpdateFunction): ForceUpdateFunction => {
      const plugin = this;
      return function patchForceUpdate(
        this: React.Component,
        ...args
      ): void {
        return plugin._instrumentFunction(this, 'forceUpdate()', () => { return original!.apply(this, args)}, AttributeNames.UPDATING_SPAN);;
      };
    };
  }

  /**
   * Patches the shouldComponentUpdate lifecycle method
   */
  private _patchShouldComponentUpdate(){
    return (original: ShouldComponentUpdateFunction): ShouldComponentUpdateFunction => {
      const plugin = this;

      return function patchShouldComponentUpdate(
        this: React.Component,
        ...args
      ): boolean {
        const apply = plugin._instrumentFunction(this, 'shouldComponentUpdate', () => { return original!.apply(this, args)}, AttributeNames.UPDATING_SPAN);
        // if shouldComponentUpdate returns false, the component does not get 
        // updated and no other lifecycle methods get called
        if(!apply){
          plugin._endParentSpan(this, AttributeNames.UPDATING_SPAN);
        }
        
        return apply;
      };
    };
  }


  /**
   * Patches the shouldComponentUpdate lifecycle method
   */
  private _patchGetSnapshotBeforeUpdate(){
    return (original: GetSnapshotBeforeUpdateFunction): GetSnapshotBeforeUpdateFunction => {
      const plugin = this;
    
      return function patchGetSnapshotBeforeUpdate(
        this: React.Component,
        ...args
      ): any {        
        return plugin._instrumentFunction(this, 'getSnapshotBeforeUpdate', () => { return original!.apply(this, args)}, AttributeNames.UPDATING_SPAN);
      };
    };
  }

  /**
   * Patches the componentDidUpdate lifecycle method
   */
  private _patchComponentDidUpdate(){
    return (original: ComponentDidUpdateFunction): ComponentDidUpdateFunction => {
      const plugin = this;

      return function patchComponentDidUpdate(
        this: React.Component,
        ...args
      ): void {
        const apply = plugin._instrumentFunction(this, 'componentDidUpdate', () => { return original!.apply(this, args)}, AttributeNames.UPDATING_SPAN);
        plugin._endParentSpan(this, AttributeNames.UPDATING_SPAN);
        return apply;
      };
    };
  }

  /**
   * Patches the componentWillUnmount lifecycle method
   */
  private _patchComponentWillUnmount(){
    return (original: ComponentWillUnmountFunction): ComponentWillUnmountFunction => {
      const plugin = this;
     
      return function patchComponentWillUnmount(
        this: React.Component,
        ...args
      ): void {
        const apply = plugin._instrumentFunction(this, 'componentWillUnmount', () => { return original!.apply(this, args)}, AttributeNames.UNMOUNTING_SPAN);
        plugin._endParentSpan(this, AttributeNames.UNMOUNTING_SPAN);
        return apply;
      };
    };
  }

  /**
   * implements patch function
   */
  public patch() {
    BaseOpenTelemetryComponent._logger.debug('applying patch to', this.moduleName, this.version);
    
    if (isWrapped(this.render)) {
      shimmer.unwrap(this, 'render');
      BaseOpenTelemetryComponent._logger.debug('removing previous patch from method render');
    }
    if (isWrapped(this.componentDidMount)) {
      shimmer.unwrap(this, 'componentDidMount');
      BaseOpenTelemetryComponent._logger.debug(
        'removing previous patch from method componentDidMount'
      );
    }
    if (isWrapped(this.shouldComponentUpdate)) {
      shimmer.unwrap(this, 'shouldComponentUpdate');
      BaseOpenTelemetryComponent._logger.debug('removing previous patch from method shouldComponentUpdate');
    }
    if (isWrapped(this.getSnapshotBeforeUpdate)) {
      shimmer.unwrap(this, 'getSnapshotBeforeUpdate');
      BaseOpenTelemetryComponent._logger.debug('removing previous patch from method getSnapshotBeforeUpdate');
    }
    if(isWrapped(this.setState)){
      shimmer.unwrap(this, 'setState');
      BaseOpenTelemetryComponent._logger.debug('removing previous patch from method setState');
    }
    if(isWrapped(this.forceUpdate)){
      shimmer.unwrap(this, 'forceUpdate');
      BaseOpenTelemetryComponent._logger.debug('removing previous patch from method forceUpdate');
    }
    if (isWrapped(this.componentDidUpdate)) {
      shimmer.unwrap(this, 'componentDidUpdate');
      BaseOpenTelemetryComponent._logger.debug('removing previous patch from method componentDidUpdate');
    }
    if (isWrapped(this.componentWillUnmount)) {
      shimmer.unwrap(this, 'componentWillUnmount');
      BaseOpenTelemetryComponent._logger.debug('removing previous patch from method componentWillUnmount');
    }

    // Lifecycle methods must exist when patching, even if not defined in component
    if (!this.render) {
      this.render = () => {
        return null;
      };
    }
    if (!this.componentDidMount) {
      this.componentDidMount = () => {};
    }
    if (!this.shouldComponentUpdate) {
      this.shouldComponentUpdate = () => { return true; };
    }
    if (!this.getSnapshotBeforeUpdate) {
      this.getSnapshotBeforeUpdate = () => { return null; };
    }
    if (!this.componentDidUpdate) {
      this.componentDidUpdate = () => {};
    }
    if (!this.componentWillUnmount) {
      this.componentWillUnmount = () => {};
    }

    shimmer.wrap(this, 'render', this._patchRender());
    shimmer.wrap(
      this,
      'componentDidMount',
      this._patchComponentDidMount()
    );
    shimmer.wrap(this, 'setState', this._patchSetState());
    shimmer.wrap(this, 'forceUpdate', this._patchForceUpdate());
    shimmer.wrap(this, 'shouldComponentUpdate', this._patchShouldComponentUpdate());
    shimmer.wrap(this, 'getSnapshotBeforeUpdate', this._patchGetSnapshotBeforeUpdate());
    shimmer.wrap(this, 'componentDidUpdate', this._patchComponentDidUpdate());
    shimmer.wrap(this, 'componentWillUnmount', this._patchComponentWillUnmount());
  }

  /**
   * implements unpatch function
   */
  public unpatch() {
    BaseOpenTelemetryComponent._logger.debug('removing patch from', this.moduleName, this.version);
    
    shimmer.unwrap(this, 'render');
    
    shimmer.unwrap(this, 'componentDidMount');

    shimmer.unwrap(this, 'setState');
    shimmer.unwrap(this, 'forceUpdate');
    shimmer.unwrap(this, 'shouldComponentUpdate');
    shimmer.unwrap(this, 'getSnapshotBeforeUpdate');
    shimmer.unwrap(this, 'componentDidUpdate');

    shimmer.unwrap(this, 'componentWillUnmount');
    
    this._parentSpanMap = new WeakMap<React.Component, api.Span | undefined>();
  }
}
