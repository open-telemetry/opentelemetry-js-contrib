/* eslint-disable */
import { BeforeStep, AfterStep, After, Before } from '@cucumber/cucumber';

Before('@skip', function () {
  return 'skipped';
});

Before('@pending', function () {
  return 'pending';
});

Before(async gherkinDocument => {
  if (gherkinDocument.pickle.name === 'Fails Before Hook') {
    throw new Error('error');
  }
});

BeforeStep(async gherkinDocument => {
  if (gherkinDocument.pickle.name === 'Fails BeforeStep Hook') {
    throw new Error('error');
  }
});

AfterStep(async gherkinDocument => {
  if (gherkinDocument.pickle.name === 'Fails AfterStep Hook') {
    throw new Error('error');
  }
});

After(async gherkinDocument => {
  if (gherkinDocument.pickle.name === 'Fails After Hook') {
    throw new Error('error');
  }
});
