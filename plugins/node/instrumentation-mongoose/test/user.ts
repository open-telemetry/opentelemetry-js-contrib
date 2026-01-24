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
import { Schema, Document } from 'mongoose';
import * as mongoose from 'mongoose';

export interface IUser extends Document {
  email: string;
  firstName: string;
  lastName: string;
  age: number;
}

const UserSchema: Schema = new Schema({
  email: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  age: { type: Number, required: false },
});

// Export the model and return your IUser interface
const User = mongoose.model<IUser>('User', UserSchema);
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
