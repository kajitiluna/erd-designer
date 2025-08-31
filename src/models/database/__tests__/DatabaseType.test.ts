import { Database } from '../DatabaseType';
import TableIndexSupport from '../TableIndexSupport';

describe('Database', () => {
    describe('constructor', () => {
        test('should create with all required properties', () => {
            const indexSupport = new TableIndexSupport({ indexOptions: ['UNIQUE'], indexTypes: ['BTREE'] });
            const database = new Database('postgres', 'PostgreSQL', true, indexSupport, { supportArray: true });

            expect(database.databaseType).toBe('postgres');
            expect(database.name).toBe('PostgreSQL');
            expect(database.supportsSchema).toBe(true);
            expect(database.tableIndexSupport).toBe(indexSupport);
        });
    });
});

describe('databases constant', () => {
    test('should contain postgres database configuration', () => {
        const postgres = Database.get("postgres");

        expect(postgres.databaseType).toBe('postgres');
        expect(postgres.name).toBe('PostgreSQL');
        expect(postgres.tableIndexSupport).toBeDefined();
    });

    test('should contain mysql database configuration', () => {
        const mysql = Database.get("mysql");

        expect(mysql.databaseType).toBe('mysql');
        expect(mysql.name).toBe('MySQL');
        expect(mysql.tableIndexSupport).toBeDefined();
    });

    test('postgres should support expected index options and types', () => {
        const postgres = Database.get("postgres");

        expect(postgres.tableIndexSupport.indexOptions).toContain('UNIQUE');
        expect(postgres.tableIndexSupport.indexTypes).toContain('BTREE');
        expect(postgres.tableIndexSupport.indexTypes).toContain('HASH');
        expect(postgres.tableIndexSupport.indexTypes).toContain('GIST');
        expect(postgres.tableIndexSupport.nullsOrder).toBe(true);
    });

    test('mysql should support expected index options and types', () => {
        const mysql = Database.get("mysql");

        expect(mysql.tableIndexSupport.indexOptions).toContain('UNIQUE');
        expect(mysql.tableIndexSupport.indexOptions).toContain('FULLTEXT');
        expect(mysql.tableIndexSupport.indexOptions).toContain('SPATIAL');
        expect(mysql.tableIndexSupport.indexTypes).toContain('BTREE');
        expect(mysql.tableIndexSupport.indexTypes).toContain('HASH');
        expect(mysql.tableIndexSupport.nullsOrder).toBe(false);
    });

    test('postgres should support schema', () => {
        const postgres = Database.get("postgres");
        expect(postgres.supportsSchema).toBe(true);
    });

    test('mysql should not support schema', () => {
        const mysql = Database.get("mysql");
        expect(mysql.supportsSchema).toBe(false);
    });

    test('ms_sqlserver should support schema', () => {
        const sqlServer = Database.get("ms_sqlserver");
        expect(sqlServer.supportsSchema).toBe(true);
    });
});