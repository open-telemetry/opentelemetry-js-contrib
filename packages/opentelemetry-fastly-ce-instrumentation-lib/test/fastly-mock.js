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

'use strict';

// #######################################################################################################################################
//    _________       __                    _____                 __     .___  __
//   /   _____/ _____/  |_ __ ________     /     \   ____   ____ |  | __ |   |/  |_  ____   _____   ______
//   \_____  \_/ __ \   __\  |  \____ \   /  \ /  \ /  _ \_/ ___\|  |/ / |   \   __\/ __ \ /     \ /  ___/
//   /        \  ___/|  | |  |  /  |_> > /    Y    (  <_> )  \___|    <  |   ||  | \  ___/|  Y Y  \\___ \
//  /_______  /\___  >__| |____/|   __/  \____|__  /\____/ \___  >__|_ \ |___||__|  \___  >__|_|  /____  >
//          \/     \/           |__|             \/            \/     \/                \/      \/     \/
// #######################################################################################################################################

global.fastly = {
  getLogger: function () {
    let logger = {
      log: function (logMessage) {
        return logMessage;
      },
    };
    return logger;
  },
  env: {
    get: function (envVariable) {
      if (envVariable === 'FASTLY_HOSTNAME') {
        return 'cache-ams12345';
      } else if (envVariable === 'FASTLY_SERVICE_ID') {
        return '123456789';
      } else if (envVariable === 'FASTLY_SERVICE_VERSION') {
        return '101';
      } else {
        return 'N_A';
      }
    },
  },
};

global.CacheOverride = function () {};

class RequestEvent {
  constructor() {
    this.request = {
      headers: {
        get: function (headerKey) {
          let headerValue = '';
          if (this[headerKey] !== undefined) {
            headerValue = this[headerKey];
          }
          return headerValue;
        },
        set: function (headerKey, headerValue) {
          this[headerKey] = headerValue;
        },
      },
    };
    this.waitUntil = async function (myFunction) {
      return await myFunction;
    };
  }
}

const wait = async function (intTimeMs) {
  await new Promise(resolve => setTimeout(resolve, intTimeMs));
};

module.exports = {
  RequestEvent,
  wait,
};
