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

 import * as React from 'react';

 /*
 * method "render" from React.Component
 */
 export type RenderFunction = () => React.ReactNode;

 /*
 * method "componentDidMount" from React.Component
 */
 export type ComponentDidMountFunction = (() => void) | undefined;

 /*
 * method "componentDidUpdate" from React.Component
 */
export type ComponentDidUpdateFunction = ((prevProps: Readonly<{}>, prevState: Readonly<{}>, snapshot?: any) => void) | undefined;

 /*
 * method "shouldComponentUpdate" from React.Component
 */
export type ShouldComponentUpdateFunction = ((nextProps: Readonly<{}>, nextState: Readonly<{}>, nextContext: any) => boolean) | undefined;

 /*
 * method "setState" from React.Component
 */
export type SetStateFunction = <K extends never>(state: {} | ((prevState: Readonly<{}>, props: Readonly<{}>) => {} | Pick<{}, K> | null) | Pick<{}, K> | null, callback?: (() => void) | undefined) => void;

/*
 * method "setState" from React.Component
 */
export type ForceUpdateFunction = (callback?: (() => void) | undefined) => void;

/*
 * method "getSnapshotBeforeUpdate" from React.Component
 */
export type GetSnapshotBeforeUpdateFunction = ((prevProps: Readonly<{}>, prevState: Readonly<{}>) => any) | undefined;

/*
 * method "componentWillUnmount" from React.Component
 */
export type ComponentWillUnmountFunction = (() => void) | undefined;