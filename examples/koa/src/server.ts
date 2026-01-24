'use strict';

import * as api from '@opentelemetry/api';
import { setupTracing } from './tracer'
setupTracing('example-koa-server');

// Adding Koa router (if desired)
import * as Router from "@koa/router";
import * as Koa from "koa"


// Setup koa
const app = new Koa();
const PORT = 8081;
const router = new Router();

// route definitions
router.get('/run_test', runTest)
  .get('/post/new', addPost)
  .get('/post/:id', showNewPost);

async function setUp() {
  app.use(noOp);
  app.use(router.routes());
}

/**
 *  Router functions: list, add, or show posts
*/
const posts = ['post 0', 'post 1', 'post 2'];

function addPost(ctx: Koa.Context) {
  const newPostId = posts.length;
  posts.push(`post ${newPostId}`);
  const currentSpan = api.trace.getSpan(api.context.active());
  currentSpan?.addEvent('Added post');
  currentSpan?.setAttribute('post.id', newPostId)
  ctx.body = `Added post: ${posts[posts.length - 1]}`;
  ctx.redirect('/post/3');
}

async function showNewPost(ctx: Koa.Context) {
  const { id } = ctx.params;
  console.log(`showNewPost with id: ${id}`);
  const post = posts[id];
  if (!post) ctx.throw(404, 'Invalid post id');
  const syntheticDelay = 500;
  await new Promise((r) => setTimeout(r, syntheticDelay));
  ctx.body = post;
}

function runTest(ctx: Koa.Context) {
  console.log('runTest');
  const currentSpan = api.trace.getSpan(api.context.active());
  if (currentSpan){
    const { traceId } = currentSpan.spanContext();
    console.log(`traceid: ${traceId}`);
    console.log(`Jaeger URL: http://localhost:16686/trace/${traceId}`);
    console.log(`Zipkin URL: http://localhost:9411/zipkin/traces/${traceId}`);
    ctx.body = `All posts: ${posts}`;
    ctx.redirect('/post/new');
  }
}

async function noOp(ctx: Koa.Context, next: Koa.Next) {
  console.log('Sample basic koa middleware');
  const syntheticDelay = 100;
  await new Promise((r) => setTimeout(r, syntheticDelay));
  next();
}

setUp().then(() => {
  app.listen(PORT);
  console.log(`Listening on http://localhost:${PORT}`);
});
