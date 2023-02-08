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
import type { Member, FunctionPropertyNames } from './types';
import type * as fs from 'fs';
type FS = typeof fs;

export function splitTwoLevels<FSObject>(
  functionName: Member<FSObject> & string
):
  | { oneLevel: FunctionPropertyNames<FSObject> }
  | { twoLevel: [FunctionPropertyNames<FSObject>, string] } {
  const memberParts = functionName.split('.');
  if (memberParts.length > 1) {
    if (memberParts.length !== 2)
      throw Error(`Invalid member function name ${functionName}`);
    return {
      twoLevel: memberParts as [FunctionPropertyNames<FSObject>, string],
    };
  } else {
    return {
      oneLevel: functionName as FunctionPropertyNames<FSObject>,
    };
  }
}

export function indexFs<FSObject extends FS | FS['promises']>(
  fs: FSObject,
  member: Member<FSObject> & string
): { objectToPatch: any; functionNameToPatch: string } {
  if (!member) throw new Error(JSON.stringify({ member }));
  const splitResult = splitTwoLevels<FSObject>(member);
  if ('twoLevel' in splitResult) {
    const [functionName1, functionName2] = splitResult.twoLevel;
    return {
      objectToPatch: fs[functionName1],
      functionNameToPatch: functionName2,
    };
  } else {
    return { objectToPatch: fs, functionNameToPatch: member };
  }
}
