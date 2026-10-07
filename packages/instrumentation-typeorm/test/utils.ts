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

// typeorm@1.0.0 removed the `sqlite` (sqlite3) driver in favor of
// `better-sqlite3`, so pick whichever driver the installed typeorm supports.
export const sqliteDriverType: 'sqlite' | 'better-sqlite3' = (() => {
  try {
    require.resolve('typeorm/driver/sqlite/SqliteDriver');
    return 'sqlite';
  } catch {
    return 'better-sqlite3';
  }
})();

export const defaultOptions: any = {
  type: sqliteDriverType,
  database: ':memory:',
  dropSchema: true,
  synchronize: true,
  entities: [User],
};
