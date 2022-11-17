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

// type is typeorm.ConnectionOptions for <0.3.0
// and typeorm.DataSourceOptions for >=0.3.0
export const defaultOptions: any = {
    type: 'sqlite',
    database: ':memory:',
    dropSchema: true,
    synchronize: true,
    entities: [User],
};

export const rawQueryOptions: any = {
    type: 'sqlite',
    database: ':memory:',
    dropSchema: true,
    synchronize: true,
    entities: [User],
    name: 'rawQuery',
};
