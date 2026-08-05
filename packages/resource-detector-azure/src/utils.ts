/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CONTAINER_APP_ENV_DNS_SUFFIX,
  CONTAINER_APP_HOSTNAME,
  CONTAINER_APP_NAME,
  CONTAINER_APP_PORT,
  CONTAINER_APP_REPLICA_NAME,
  CONTAINER_APP_REVISION,
  FUNCTIONS_VERSION,
  WEBSITE_OWNER_NAME,
  WEBSITE_RESOURCE_GROUP,
  WEBSITE_SKU,
} from './types';

export function getAzureResourceUri(
  websiteSiteName: string
): string | undefined {
  const websiteResourceGroup = process.env[WEBSITE_RESOURCE_GROUP];
  const websiteOwnerName = process.env[WEBSITE_OWNER_NAME];

  let subscriptionId = websiteOwnerName;
  if (websiteOwnerName && websiteOwnerName.indexOf('+') !== -1) {
    subscriptionId = websiteOwnerName.split('+')[0];
  }

  if (!subscriptionId && !websiteOwnerName) {
    return undefined;
  }

  return `/subscriptions/${subscriptionId}/resourceGroups/${websiteResourceGroup}/providers/Microsoft.Web/sites/${websiteSiteName}`;
}

export function isAzureFunction(): boolean {
  return !!(
    process.env[FUNCTIONS_VERSION] ||
    process.env[WEBSITE_SKU] === 'FlexConsumption'
  );
}

export function isAzureContainerApps(): boolean {
  return !!(
    process.env[CONTAINER_APP_NAME] &&
    process.env[CONTAINER_APP_REVISION] &&
    process.env[CONTAINER_APP_HOSTNAME] &&
    process.env[CONTAINER_APP_ENV_DNS_SUFFIX] &&
    process.env[CONTAINER_APP_PORT] &&
    process.env[CONTAINER_APP_REPLICA_NAME]
  );
}
