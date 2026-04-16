/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type * as amqp from 'amqplib';
import type * as amqpCallback from 'amqplib/callback_api';
import { expect } from 'expect';

export const asyncConfirmSend = (
  confirmChannel: amqp.ConfirmChannel | amqpCallback.ConfirmChannel,
  queueName: string,
  msgPayload: string,
  callback?: () => void
): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const hadSpaceInBuffer = confirmChannel.sendToQueue(
      queueName,
      Buffer.from(msgPayload),
      {},
      err => {
        try {
          callback?.();
          resolve();
        } catch (e) {
          reject(e);
        }
      }
    );
    expect(hadSpaceInBuffer).toBeTruthy();
  });
};

export const asyncConfirmPublish = (
  confirmChannel: amqp.ConfirmChannel | amqpCallback.ConfirmChannel,
  exchange: string,
  routingKey: string,
  msgPayload: string,
  callback?: () => void
): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const hadSpaceInBuffer = confirmChannel.publish(
      exchange,
      routingKey,
      Buffer.from(msgPayload),
      {},
      err => {
        try {
          callback?.();
          resolve();
        } catch (e) {
          reject(e);
        }
      }
    );
    expect(hadSpaceInBuffer).toBeTruthy();
  });
};

export const asyncConsume = (
  channel:
    | amqp.Channel
    | amqpCallback.Channel
    | amqp.ConfirmChannel
    | amqpCallback.ConfirmChannel,
  queueName: string,
  callback: (((msg: amqp.Message) => unknown) | null)[],
  options?: amqp.Options.Consume
): Promise<amqp.Message[]> => {
  const msgs: amqp.Message[] = [];
  return new Promise(resolve =>
    channel.consume(
      queueName,
      msg => {
        if (!msg) {
          throw Error('received null msg');
        }
        msgs.push(msg);
        try {
          callback[msgs.length - 1]?.(msg);
          if (msgs.length >= callback.length) {
            setImmediate(() => resolve(msgs));
          }
        } catch (err) {
          setImmediate(() => resolve(msgs));
          throw err;
        }
      },
      options
    )
  );
};

export const shouldTest = !!process.env.RUN_RABBIT_TESTS;
