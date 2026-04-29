/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
 */
import * as typeorm from 'typeorm';

@typeorm.Entity()
export class User {
  @typeorm.PrimaryColumn()
  id: number;

  @typeorm.Column()
  firstName: string;

  @typeorm.Column()
  lastName: string;

  constructor(id: number, firstName: string, lastName: string) {
    this.id = id;
    this.firstName = firstName;
    this.lastName = lastName;
  }
}

export const defaultOptions: any = {
  type: 'sqlite',
  database: ':memory:',
  dropSchema: true,
  synchronize: true,
  entities: [User],
};
