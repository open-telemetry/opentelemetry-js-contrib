/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Schema, Document } from 'mongoose';
import * as mongoose from 'mongoose';

export interface IUser extends Document {
  email: string;
  firstName: string;
  lastName: string;
  age: number;
}

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  age: { type: Number, required: false },
});

// Export the model with type assertion to work around mongoose@9 type instantiation issues
// @ts-expect-error - mongoose@9 has excessively deep type instantiation in model()
const User = mongoose.model('User', UserSchema) as mongoose.Model<IUser>;
export default User;

export const loadUsers = async () => {
  await User.insertMany([
    new User({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      age: 18,
    }),
    new User({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      age: 19,
    }),
    new User({
      firstName: 'Michael',
      lastName: 'Fox',
      email: 'michael.fox@example.com',
      age: 16,
    }),
  ]);
  await User.createIndexes();
};
