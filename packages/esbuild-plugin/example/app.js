const http = require('http');
const fastify = require('fastify');
const {createClient} = require('redis');
// const clientS3 = require('@aws-sdk/client-s3');
// console.log('XXX client-s3: ', !!clientS3);

const redis = createClient();

const server = fastify();
server.get('/ping', async (req, reply) => {
    const bar = await redis.get('bar');
    reply.send(`pong (redis key "bar" is: ${bar})`);
});

async function main() {
    await redis.connect();
    await redis.set('bar', 'baz');

    await server.listen({port: 3000});
    const port = server.server.address().port;
    await new Promise((resolve) => {
        http.get(`http://localhost:${port}/ping`, (res) => {
            const chunks = [];
            res.on('data', (chunk) => { chunks.push(chunk); });
            res.on('end', () => {
              console.log('client res: status=%s headers=%s body=%s',
                res.statusCode, res.headers, Buffer.concat(chunks).toString());
              resolve();
            });
        });
    });
    server.close();

    await redis.quit();

    setTimeout(function () {
      console.log('Done lame wait for batch span send.')
      // console.log('XXX ', process._getActiveHandles());
    }, 10000);
}

main();
