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

import { Attributes } from '@opentelemetry/api'; 

// Template function from: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
const escapeRegExp = (regExPattern: string): string => {
     // removed * and ? so they don't get escaped to maintain them as a wildcard match
    return regExPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&"); 
  }


const convertPatternToRegex = (pattern: string) : string => {
    let regexPattern: string = "";

    regexPattern = escapeRegExp(pattern).replace(/\*/g, ".*")
    regexPattern = regexPattern.replace(/\?/g, ".")

    return regexPattern;
}


export const wildcardMatch = (pattern?: string, text?: any): boolean => {
    if (pattern === '*') return true;
    if (pattern === undefined || text === undefined) return false; 

    if (pattern.length === 0) return text.length === 0; 

    let match = text.toLowerCase().match(convertPatternToRegex(pattern.toLowerCase()));

    if(match === null){
        console.log(`WildcardMatch: no match found for ${text}`);
        return false; 
    }

    return true; 
}

export const attributeMatch = (attributes: Attributes | undefined, ruleAttributes: any) : boolean => {

    if (!ruleAttributes || Object.keys(ruleAttributes).length === 0) {
        return true; 
    }

    if (attributes === undefined){
        return false; 
    }

    let matchedCount: number = 0; 
    for (const [key, value] of Object.entries(attributes)) {
        let foundKey = Object.keys(ruleAttributes).find(ruleKey => ruleKey === key);
        let foundPattern;

        if (foundKey){
           foundPattern = ruleAttributes[foundKey] 
        } else {
            continue;
        }
        
        console.log(foundPattern);


        if(wildcardMatch(foundPattern, value)) {
            // increment matched count 
            matchedCount += 1; 
        }
    }

    if (matchedCount === Object.keys(ruleAttributes).length) {
        return true;
    }

    return false; 
}
