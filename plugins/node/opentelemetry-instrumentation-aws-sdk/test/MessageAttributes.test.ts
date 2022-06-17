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

import * as expect from 'expect';
import {
  MAX_MESSAGE_ATTRIBUTES,
  contextSetter,
  injectPropagationContext,
  addPropagationFieldsToAttributeNames,
} from '../src/services/MessageAttributes';

describe('MessageAttributes', () => {
  describe('MAX_MESSAGE_ATTRIBUTES', () => {
    it('should be 10', () => {
      expect(MAX_MESSAGE_ATTRIBUTES).toBe(10);
    });
  });

  describe('contextSetter', () => {
    it('should set parent context in sqs receive callback', () => {
      const contextKey = 'key';
      const contextValue = 'value';
      const contextCarrier = {};
      contextSetter.set(contextCarrier, contextKey, contextValue);

      const expectedContext = {
        [contextKey]: { DataType: 'String', StringValue: contextValue },
      };
      expect(contextCarrier).toStrictEqual(expectedContext);
    });
  });

  describe('injectPropagationContext', () => {
    it('should inject context if there are available attributes', () => {
      const contextAttributes = {
        key1: { DataType: 'String', StringValue: 'value1' },
        key2: { DataType: 'String', StringValue: 'value2' },
        key3: { DataType: 'String', StringValue: 'value3' },
        key4: { DataType: 'String', StringValue: 'value4' },
        key5: { DataType: 'String', StringValue: 'value5' },
      };

      expect(Object.keys(contextAttributes).length).toBe(5);
      injectPropagationContext(contextAttributes);
      expect(Object.keys(contextAttributes).length).toBeGreaterThan(5);
    });

    it('should not inject context if there not enough available attributes', () => {
      const contextAttributes = {
        key1: { DataType: 'String', StringValue: 'value1' },
        key2: { DataType: 'String', StringValue: 'value2' },
        key3: { DataType: 'String', StringValue: 'value3' },
        key4: { DataType: 'String', StringValue: 'value4' },
        key5: { DataType: 'String', StringValue: 'value5' },
        key6: { DataType: 'String', StringValue: 'value6' },
        key7: { DataType: 'String', StringValue: 'value7' },
        key8: { DataType: 'String', StringValue: 'value8' },
        key9: { DataType: 'String', StringValue: 'value9' },
        key10: { DataType: 'String', StringValue: 'value10' },
      };

      expect(Object.keys(contextAttributes).length).toBe(10);
      injectPropagationContext(contextAttributes);
      expect(Object.keys(contextAttributes).length).toBe(10);
    });
  });

  describe('addPropagationFieldsToAttributeNames', () => {
    const messageAttributeNames = ['name 1', 'name 2', 'name 1'];
    const propagationFields = ['traceparent'];

    it('should remove duplicate message attribute names and add propagation fields', () => {
      expect(
        addPropagationFieldsToAttributeNames(
          messageAttributeNames,
          propagationFields
        )
      ).toEqual(['name 1', 'name 2', 'traceparent']);
    });

    it('should return propagation fields if no message attribute names are set', () => {
      expect(
        addPropagationFieldsToAttributeNames(undefined, propagationFields)
      ).toEqual(['traceparent']);
    });
  });
});
