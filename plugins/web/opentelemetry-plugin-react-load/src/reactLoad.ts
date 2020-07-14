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
  ComponentDidMountFunction,
  ComponentDidUpdateFunction,
  ShouldComponentUpdateFunction,
  SetStateFunction,
  ForceUpdateFunction,
  GetSnapshotBeforeUpdateFunction,
  ComponentWillUnmountFunction
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
    return this._tracer.startSpan(name, {
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
        return plugin._instrumentFunction(this, 'render', () => { return original.apply(this, args)}, 'parentName');
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
        const apply = plugin._instrumentFunction(this, 'componentDidMount', () => { return original.apply(this, args)}, AttributeNames.MOUNTING_SPAN);
        plugin._endParentSpan(this, AttributeNames.MOUNTING_SPAN)
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
        return plugin._instrumentFunction(this, 'setState()', () => { return original.apply(this, args)}, AttributeNames.UPDATING_SPAN);;
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
        return plugin._instrumentFunction(this, 'forceUpdate()', () => { return original.apply(this, args)}, AttributeNames.UPDATING_SPAN);;
      };
    };
  }

  /**
   * Patches the shouldComponentUpdate lifecycle method
   */
  private _patchShouldComponentUpdate(){
    return (original: ShouldComponentUpdateFunction): ShouldComponentUpdateFunction => {
      const plugin = this;
      if (!original) {
        this._logger.debug(
          'shouldComponentUpdate function was undefined, should always be defined when patching.'
        );
        return;
      }

      return function patchShouldComponentUpdate(
        this: React.Component,
        ...args
      ): boolean {
        const apply = plugin._instrumentFunction(this, 'shouldComponentUpdate', () => { return original.apply(this, args)}, AttributeNames.UPDATING_SPAN);
        // if shouldComponentUpdate returns false, the component does not get 
        // updated and no other lifecycle methods get called
        if(apply === false){
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
      if (!original) {
        this._logger.debug(
          'getSnapshotBeforeUpdate function was undefined, should always be defined when patching.'
        );
        return;
      }

      return function patchGetSnapshotBeforeUpdate(
        this: React.Component,
        ...args
      ): any {        
        return plugin._instrumentFunction(this, 'getSnapshotBeforeUpdate', () => { return original.apply(this, args)}, AttributeNames.UPDATING_SPAN);
      };
    };
  }

  /**
   * Patches the componentDidUpdate lifecycle method
   */
  private _patchComponentDidUpdate(){
    return (original: ComponentDidUpdateFunction): ComponentDidUpdateFunction => {
      const plugin = this;
      if (!original) {
        this._logger.debug(
          'componentDidUpdate function was undefined, should always be defined when patching.'
        );
        return;
      }

      return function patchComponentDidUpdate(
        this: React.Component,
        ...args
      ): void {
        const apply = plugin._instrumentFunction(this, 'componentDidUpdate', () => { return original.apply(this, args)}, AttributeNames.UPDATING_SPAN);
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
      if (!original) {
        this._logger.debug(
          'componentWillUnmount function was undefined, should always be defined when patching.'
        );
        return;
      }

      return function patchComponentWillUnmount(
        this: React.Component,
        ...args
      ): void {
        const apply = plugin._instrumentFunction(this, 'componentWillUnmount', () => { return original.apply(this, args)}, AttributeNames.UNMOUNTING_SPAN);
        plugin._endParentSpan(this, AttributeNames.UNMOUNTING_SPAN);
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
      if (isWrapped(prototype.render)) {
        shimmer.unwrap(prototype, 'render');
        this._logger.debug('removing previous patch from method render');
      }
      if (isWrapped(prototype.componentDidMount)) {
        shimmer.unwrap(prototype, 'componentDidMount');
        this._logger.debug(
          'removing previous patch from method componentDidMount'
        );
      }
      if (isWrapped(prototype.shouldComponentUpdate)) {
        shimmer.unwrap(prototype, 'shouldComponentUpdate');
        this._logger.debug('removing previous patch from method shouldComponentUpdate');
      }
      if (isWrapped(prototype.getSnapshotBeforeUpdate)) {
        shimmer.unwrap(prototype, 'getSnapshotBeforeUpdate');
        this._logger.debug('removing previous patch from method getSnapshotBeforeUpdate');
      }
      if(isWrapped(prototype.setState)){
        shimmer.unwrap(prototype, 'setState');
        this._logger.debug('removing previous patch from method setState');
      }
      if(isWrapped(prototype.forceUpdate)){
        shimmer.unwrap(prototype, 'forceUpdate');
        this._logger.debug('removing previous patch from method forceUpdate');
      }
      if (isWrapped(prototype.componentDidUpdate)) {
        shimmer.unwrap(prototype, 'componentDidUpdate');
        this._logger.debug('removing previous patch from method componentDidUpdate');
      }
      if (isWrapped(prototype.componentWillUnmount)) {
        shimmer.unwrap(prototype, 'componentWillUnmount');
        this._logger.debug('removing previous patch from method componentWillUnmount');
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
      if (!prototype.shouldComponentUpdate) {
        prototype.shouldComponentUpdate = () => { return true; };
      }
      if (!prototype.getSnapshotBeforeUpdate) {
        prototype.getSnapshotBeforeUpdate = () => { return null; };
      }
      if (!prototype.componentDidUpdate) {
        prototype.componentDidUpdate = () => {};
      }
      if (!prototype.componentWillUnmount) {
        prototype.componentWillUnmount = () => {};
      }

      shimmer.wrap(prototype, 'render', this._patchRender());
      shimmer.wrap(
        prototype,
        'componentDidMount',
        this._patchComponentDidMount()
      );
      shimmer.wrap(prototype, 'setState', this._patchSetState());
      shimmer.wrap(prototype, 'forceUpdate', this._patchForceUpdate());
      shimmer.wrap(prototype, 'shouldComponentUpdate', this._patchShouldComponentUpdate());
      shimmer.wrap(prototype, 'getSnapshotBeforeUpdate', this._patchGetSnapshotBeforeUpdate());
      shimmer.wrap(prototype, 'componentDidUpdate', this._patchComponentDidUpdate());
      shimmer.wrap(prototype, 'componentWillUnmount', this._patchComponentWillUnmount());
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
  
      shimmer.unwrap(prototype, 'setState');
      shimmer.unwrap(prototype, 'forceUpdate');
      shimmer.unwrap(prototype, 'shouldComponentUpdate');
      shimmer.unwrap(prototype, 'getSnapshotBeforeUpdate');
      shimmer.unwrap(prototype, 'componentDidUpdate');

      shimmer.unwrap(prototype, 'componentWillUnmount');
    });

    this._parentSpanMap = new WeakMap<React.Component, api.Span | undefined>();
  }
}
