/* eslint-disable */
import { When, Then, Given } from '@cucumber/cucumber';

Given('a failing step', async function () {
  throw new Error('failing');
});

Given('a passing step', function () {});

When(/I push the button/, async function () {
  await new Promise(resolve => setTimeout(resolve, 10));
});

Then('it is pushed to {string}', function (to) {});

Then('does nothing', function () {});

Then('does something with the table', function (table) {});

When('an ambiguous step is encountered', function () {});
When(/an ambig(.*) step is encountered/, function () {});

Given('a skipped step', function () {
  return 'skipped';
});

Given('a pending step', function () {
  return 'pending';
});

Given('a doc string step', function (docString) {});
