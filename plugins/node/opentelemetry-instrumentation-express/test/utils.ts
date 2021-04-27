import * as http from 'http';
import type { AddressInfo } from 'net';
import type { Express } from 'express';

export const httpRequest = {
  get: (options: http.ClientRequestArgs | string) => {
    return new Promise((resolve, reject) => {
      return http.get(options, resp => {
        let data = '';
        resp.on('data', chunk => {
          data += chunk;
        });
        resp.on('end', () => {
          resolve(data);
        });
        resp.on('error', err => {
          reject(err);
        });
      });
    });
  },
};

export async function createServer(app: Express) {
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, port };
}
