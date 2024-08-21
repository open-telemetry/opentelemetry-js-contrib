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
import * as assert from 'assert';
import { SequelizeInstrumentation } from '../src';
import { extractTableFromQuery } from '../src/utils';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  context,
  diag,
  SpanStatusCode,
  DiagConsoleLogger,
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import {
  SEMATTRS_DB_NAME,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SQL_TABLE,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
  SEMATTRS_DB_OPERATION,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_USER,
} from '@opentelemetry/semantic-conventions';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(
  new SequelizeInstrumentation()
);

import * as sequelize from 'sequelize';

type QueryFunction = typeof sequelize.Sequelize.prototype.query;

describe('instrumentation-sequelize', () => {
  const getSequelizeSpans = (): ReadableSpan[] => {
    return getTestSpans().filter(s =>
      s.instrumentationLibrary.name.includes('sequelize')
    ) as ReadableSpan[];
  };

  beforeEach(() => {
    instrumentation.enable();
  });

  afterEach(() => {
    instrumentation.disable();
  });

  describe('postgres', () => {
    const DB_SYSTEM = 'postgres';
    const DB_USER = 'some-user';
    const NET_PEER_NAME = 'localhost';
    const NET_PEER_PORT = 12345;
    const DB_NAME = 'my-db';

    const instance = new sequelize.Sequelize(
      `${DB_SYSTEM}://${DB_USER}@${NET_PEER_NAME}:${NET_PEER_PORT}/${DB_NAME}`,
      { logging: false }
    );
    class User extends sequelize.Model {
      firstName: string = '';
    }

    User.init(
      { firstName: { type: sequelize.DataTypes.STRING } },
      { sequelize: instance }
    );

    it('create is instrumented', async () => {
      try {
        await User.create({ firstName: 'OpenTelemetry' });
      } catch {
        // Error is thrown but we don't care
      }
      const spans = getSequelizeSpans();
      assert.strictEqual(spans.length, 1);
      assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
      const attributes = spans[0].attributes;

      assert.strictEqual(attributes[SEMATTRS_DB_SYSTEM], DB_SYSTEM);
      assert.strictEqual(attributes[SEMATTRS_DB_USER], DB_USER);
      assert.strictEqual(attributes[SEMATTRS_NET_PEER_NAME], NET_PEER_NAME);
      assert.strictEqual(attributes[SEMATTRS_NET_PEER_PORT], NET_PEER_PORT);
      assert.strictEqual(attributes[SEMATTRS_DB_NAME], DB_NAME);
      assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'INSERT');
      assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'Users');
      assert.match(
        attributes[SEMATTRS_DB_STATEMENT] as string,
        /INSERT INTO "Users" \("id","firstName","createdAt","updatedAt"\) VALUES \(DEFAULT,\$1,\$2,\$3\) RETURNING (\*|"id","firstName","createdAt","updatedAt");/,
      );
    });

    it('findAll is instrumented', async () => {
      await User.findAll().catch(() => {});
      const spans = getSequelizeSpans();
      assert.strictEqual(spans.length, 1);
      const attributes = spans[0].attributes;

      assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'SELECT');
      assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'Users');
      assert.strictEqual(
        attributes[SEMATTRS_DB_STATEMENT],
        'SELECT "id", "firstName", "createdAt", "updatedAt" FROM "Users" AS "User";'
      );
    });

    it('destroy is instrumented', async () => {
      await User.destroy({ where: {}, truncate: true }).catch(() => {});
      const spans = getSequelizeSpans();
      assert.strictEqual(spans.length, 1);
      const attributes = spans[0].attributes;

      assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'BULKDELETE');
      assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'Users');
      assert.strictEqual(attributes[SEMATTRS_DB_STATEMENT], 'TRUNCATE "Users"');
    });

    it('count is instrumented', async () => {
      await User.count().catch(() => {});
      const spans = getSequelizeSpans();
      assert.strictEqual(spans.length, 1);
      const attributes = spans[0].attributes;

      assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'SELECT');
      assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'Users');
      assert.strictEqual(
        attributes[SEMATTRS_DB_STATEMENT],
        'SELECT count(*) AS "count" FROM "Users" AS "User";'
      );
    });

    it('handled complex query', async () => {
      const Op = sequelize.Op;
      await User.findOne({
        where: {
          username: 'Shlomi',
          rank: {
            [Op.or]: {
              [Op.lt]: 1000,
              [Op.eq]: null,
            },
          },
        },
        attributes: ['id', 'username'],
        order: [['username', 'DESC']],
        limit: 10,
        offset: 5,
      }).catch(() => {});

      const spans = getSequelizeSpans();
      assert.strictEqual(spans.length, 1);
      const attributes = spans[0].attributes;

      assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'SELECT');
      assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'Users');
      assert.strictEqual(
        attributes[SEMATTRS_DB_STATEMENT],
        'SELECT "id", "username" FROM "Users" AS "User" WHERE "User"."username" = \'Shlomi\' AND ("User"."rank" < 1000 OR "User"."rank" IS NULL) ORDER BY "User"."username" DESC LIMIT 10 OFFSET 5;'
      );
    });

    it('tableName is taken from init override', async () => {
      class Planet extends sequelize.Model {}
      const expectedTableName = 'solar-system';
      Planet.init({}, { sequelize: instance, tableName: expectedTableName });

      await Planet.findAll().catch(() => {});
      const spans = getSequelizeSpans();
      assert.strictEqual(spans.length, 1);
      const attributes = spans[0].attributes;
      assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], expectedTableName);
    });

    it('handles JOIN queries', async () => {
      class Dog extends sequelize.Model {
        firstName: string = '';
      }

      Dog.init(
        {
          firstName: { type: sequelize.DataTypes.STRING },
          owner: { type: sequelize.DataTypes.STRING },
        },
        { sequelize: instance }
      );
      Dog.belongsTo(User, { foreignKey: 'firstName' });
      User.hasMany(Dog, { foreignKey: 'firstName' });

      await Dog.findOne({
        attributes: ['firstName', 'owner'],
        include: [
          {
            model: User,
            attributes: ['firstName'],
            required: true,
          },
        ],
      }).catch(() => {});

      const spans = getSequelizeSpans();
      assert.strictEqual(spans.length, 1);
      const attributes = spans[0].attributes;

      assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'SELECT');
      assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'Dogs,Users');
      assert.strictEqual(
        attributes[SEMATTRS_DB_STATEMENT],
        'SELECT "Dog"."id", "Dog"."firstName", "Dog"."owner", "User"."id" AS "User.id", "User"."firstName" AS "User.firstName" FROM "Dogs" AS "Dog" INNER JOIN "Users" AS "User" ON "Dog"."firstName" = "User"."id" LIMIT 1;'
      );
    });
  });

  describe('mysql', () => {
    const DB_SYSTEM = 'mysql';
    const DB_USER = 'RickSanchez';
    const NET_PEER_NAME = 'localhost';
    const NET_PEER_PORT = 34567;
    const DB_NAME = 'mysql-db';

    const instance = new sequelize.Sequelize(DB_NAME, DB_USER, 'password', {
      host: NET_PEER_NAME,
      port: NET_PEER_PORT,
      dialect: DB_SYSTEM,
    });

    instance.define('User', {
      firstName: { type: sequelize.DataTypes.STRING },
    });

    it('create is instrumented', async () => {
      await instance.models.User.create({ firstName: 'OpenTelemetry' }).catch(
        () => {}
      );
      const spans = getSequelizeSpans();
      assert.strictEqual(spans.length, 1);
      assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
      const attributes = spans[0].attributes;

      assert.strictEqual(attributes[SEMATTRS_DB_SYSTEM], DB_SYSTEM);
      assert.strictEqual(attributes[SEMATTRS_DB_USER], DB_USER);
      assert.strictEqual(attributes[SEMATTRS_NET_PEER_NAME], NET_PEER_NAME);
      assert.strictEqual(attributes[SEMATTRS_NET_PEER_PORT], NET_PEER_PORT);
      assert.strictEqual(attributes[SEMATTRS_DB_NAME], DB_NAME);
      assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'INSERT');
      assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'Users');
      assert.strictEqual(
        attributes[SEMATTRS_DB_STATEMENT],
        'INSERT INTO `Users` (`id`,`firstName`,`createdAt`,`updatedAt`) VALUES (DEFAULT,$1,$2,$3);'
      );
    });

    it('findAll is instrumented', async () => {
      await instance.models.User.findAll().catch(() => {});
      const spans = getSequelizeSpans();
      assert.strictEqual(spans.length, 1);
      const attributes = spans[0].attributes;

      assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'SELECT');
      assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'Users');
      assert.strictEqual(
        attributes[SEMATTRS_DB_STATEMENT],
        'SELECT `id`, `firstName`, `createdAt`, `updatedAt` FROM `Users` AS `User`;'
      );
    });

    describe('query is instrumented', () => {
      it('with options not specified', async () => {
        try {
          await instance.query('SELECT 1 + 1');
        } catch {
          // Do not care about the error
        }
        const spans = getSequelizeSpans();
        assert.strictEqual(spans.length, 1);
        const attributes = spans[0].attributes;

        assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'SELECT');
        assert.strictEqual(attributes[SEMATTRS_DB_STATEMENT], 'SELECT 1 + 1');
      });
      it('with type not specified in options', async () => {
        try {
          await instance.query('SELECT 1 + 1', {});
        } catch {
          // Do not care about the error
        }
        const spans = getSequelizeSpans();
        assert.strictEqual(spans.length, 1);
        const attributes = spans[0].attributes;

        assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'SELECT');
        assert.strictEqual(attributes[SEMATTRS_DB_STATEMENT], 'SELECT 1 + 1');
      });

      it('with type specified in options', async () => {
        try {
          await instance.query('SELECT 1 + 1', {
            type: sequelize.QueryTypes.RAW,
          });
        } catch {
          // Do not care about the error
        }
        const spans = getSequelizeSpans();
        assert.strictEqual(spans.length, 1);
        const attributes = spans[0].attributes;

        assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'RAW');
        assert.strictEqual(attributes[SEMATTRS_DB_STATEMENT], 'SELECT 1 + 1');
      });
    });
  });

  describe('sqlite', () => {
    const instance = new sequelize.Sequelize('sqlite:memory', {
      logging: false,
    });
    instance.define('User', {
      firstName: { type: sequelize.DataTypes.STRING },
    });

    it('create is instrumented', async () => {
      await instance.models.User.create({ firstName: 'OpenTelemetry' }).catch(
        () => {}
      );
      const spans = getSequelizeSpans();
      assert.strictEqual(spans.length, 1);
      const attributes = spans[0].attributes;
      assert.strictEqual(attributes[SEMATTRS_DB_SYSTEM], 'sqlite');
      assert.strictEqual(attributes[SEMATTRS_NET_PEER_NAME], 'memory');
      assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'INSERT');
      assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'Users');
      assert.strictEqual(
        attributes[SEMATTRS_DB_STATEMENT],
        'INSERT INTO `Users` (`id`,`firstName`,`createdAt`,`updatedAt`) VALUES (NULL,$1,$2,$3);'
      );
    });
  });

  describe('config', () => {
    describe('queryHook', () => {
      it('able to collect query', async () => {
        instrumentation.disable();
        const instance = new sequelize.Sequelize(
          'postgres://john@$localhost:1111/my-name',
          { logging: false }
        );
        instance.define('User', {
          firstName: { type: sequelize.DataTypes.STRING },
        });

        const response = { john: 'doe' };
        sequelize.Sequelize.prototype.query = (() => {
          return new Promise(resolve => resolve(response));
        }) as QueryFunction;
        instrumentation.setConfig({
          queryHook: (span, { sql, option }: { sql: any; option: any }) => {
            span.setAttribute('test-sql', 'any');
            span.setAttribute('test-option', 'any');
          },
        });
        instrumentation.enable();

        await instance.models.User.findAll();
        const spans = getSequelizeSpans();
        const attributes = spans[0].attributes;

        assert.strictEqual(attributes['test-sql'], 'any');
        assert.strictEqual(attributes['test-option'], 'any');
      });

      it('query hook which throws does not affect span', async () => {
        instrumentation.disable();
        const instance = new sequelize.Sequelize(
          'postgres://john@$localhost:1111/my-name',
          { logging: false }
        );
        instance.define('User', {
          firstName: { type: sequelize.DataTypes.STRING },
        });

        const response = { john: 'doe' };
        sequelize.Sequelize.prototype.query = (() => {
          return new Promise(resolve => resolve(response));
        }) as QueryFunction;
        const mockedLogger = (() => {
          let message: string;
          let error: Error;
          return {
            error: (_message: string, _err: Error) => {
              message = _message;
              error = _err;
            },
            debug: () => {},
            getMessage: () => message,
            getError: () => error,
          };
        })();

        instrumentation.setConfig({
          queryHook: () => {
            throw new Error('Throwing');
          },
        });
        instrumentation.enable();
        diag.setLogger(mockedLogger as any);
        await instance.models.User.findAll();
        const spans = getSequelizeSpans();
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(
          mockedLogger.getMessage(),
          'sequelize instrumentation: queryHook error'
        );
        assert.strictEqual(mockedLogger.getError().message, 'Throwing');
        diag.setLogger(new DiagConsoleLogger());
      });
    });

    describe('responseHook', () => {
      it('able to collect response', async () => {
        instrumentation.disable();
        const instance = new sequelize.Sequelize(
          'postgres://john@$localhost:1111/my-name',
          { logging: false }
        );
        instance.define('User', {
          firstName: { type: sequelize.DataTypes.STRING },
        });

        const response = { john: 'doe' };
        sequelize.Sequelize.prototype.query = (() => {
          return new Promise(resolve => resolve(response));
        }) as QueryFunction;
        instrumentation.setConfig({
          responseHook: (span, response) => {
            span.setAttribute('test', JSON.stringify(response));
          },
        });
        instrumentation.enable();

        await instance.models.User.findAll();
        const spans = getSequelizeSpans();
        const attributes = spans[0].attributes;

        assert.strictEqual(attributes['test'], JSON.stringify(response));
      });

      it('response hook which throws does not affect span', async () => {
        instrumentation.disable();
        const instance = new sequelize.Sequelize(
          'postgres://john@$localhost:1111/my-name',
          { logging: false }
        );
        instance.define('User', {
          firstName: { type: sequelize.DataTypes.STRING },
        });

        const response = { john: 'doe' };
        sequelize.Sequelize.prototype.query = (() => {
          return new Promise(resolve => resolve(response));
        }) as QueryFunction;
        const mockedLogger = (() => {
          let message: string;
          let error: Error;
          return {
            error: (_message: string, _err: Error) => {
              message = _message;
              error = _err;
            },
            debug: () => {},
            getMessage: () => message,
            getError: () => error,
          };
        })();

        instrumentation.setConfig({
          responseHook: () => {
            throw new Error('Throwing');
          },
        });
        instrumentation.enable();
        diag.setLogger(mockedLogger as any);
        await instance.models.User.findAll();
        const spans = getSequelizeSpans();
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(
          mockedLogger.getMessage(),
          'sequelize instrumentation: responseHook error'
        );
        assert.strictEqual(mockedLogger.getError().message, 'Throwing');
        diag.setLogger(new DiagConsoleLogger());
      });
    });

    describe('ignoreOrphanedSpans', () => {
      it('skips when ignoreOrphanedSpans option is true', async () => {
        instrumentation.disable();
        const instance = new sequelize.Sequelize(
          'postgres://john@$localhost:1111/my-name',
          { logging: false }
        );
        instance.define('User', {
          firstName: { type: sequelize.DataTypes.STRING },
        });
        instrumentation.setConfig({
          ignoreOrphanedSpans: true,
        });
        instrumentation.enable();

        try {
          await context.with(ROOT_CONTEXT, async () => {
            await instance.models.User.create({ firstName: 'OpenTelemetry' });
          });
        } catch {}

        const spans = getSequelizeSpans();
        assert.strictEqual(spans.length, 0);
      });
    });
  });

  describe('misc', () => {
    it('extractTableFromQuery', async () => {
      assert.strictEqual(
        extractTableFromQuery('FROM Users JOIN Dogs Where 1243'),
        'Dogs,Users'
      );
      assert.strictEqual(extractTableFromQuery('FROM "Users"'), 'Users');
      assert.strictEqual(
        extractTableFromQuery(
          'SELECT count(*) AS "count" FROM "Users" AS "User";'
        ),
        'Users'
      );
      assert.strictEqual(
        extractTableFromQuery(
          'SELECT `id`, `firstName`, `createdAt`, `updatedAt` FROM `Users` AS `User`;'
        ),
        'Users'
      );
      assert.strictEqual(extractTableFromQuery(null), undefined);
      assert.strictEqual(extractTableFromQuery(undefined), undefined);
    });
  });
});
