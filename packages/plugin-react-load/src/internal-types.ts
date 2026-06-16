/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
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
export type ComponentDidUpdateFunction =
  | ((
      prevProps: Readonly<any>,
      prevState: Readonly<any>,
      snapshot?: any
    ) => void)
  | undefined;

/*
 * method "shouldComponentUpdate" from React.Component
 */
export type ShouldComponentUpdateFunction =
  | ((
      nextProps: Readonly<any>,
      nextState: Readonly<any>,
      nextContext: any
    ) => boolean)
  | undefined;

/*
 * method "setState" from React.Component
 */
export type SetStateFunction = <K extends never>(
  state:
    | any
    | ((
        prevState: Readonly<any>,
        props: Readonly<any>
      ) => any | Pick<any, K> | null)
    | Pick<any, K>
    | null,
  callback?: (() => void) | undefined
) => void;

/*
 * method "setState" from React.Component
 */
export type ForceUpdateFunction = (callback?: (() => void) | undefined) => void;

/*
 * method "getSnapshotBeforeUpdate" from React.Component
 */
export type GetSnapshotBeforeUpdateFunction =
  | ((prevProps: Readonly<any>, prevState: Readonly<any>) => any)
  | undefined;

/*
 * method "componentWillUnmount" from React.Component
 */
export type ComponentWillUnmountFunction = (() => void) | undefined;
