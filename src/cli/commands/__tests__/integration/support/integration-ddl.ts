import { Client } from "pg";
import { createConnection, Connection as MySqlConnectionInstance } from "mysql2/promise";

/**
 * 実DB統合テストが DDL の投入・後片付けに使う薄い接続ヘルパー。
 * CLI 本体(db-driver.ts)とは無関係のテスト専用コードであり、
 * pg/mysql2 を直接使う(db-driver.ts のような遅延 require は行わない — devDependencies として常に存在するため)。
 */
export type IntegrationDdl = {
    uniqueName: (prefix: string) => string;
    postgres: {
        connect: (dsn: string) => Promise<Client>;
        createSchema: (client: Client, schemaName: string) => Promise<void>;
        dropSchema: (client: Client, schemaName: string) => Promise<void>;
        execute: (client: Client, statements: readonly string[]) => Promise<void>;
    };
    mysql: {
        toDatabaseDsn: (dsn: string, databaseName: string) => string;
        createDatabase: (dsn: string, databaseName: string) => Promise<void>;
        dropDatabase: (dsn: string, databaseName: string) => Promise<void>;
        connect: (dsn: string) => Promise<MySqlConnectionInstance>;
        execute: (connection: MySqlConnectionInstance, statements: readonly string[]) => Promise<void>;
    };
};

const RANDOM_SUFFIX_LENGTH = 4;

/** テストごとに一意なスキーマ名/データベース名を作る。数字始まりを避けるため常に文字の接頭辞を要求する。 */
const toUniqueName = (prefix: string): string => {
    const randomSuffix = Math.random().toString(36).slice(2, 2 + RANDOM_SUFFIX_LENGTH);
    return `${prefix}_${Date.now()}_${randomSuffix}`;
};

const connectPostgres = async (dsn: string): Promise<Client> => {
    const client = new Client({ connectionString: dsn });
    await client.connect();
    return client;
};

const createPostgresSchema = async (client: Client, schemaName: string): Promise<void> => {
    await client.query(`CREATE SCHEMA ${schemaName}`);
};

const dropPostgresSchema = async (client: Client, schemaName: string): Promise<void> => {
    await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
};

const executePostgresStatements = async (client: Client, statements: readonly string[]): Promise<void> => {
    await runSequentially(statements, async statement => { await client.query(statement); });
};

const toMySqlDatabaseDsn = (dsn: string, databaseName: string): string => {
    const url = new URL(dsn);
    url.pathname = `/${databaseName}`;
    return url.toString();
};

// docker-compose.yml の MYSQL_ROOT_PASSWORD/MARIADB_ROOT_PASSWORD と一致させる。
// db_user は MYSQL_DATABASE(sample_db)にしか権限を持たないため、テストごとに作る使い捨てDBの
// 作成・権限付与・削除は root で行う。
const MYSQL_ROOT_USERNAME = "root";
const MYSQL_ROOT_PASSWORD = "root_password";

const toMySqlRootDsn = (dsn: string): string => {
    const url = new URL(dsn);
    url.username = MYSQL_ROOT_USERNAME;
    url.password = MYSQL_ROOT_PASSWORD;
    url.pathname = "/";
    return url.toString();
};

const createMySqlDatabase = async (dsn: string, databaseName: string): Promise<void> => {
    const grantToUser = new URL(dsn).username;
    const connection = await connectMySql(toMySqlRootDsn(dsn));
    try {
        await connection.query(`CREATE DATABASE ${databaseName}`);
        await connection.query(`GRANT ALL PRIVILEGES ON \`${databaseName}\`.* TO '${grantToUser}'@'%'`);
        await connection.query("FLUSH PRIVILEGES");
    } finally {
        await connection.end();
    }
};

const dropMySqlDatabase = async (dsn: string, databaseName: string): Promise<void> => {
    const connection = await connectMySql(toMySqlRootDsn(dsn));
    try {
        await connection.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    } finally {
        await connection.end();
    }
};

const connectMySql = async (dsn: string): Promise<MySqlConnectionInstance> => {
    return createConnection({ uri: dsn });
};

const executeMySqlStatements = async (
    connection: MySqlConnectionInstance, statements: readonly string[]
): Promise<void> => {
    await runSequentially(statements, async statement => { await connection.query(statement); });
};

// DDL は前の文の結果(テーブル/スキーマの存在)に依存するため、Promise.all で並列化せず順番に実行する
// (coding-style ルール5の例外: 逐次的な副作用の蓄積)。
const runSequentially = async (
    statements: readonly string[], run: (statement: string) => Promise<void>
): Promise<void> => {
    for (const statement of statements) {
        await run(statement);
    }
};

export const integrationDdl: IntegrationDdl = {
    uniqueName: toUniqueName,
    postgres: {
        connect: connectPostgres,
        createSchema: createPostgresSchema,
        dropSchema: dropPostgresSchema,
        execute: executePostgresStatements
    },
    mysql: {
        toDatabaseDsn: toMySqlDatabaseDsn,
        createDatabase: createMySqlDatabase,
        dropDatabase: dropMySqlDatabase,
        connect: connectMySql,
        execute: executeMySqlStatements
    }
} as const;
