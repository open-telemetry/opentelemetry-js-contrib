/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

import { getFiles, setupPrecaching, setupRouting } from 'preact-cli/sw/';

setupRouting();
setupPrecaching(getFiles());
