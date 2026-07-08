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

// typeorm 1.x removed the 'sqlite' driver in favour of 'better-sqlite3'.
// Detect which driver is available at runtime so tests run with either version.
function detectDriver(): 'sqlite' | 'better-sqlite3' {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('typeorm/driver/sqlite/SqliteDriver');
    return 'sqlite';
  } catch {
    return 'better-sqlite3';
  }
}

const driver = detectDriver();

function buildOptions(extra: Record<string, unknown> = {}): any {
  if (driver === 'better-sqlite3') {
    return {
      type: 'better-sqlite3',
      database: ':memory:',
      dropSchema: true,
      synchronize: true,
      entities: [User],
      ...extra,
    };
  }
  return {
    type: 'sqlite',
    database: ':memory:',
    dropSchema: true,
    synchronize: true,
    entities: [User],
    ...extra,
  };
}

export const defaultOptions: any = buildOptions();

// Options for a second connection used in multi-connection tests.
export const secondaryOptions: any =
  driver === 'sqlite'
    ? buildOptions({ name: 'connection2', database: 'connection2.db' })
    : buildOptions();
