const obj = {};
Object.defineProperty(obj, 'handler', {
  get: () => handler,
  enumerable: true,
  configurable: false, // ❗️Nicht konfigurierbar = Problem für Shimmer
});

module.exports = obj;

async function handler(event) {
  return 'ok';
}
