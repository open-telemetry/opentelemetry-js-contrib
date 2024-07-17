require('@babel/register')({
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  exclude: [/node_modules\/.*react-native/],
});

const { JSDOM } = require('jsdom');
const dom = new JSDOM();

global.__DEV__ = true;
global.ShadowRoot = dom.window.ShadowRoot;
