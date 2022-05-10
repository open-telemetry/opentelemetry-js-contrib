/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type * as amqp from 'amqplib';
import type * as amqpCallback from 'amqplib/callback_api';
import * as expect from 'expect';

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
