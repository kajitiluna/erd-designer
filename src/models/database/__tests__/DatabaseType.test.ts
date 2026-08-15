import { Database } from '../DatabaseType';
import TableIndexSupport from '../TableIndexSupport';
import TableUniqueKeySupport from '../TableUniqueKeySupport';

describe('Database', () => {
    describe('constructor', () => {
        test('should create with all required properties', () => {
            const uniqueKeySupport = new TableUniqueKeySupport({ orderable: false });
            const indexSupport = new TableIndexSupport({ indexOptions: ['UNIQUE'], indexTypes: ['BTREE'] });
            const database = new Database(
                'postgres', 'PostgreSQL',
                uniqueKeySupport, indexSupport,
                { supportsSchema: true, defaultSchemaName: 'public', supportsTableCollate: false, collatePattern: /^.*$/ },
                { supportArray: true, supportStruct: false, editableCharacterSet: false, autoIncrementLabel: '' }
            );

            expect(database.databaseType).toBe('postgres');
            expect(database.name).toBe('PostgreSQL');
            expect(database.supportsSchema).toBe(true);
            expect(database.defaultSchemaName).toBe('public');
            expect(database.uniqueKeySupport).toBe(uniqueKeySupport);
            expect(database.tableIndexSupport).toBe(indexSupport);
        });
    });
});

describe('databases constant', () => {
    test('should contain postgres database configuration', () => {
        const postgres = Database.get("postgres");

        expect(postgres.databaseType).toBe('postgres');
        expect(postgres.name).toBe('PostgreSQL');
        expect(postgres.uniqueKeySupport).toBeDefined();
        expect(postgres.tableIndexSupport).toBeDefined();
    });

    test('should contain mysql database configuration', () => {
        const mysql = Database.get("mysql");

        expect(mysql.databaseType).toBe('mysql');
        expect(mysql.name).toBe('MySQL');
        expect(mysql.uniqueKeySupport).toBeDefined();
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

    test('should contain ms_sqlserver database configuration', () => {
        const sqlServer = Database.get("ms_sqlserver");

        expect(sqlServer.databaseType).toBe('ms_sqlserver');
        expect(sqlServer.name).toBe('MS SQL Server');
        expect(sqlServer.uniqueKeySupport).toBeDefined();
        expect(sqlServer.tableIndexSupport).toBeDefined();
    });

    test('ms_sqlserver should support expected index options and types', () => {
        const sqlServer = Database.get("ms_sqlserver");

        expect(sqlServer.tableIndexSupport.indexOptions).toContain('UNIQUE');
        expect(sqlServer.tableIndexSupport.indexTypes).toHaveLength(0); // No specific index types
        expect(sqlServer.tableIndexSupport.supportsClustered).toBe(true);
        expect(sqlServer.tableIndexSupport.nullsOrder).toBe(false);
    });

    test('should contain mariadb database configuration', () => {
        const mariadb = Database.get("mariadb");

        expect(mariadb.databaseType).toBe('mariadb');
        expect(mariadb.name).toBe('MariaDB');
        expect(mariadb.uniqueKeySupport).toBeDefined();
        expect(mariadb.tableIndexSupport).toBeDefined();
    });

    test('mariadb should support expected index options and types', () => {
        const mariadb = Database.get("mariadb");

        expect(mariadb.tableIndexSupport.indexOptions).toContain('UNIQUE');
        expect(mariadb.tableIndexSupport.indexOptions).toContain('FULLTEXT');
        expect(mariadb.tableIndexSupport.indexOptions).toContain('SPATIAL');
        expect(mariadb.tableIndexSupport.indexTypes).toContain('BTREE');
        expect(mariadb.tableIndexSupport.indexTypes).toContain('HASH');
        expect(mariadb.tableIndexSupport.nullsOrder).toBe(false);
    });

    test('should contain sqlite database configuration', () => {
        const sqlite = Database.get("sqlite");

        expect(sqlite.databaseType).toBe('sqlite');
        expect(sqlite.name).toBe('SQLite');
        expect(sqlite.uniqueKeySupport).toBeDefined();
        expect(sqlite.tableIndexSupport).toBeDefined();
    });

    test('sqlite should support expected index options and types', () => {
        const sqlite = Database.get("sqlite");

        expect(sqlite.tableIndexSupport.indexOptions).toContain('UNIQUE');
        expect(sqlite.tableIndexSupport.indexTypes).toHaveLength(0); // USING句なし
        expect(sqlite.tableIndexSupport.nullsOrder).toBe(false);
    });

    test('should contain snowflake database configuration', () => {
        const snowflake = Database.get("snowflake");

        expect(snowflake.databaseType).toBe('snowflake');
        expect(snowflake.name).toBe('Snowflake');
        expect(snowflake.uniqueKeySupport).toBeDefined();
        expect(snowflake.tableIndexSupport).toBeDefined();
    });

    test('snowflake should have no index options and types', () => {
        const snowflake = Database.get("snowflake");

        expect(snowflake.tableIndexSupport.indexOptions).toHaveLength(0);
        expect(snowflake.tableIndexSupport.indexTypes).toHaveLength(0);
        expect(snowflake.tableIndexSupport.nullsOrder).toBe(false);
    });

    test('postgres should support index', () => {
        const postgres = Database.get("postgres");
        expect(postgres.tableIndexSupport.supportsIndex).toBe(true);
    });

    test('mysql should support index', () => {
        const mysql = Database.get("mysql");
        expect(mysql.tableIndexSupport.supportsIndex).toBe(true);
    });

    test('ms_sqlserver should support index', () => {
        const sqlServer = Database.get("ms_sqlserver");
        expect(sqlServer.tableIndexSupport.supportsIndex).toBe(true);
    });

    test('mariadb should support index', () => {
        const mariadb = Database.get("mariadb");
        expect(mariadb.tableIndexSupport.supportsIndex).toBe(true);
    });

    test('sqlite should support index', () => {
        const sqlite = Database.get("sqlite");
        expect(sqlite.tableIndexSupport.supportsIndex).toBe(true);
    });

    test('snowflake should not support index (CREATE INDEX unsupported on standard tables)', () => {
        const snowflake = Database.get("snowflake");
        expect(snowflake.tableIndexSupport.supportsIndex).toBe(false);
    });

    test('postgres should support schema', () => {
        const postgres = Database.get("postgres");
        expect(postgres.supportsSchema).toBe(true);
    });

    test('postgres should have "public" as its default schema name', () => {
        const postgres = Database.get("postgres");
        expect(postgres.defaultSchemaName).toBe('public');
    });

    test('mysql should not support schema', () => {
        const mysql = Database.get("mysql");
        expect(mysql.supportsSchema).toBe(false);
    });

    test('mysql should have no default schema name', () => {
        const mysql = Database.get("mysql");
        expect(mysql.defaultSchemaName).toBe('');
    });

    test('ms_sqlserver should support schema', () => {
        const sqlServer = Database.get("ms_sqlserver");
        expect(sqlServer.supportsSchema).toBe(true);
    });

    test('ms_sqlserver should have "dbo" as its default schema name', () => {
        const sqlServer = Database.get("ms_sqlserver");
        expect(sqlServer.defaultSchemaName).toBe('dbo');
    });

    test('mariadb should not support schema', () => {
        const mariadb = Database.get("mariadb");
        expect(mariadb.supportsSchema).toBe(false);
    });

    test('mariadb should have no default schema name', () => {
        const mariadb = Database.get("mariadb");
        expect(mariadb.defaultSchemaName).toBe('');
    });

    test('sqlite should not support schema', () => {
        const sqlite = Database.get("sqlite");
        expect(sqlite.supportsSchema).toBe(false);
    });

    test('sqlite should have no default schema name', () => {
        const sqlite = Database.get("sqlite");
        expect(sqlite.defaultSchemaName).toBe('');
    });

    test('snowflake should support schema', () => {
        const snowflake = Database.get("snowflake");
        expect(snowflake.supportsSchema).toBe(true);
    });

    test('snowflake should have "PUBLIC" as its default schema name', () => {
        const snowflake = Database.get("snowflake");
        expect(snowflake.defaultSchemaName).toBe('PUBLIC');
    });

    test('postgres should have non-orderable unique key support', () => {
        const postgres = Database.get("postgres");
        expect(postgres.uniqueKeySupport.orderable).toBe(false);
    });

    test('mysql should have orderable unique key support', () => {
        const mysql = Database.get("mysql");
        expect(mysql.uniqueKeySupport.orderable).toBe(true);
    });

    test('ms_sqlserver should have orderable unique key support', () => {
        const sqlServer = Database.get("ms_sqlserver");
        expect(sqlServer.uniqueKeySupport.orderable).toBe(true);
    });

    test('mariadb should have orderable unique key support', () => {
        const mariadb = Database.get("mariadb");
        expect(mariadb.uniqueKeySupport.orderable).toBe(true);
    });

    test('sqlite should have orderable unique key support', () => {
        const sqlite = Database.get("sqlite");
        expect(sqlite.uniqueKeySupport.orderable).toBe(true);
    });

    test('snowflake should have non-orderable unique key support', () => {
        const snowflake = Database.get("snowflake");
        expect(snowflake.uniqueKeySupport.orderable).toBe(false);
    });

    test('postgres should support unique key', () => {
        const postgres = Database.get("postgres");
        expect(postgres.uniqueKeySupport.supportsUniqueKey).toBe(true);
    });

    test('mysql should support unique key', () => {
        const mysql = Database.get("mysql");
        expect(mysql.uniqueKeySupport.supportsUniqueKey).toBe(true);
    });

    test('ms_sqlserver should support unique key', () => {
        const sqlServer = Database.get("ms_sqlserver");
        expect(sqlServer.uniqueKeySupport.supportsUniqueKey).toBe(true);
    });

    test('mariadb should support unique key', () => {
        const mariadb = Database.get("mariadb");
        expect(mariadb.uniqueKeySupport.supportsUniqueKey).toBe(true);
    });

    test('sqlite should support unique key', () => {
        const sqlite = Database.get("sqlite");
        expect(sqlite.uniqueKeySupport.supportsUniqueKey).toBe(true);
    });

    test('snowflake should support unique key', () => {
        const snowflake = Database.get("snowflake");
        expect(snowflake.uniqueKeySupport.supportsUniqueKey).toBe(true);
    });

    test('postgres should support array types', () => {
        const postgres = Database.get("postgres");
        expect(postgres.supportsArrayType).toBe(true);
    });

    test('mysql should not support array types', () => {
        const mysql = Database.get("mysql");
        expect(mysql.supportsArrayType).toBe(false);
    });

    test('ms_sqlserver should not support array types', () => {
        const sqlServer = Database.get("ms_sqlserver");
        expect(sqlServer.supportsArrayType).toBe(false);
    });

    test('mariadb should not support array types', () => {
        const mariadb = Database.get("mariadb");
        expect(mariadb.supportsArrayType).toBe(false);
    });

    test('sqlite should not support array types', () => {
        const sqlite = Database.get("sqlite");
        expect(sqlite.supportsArrayType).toBe(false);
    });

    test('snowflake should not support array types', () => {
        const snowflake = Database.get("snowflake");
        expect(snowflake.supportsArrayType).toBe(false);
    });

    test('postgres should have no auto increment label', () => {
        const postgres = Database.get("postgres");
        expect(postgres.autoIncrementLabel()).toBe('Generated Always As Identity');
    });

    test('mysql should have "Auto Increment" label', () => {
        const mysql = Database.get("mysql");
        expect(mysql.autoIncrementLabel()).toBe('Auto Increment');
    });

    test('ms_sqlserver should have "Identity" label', () => {
        const sqlServer = Database.get("ms_sqlserver");
        expect(sqlServer.autoIncrementLabel()).toBe('Identity');
    });

    test('mariadb should have "Auto Increment" label', () => {
        const mariadb = Database.get("mariadb");
        expect(mariadb.autoIncrementLabel()).toBe('Auto Increment');
    });

    test('sqlite should have empty auto increment label (AUTOINCREMENT unsupported by design)', () => {
        const sqlite = Database.get("sqlite");
        expect(sqlite.autoIncrementLabel()).toBe('');
    });

    test('snowflake should have "Autoincrement" label', () => {
        const snowflake = Database.get("snowflake");
        expect(snowflake.autoIncrementLabel()).toBe('Autoincrement');
    });

    test('should contain bigquery database configuration', () => {
        const bigquery = Database.get("bigquery");

        expect(bigquery.databaseType).toBe('bigquery');
        expect(bigquery.name).toBe('BigQuery');
        expect(bigquery.uniqueKeySupport).toBeDefined();
        expect(bigquery.tableIndexSupport).toBeDefined();
    });

    test('bigquery should have no index options and types', () => {
        const bigquery = Database.get("bigquery");

        expect(bigquery.tableIndexSupport.indexOptions).toHaveLength(0);
        expect(bigquery.tableIndexSupport.indexTypes).toHaveLength(0);
        expect(bigquery.tableIndexSupport.nullsOrder).toBe(false);
    });

    test('bigquery should not support index (CREATE INDEX unsupported)', () => {
        const bigquery = Database.get("bigquery");
        expect(bigquery.tableIndexSupport.supportsIndex).toBe(false);
    });

    test('bigquery should support schema (dataset is treated as schema)', () => {
        const bigquery = Database.get("bigquery");
        expect(bigquery.supportsSchema).toBe(true);
    });

    test('bigquery should have no default schema name (dataset must be explicit)', () => {
        const bigquery = Database.get("bigquery");
        expect(bigquery.defaultSchemaName).toBe('');
    });

    test('bigquery should have non-orderable unique key support', () => {
        const bigquery = Database.get("bigquery");
        expect(bigquery.uniqueKeySupport.orderable).toBe(false);
    });

    test('bigquery should not support unique key', () => {
        const bigquery = Database.get("bigquery");
        expect(bigquery.uniqueKeySupport.supportsUniqueKey).toBe(false);
    });

    test('bigquery should support array types', () => {
        const bigquery = Database.get("bigquery");
        expect(bigquery.supportsArrayType).toBe(true);
    });

    test('bigquery should have no auto increment label (no auto-increment equivalent)', () => {
        const bigquery = Database.get("bigquery");
        expect(bigquery.autoIncrementLabel()).toBe('');
    });

    test('postgres should not support struct types', () => {
        const postgres = Database.get("postgres");
        expect(postgres.supportsStructType).toBe(false);
    });

    test('mysql should not support struct types', () => {
        const mysql = Database.get("mysql");
        expect(mysql.supportsStructType).toBe(false);
    });

    test('ms_sqlserver should not support struct types', () => {
        const sqlServer = Database.get("ms_sqlserver");
        expect(sqlServer.supportsStructType).toBe(false);
    });

    test('mariadb should not support struct types', () => {
        const mariadb = Database.get("mariadb");
        expect(mariadb.supportsStructType).toBe(false);
    });

    test('sqlite should not support struct types', () => {
        const sqlite = Database.get("sqlite");
        expect(sqlite.supportsStructType).toBe(false);
    });

    test('snowflake should not support struct types', () => {
        const snowflake = Database.get("snowflake");
        expect(snowflake.supportsStructType).toBe(false);
    });

    test('bigquery should support struct types', () => {
        const bigquery = Database.get("bigquery");
        expect(bigquery.supportsStructType).toBe(true);
    });

    test('allDatabaseTypes should return all database types', () => {
        const allTypes = Database.allDatabaseTypes();

        expect(allTypes).toHaveLength(7);
        expect(allTypes).toContain('postgres');
        expect(allTypes).toContain('mysql');
        expect(allTypes).toContain('ms_sqlserver');
        expect(allTypes).toContain('mariadb');
        expect(allTypes).toContain('sqlite');
        expect(allTypes).toContain('snowflake');
        expect(allTypes).toContain('bigquery');
    });
});