export const isPromise = (value: any): value is Promise<unknown> => {
  return typeof value?.then === 'function';
};