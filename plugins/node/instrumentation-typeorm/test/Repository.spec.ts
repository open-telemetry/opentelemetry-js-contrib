import 'mocha';
import expect from 'expect';
import { TypeormInstrumentation } from '../src';
import { getTestSpans, registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(new TypeormInstrumentation());
import { defaultOptions, User } from './utils';
import * as typeorm from 'typeorm';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

describe('Repository', () => {
    beforeEach(() => {
        instrumentation.enable();
    });

    afterEach(() => {
        instrumentation.disable();
    });

    it('findAndCount', async () => {
        const connection = await typeorm.createConnection(defaultOptions);
        const repo = connection.getRepository(User);
        const user = new User(1, 'aspecto', 'io');
        await repo.insert(user);
        const [users, count] = await repo.findAndCount();
        expect(count).toBeGreaterThan(0);
        const spans = getTestSpans();
        expect(spans.length).toEqual(2);
        const span = spans[0];
        const attributes = span.attributes;
        expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('user');
        await connection.close();
    });
});
