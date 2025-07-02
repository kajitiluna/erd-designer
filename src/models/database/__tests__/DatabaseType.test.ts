import { Database, databases } from '../DatabaseType';
import TableIndexSupport from '../TableIndexSupport';

describe('Database', () => {
    describe('constructor', () => {
        test('should create with all required properties', () => {
            const indexSupport = new TableIndexSupport(['UNIQUE'], ['BTREE']);
            const reservedWords = new Set(['SELECT', 'FROM']);
            const database = new Database('postgres', 'PostgreSQL', indexSupport, reservedWords, '"');

            expect(database.databaseType).toBe('postgres');
            expect(database.name).toBe('PostgreSQL');
            expect(database.tableIndexSupport).toBe(indexSupport);
        });
    });

    describe('escape', () => {
        const indexSupport = new TableIndexSupport(['UNIQUE'], ['BTREE']);
        const reservedWords = new Set(['SELECT', 'FROM', 'WHERE']);
        const database = new Database('postgres', 'PostgreSQL', indexSupport, reservedWords, '"');

        test('should not escape non-reserved words', () => {
            expect(database.escape('users')).toBe('users');
            expect(database.escape('custom_table')).toBe('custom_table');
            expect(database.escape('MyColumn')).toBe('MyColumn');
        });

        test('should escape reserved words (case insensitive)', () => {
            expect(database.escape('SELECT')).toBe('"SELECT"');
            expect(database.escape('select')).toBe('"select"');
            expect(database.escape('Select')).toBe('"Select"');
            expect(database.escape('FROM')).toBe('"FROM"');
            expect(database.escape('WHERE')).toBe('"WHERE"');
        });

        test('should use correct escape character', () => {
            const mysqlDb = new Database('mysql', 'MySQL', indexSupport, reservedWords, '`');
            expect(mysqlDb.escape('SELECT')).toBe('`SELECT`');
        });
    });
});

describe('databases constant', () => {
    test('should contain postgres database configuration', () => {
        const postgres = databases.postgres;

        expect(postgres.databaseType).toBe('postgres');
        expect(postgres.name).toBe('PostgreSQL');
        expect(postgres.tableIndexSupport).toBeDefined();
        expect(postgres.escape('SELECT')).toBe('"SELECT"');
        expect(postgres.escape('users')).toBe('users');
    });

    test('should contain mysql database configuration', () => {
        const mysql = databases.mysql;

        expect(mysql.databaseType).toBe('mysql');
        expect(mysql.name).toBe('MySQL');
        expect(mysql.tableIndexSupport).toBeDefined();
        expect(mysql.escape('SELECT')).toBe('`SELECT`');
        expect(mysql.escape('users')).toBe('users');
    });

    test('postgres should support expected index options and types', () => {
        const postgres = databases.postgres;

        expect(postgres.tableIndexSupport.indexOptions).toContain('UNIQUE');
        expect(postgres.tableIndexSupport.indexTypes).toContain('BTREE');
        expect(postgres.tableIndexSupport.indexTypes).toContain('HASH');
        expect(postgres.tableIndexSupport.indexTypes).toContain('GIST');
        expect(postgres.tableIndexSupport.nullsOrder).toBe(true);
    });

    test('mysql should support expected index options and types', () => {
        const mysql = databases.mysql;

        expect(mysql.tableIndexSupport.indexOptions).toContain('UNIQUE');
        expect(mysql.tableIndexSupport.indexOptions).toContain('FULLTEXT');
        expect(mysql.tableIndexSupport.indexOptions).toContain('SPATIAL');
        expect(mysql.tableIndexSupport.indexTypes).toContain('BTREE');
        expect(mysql.tableIndexSupport.indexTypes).toContain('HASH');
        expect(mysql.tableIndexSupport.nullsOrder).toBe(false);
    });

    test('should escape common SQL reserved words in postgres', () => {
        const postgres = databases.postgres;

        expect(postgres.escape('ALL')).toBe('"ALL"');
        expect(postgres.escape('AND')).toBe('"AND"');
        expect(postgres.escape('CREATE')).toBe('"CREATE"');
        expect(postgres.escape('TABLE')).toBe('"TABLE"');
        expect(postgres.escape('SELECT')).toBe('"SELECT"');
    });

    test('should escape common SQL reserved words in mysql', () => {
        const mysql = databases.mysql;

        expect(mysql.escape('ALL')).toBe('`ALL`');
        expect(mysql.escape('AND')).toBe('`AND`');
        expect(mysql.escape('CREATE')).toBe('`CREATE`');
        expect(mysql.escape('TABLE')).toBe('`TABLE`');
        expect(mysql.escape('SELECT')).toBe('`SELECT`');
    });

    test('should escape postgres-specific reserved words', () => {
        const postgres = databases.postgres;

        expect(postgres.escape('ANALYSE')).toBe('"ANALYSE"');
        expect(postgres.escape('ILIKE')).toBe('"ILIKE"');
        expect(postgres.escape('RETURNING')).toBe('"RETURNING"');
    });

    test('should escape mysql-specific reserved words', () => {
        const mysql = databases.mysql;

        expect(mysql.escape('AUTO_INCREMENT')).toBe('`AUTO_INCREMENT`');
        expect(mysql.escape('ZEROFILL')).toBe('`ZEROFILL`');
        expect(mysql.escape('TINYINT')).toBe('`TINYINT`');
    });
});