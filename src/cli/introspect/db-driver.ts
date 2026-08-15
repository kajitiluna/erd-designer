import { createRequire } from "node:module";
import * as path from "node:path";
import process from "node:process";

import { ConnectionTimeouts } from "~/cli/commands/support/connection-timeout-options";
import { MySqlIntrospector } from "~/cli/introspect/mysql";
import { PostgresIntrospector } from "~/cli/introspect/postgres";
import { SqlConnection, SqlQueryRow } from "~/cli/introspect/sql-connection";
import { DatabaseType } from "~/models/database/DatabaseType";
import { SchemaCompareScope, SchemaSnapshot } from "~/models/schema/schema-snapshot";

export type SnapshotTarget = {

    /** --schema の値。postgres のみが解釈する(未指定は "")。 */
    schemaOption: string;

    /** 設計側のテーブルが実際に属するスキーマ名(重複なし)。--schema 未指定時の postgres の走査範囲。 */
    designSchemaNames: readonly string[];
};

export type DatabaseSnapshotFetcher = (
    databaseType: DatabaseType, connectionUrl: string, target: SnapshotTarget, scope: SchemaCompareScope,
    timeouts: ConnectionTimeouts
) => Promise<FetchDatabaseSnapshotResult>;

type FetchDatabaseSnapshotResult =
    { resultType: "fetched", snapshot: SchemaSnapshot }
    | { resultType: "failed", message: string };

// 第1段階の対応方言。pg / mysql2 という枯れたドライバがある2系統から実用性を確認する
const SUPPORTED_DATABASE_TYPES: readonly DatabaseType[] = ["postgres", "mysql", "mariadb"] as const;

export default class DbDriver {

    public static supports(databaseType: DatabaseType): boolean {
        return SUPPORTED_DATABASE_TYPES.includes(databaseType);
    }

    /** 方言別のイントロスペクタへディスパッチする。未対応方言は呼び出し側(db-diff コマンド)が先に弾く。 */
    public static async fetchSnapshot(
        databaseType: DatabaseType, connectionUrl: string, target: SnapshotTarget, scope: SchemaCompareScope,
        timeouts: ConnectionTimeouts
    ): Promise<FetchDatabaseSnapshotResult> {
        if (databaseType === "postgres") {
            return PostgresDriver.fetchSnapshot(connectionUrl, target, scope, timeouts);
        }

        if ((databaseType === "mysql") || (databaseType === "mariadb")) {
            return MySqlDriver.fetchSnapshot(connectionUrl, databaseType, scope, timeouts);
        }

        return { resultType: "failed", message: `Unsupported database type for db-diff: ${databaseType}` };
    }

    /**
     * 接続失敗時のエラーメッセージに DSN をそのまま載せない。
     * パスワードだけをマスクし、接続先を特定できる情報は残す。
     */
    public static maskConnectionUrl(connectionUrl: string): string {
        return maskDsn(connectionUrl)
    };
}

class PostgresDriver {

    /**
     * PostgreSQL に接続してスキーマを取得する。
     */
    public static async fetchSnapshot(
        connectionUrl: string, target: SnapshotTarget, scope: SchemaCompareScope, timeouts: ConnectionTimeouts
    ): Promise<FetchDatabaseSnapshotResult> {
        const connectResult = await PostgresDriver.connect(connectionUrl, timeouts);
        if (connectResult.resultType === "failed") {
            return connectResult;
        }

        const connection = connectResult.connection;

        try {
            const targetSchemas = toPostgresTargetSchemas(target);
            const introspector = new PostgresIntrospector(connection);
            const snapshot = await introspector.fetchSnapshot(targetSchemas, scope);

            return { resultType: "fetched", snapshot };
        } catch (error: unknown) {
            const detail = (error instanceof Error) ? error.message : String(error);
            const baseMessage = `Failed to read schema from ${maskDsn(connectionUrl)}.\n  cause: ${detail}`;
            const message = appendTimeoutHint(baseMessage, detail, "query", timeouts.querySeconds);

            return { resultType: "failed", message };
        } finally {
            await connection.close();
        }
    }

    private static async connect(connectionUrl: string, timeouts: ConnectionTimeouts): Promise<PostgresConnectResult> {
        const driverResult = loadDriverModule("pg");
        if (driverResult.resultType === "missing") {
            return { resultType: "failed", message: driverResult.message };
        }

        const clientConstructor = PostgresDriver.initClientConstructor(driverResult.driverModule);
        if (clientConstructor == null) {
            const message = "The 'pg' module does not export a usable Client constructor.";
            return { resultType: "failed", message };
        }

        try {
            const client = new clientConstructor(toPostgresClientConfig(connectionUrl, timeouts));
            return doConnectPostgres(client);
        } catch (error: unknown) {
            const detail = (error instanceof Error) ? error.message : String(error);
            const baseMessage = "Failed to connect to the database.\n"
                + `  target: ${maskDsn(connectionUrl)}\n  cause : ${detail}`;
            const message = appendTimeoutHint(baseMessage, detail, "connection", timeouts.connectSeconds);

            return { resultType: "failed", message };
        }
    }

    private static initClientConstructor(driverModule: unknown): PostgresClientConstructor | null {
        if ((typeof driverModule !== "object") || (driverModule == null)) {
            return null;
        }

        const candidate = (driverModule as Record<string, unknown>).Client;
        return (typeof candidate === "function") ? (candidate as PostgresClientConstructor) : null;
    }
}

type PostgresClientConfig = {
    connectionString: string;
    connectionTimeoutMillis: number;
    statement_timeout: number;
    query_timeout: number;
};

type PostgresClientConstructor = new (config: PostgresClientConfig) => PostgresClientInstance;

/** pg の Client に渡す接続オプションを組み立てる。秒指定の timeouts をミリ秒へ変換するだけの純粋関数。 */
const toPostgresClientConfig = (connectionUrl: string, timeouts: ConnectionTimeouts): PostgresClientConfig => {
    return {
        connectionString: connectionUrl,
        connectionTimeoutMillis: timeouts.connectSeconds * 1000,
        statement_timeout: timeouts.querySeconds * 1000,
        query_timeout: timeouts.querySeconds * 1000
    };
};

// PostgreSQL が予約する名前空間。--schema での明示指定だけは利用者の意図として尊重する
const RESERVED_SCHEMA_PATTERN = /^(pg_|information_schema$)/;

/**
 * db-diff/migrate-ddl が PostgreSQL に実際に問い合わせる対象スキーマを決める。
 * --schema 明示時はその1つを常に対象にする(予約名でも尊重する — 利用者の明示的な指定のため)。
 * 未指定時は、利用者が意識せず db-diff を使った場合に、システムスキーマとの差分で誤検知させないため、
 * 設計側のテーブルが属するスキーマから、PostgreSQL 予約名(pg_*, information_schema)を除く。
 */
const toPostgresTargetSchemas = (target: SnapshotTarget): readonly string[] => {
    if (target.schemaOption !== "") {
        return [target.schemaOption];
    }

    return target.designSchemaNames.filter(schemaName => (RESERVED_SCHEMA_PATTERN.test(schemaName) === false));
};

type PostgresClientInstance = {
    connect: () => Promise<void>;
    end: () => Promise<void>;
    query: (sql: string, params: readonly unknown[]) => Promise<{ rows: SqlQueryRow[] }>;
};

type PostgresConnectResult =
    { resultType: "connected", connection: SqlConnection }
    | { resultType: "failed", message: string };

const doConnectPostgres = async (client: PostgresClientInstance): Promise<PostgresConnectResult> => {
    await client.connect();

    return {
        resultType: "connected",
        connection: {
            selectRows: async (sql, params) => {
                const result = await client.query(sql, params);
                return result.rows;
            },
            close: async () => await client.end()
        }
    };
};

class MySqlDriver {

    /**
     * MySQL/MariaDB に接続してスキーマを取得する。ドライバは mysql2/promise で共通。
     */
    public static async fetchSnapshot(
        connectionUrl: string, databaseType: "mysql" | "mariadb", scope: SchemaCompareScope,
        timeouts: ConnectionTimeouts
    ): Promise<FetchDatabaseSnapshotResult> {
        const connectResult = await MySqlDriver.connect(connectionUrl, timeouts);
        if (connectResult.resultType === "failed") {
            return connectResult;
        }

        const connection = connectResult.connection;

        try {
            await MySqlDriver.applyQueryTimeout(connection, databaseType, timeouts.querySeconds);
            const introspector = new MySqlIntrospector(connection);
            const snapshot = await introspector.fetchSnapshot(databaseType, scope);

            return { resultType: "fetched", snapshot };
        } catch (error: unknown) {
            const detail = (error instanceof Error) ? error.message : String(error);
            const baseMessage = `Failed to read schema from ${maskDsn(connectionUrl)}.\n  cause: ${detail}`;
            const message = appendTimeoutHint(baseMessage, detail, "query", timeouts.querySeconds);

            return { resultType: "failed", message };
        } finally {
            await connection.close();
        }
    }

    /**
     * mysql2 の query() には statement 単位のサーバ側タイムアウトが無いため、セッション変数で設定する。
     * MAX_EXECUTION_TIME(MySQL, ミリ秒)と max_statement_time(MariaDB, 秒/小数可)は変数名・単位が異なる。
     */
    private static async applyQueryTimeout(
        connection: SqlConnection, databaseType: "mysql" | "mariadb", querySeconds: number
    ): Promise<void> {
        if (databaseType === "mariadb") {
            await connection.selectRows("SET SESSION max_statement_time = ?", [querySeconds]);
            return;
        }

        await connection.selectRows("SET SESSION MAX_EXECUTION_TIME = ?", [querySeconds * 1000]);
    }

    private static async connect(connectionUrl: string, timeouts: ConnectionTimeouts): Promise<MySqlConnectResult> {
        const driverResult = loadDriverModule("mysql2/promise");
        if (driverResult.resultType === "missing") {
            return { resultType: "failed", message: driverResult.message };
        }

        const mysqlModule = MySqlDriver.initModule(driverResult.driverModule);
        if (mysqlModule == null) {
            const message = "The 'mysql2' module does not export a usable createConnection().";
            return { resultType: "failed", message };
        }

        try {
            const connection = await mysqlModule.createConnection(toMySqlConnectionOptions(connectionUrl, timeouts));

            return {
                resultType: "connected",
                connection: {
                    selectRows: async (sql, params) => {
                        const [rows] = await connection.query(sql, params);
                        return rows;
                    },
                    close: async () => await connection.end()
                }
            };
        } catch (error: unknown) {
            const detail = (error instanceof Error) ? error.message : String(error);
            const baseMessage = "Failed to connect to the database.\n"
                + `  target: ${maskDsn(connectionUrl)}\n  cause : ${detail}`;
            const message = appendTimeoutHint(baseMessage, detail, "connection", timeouts.connectSeconds);

            return { resultType: "failed", message: message };
        }
    }

    private static initModule(driverModule: unknown) {
        if ((typeof driverModule !== "object") || (driverModule == null)) {
            return null;
        }

        const candidate = (driverModule as Record<string, unknown>).createConnection;
        return (typeof candidate === "function") ? (driverModule as MySqlModule) : null;
    }
}

type MySqlConnectResult =
    { resultType: "connected", connection: SqlConnection }
    | { resultType: "failed", message: string };

type MySqlConnectionInstance = {
    query: (sql: string, params: readonly unknown[]) => Promise<[SqlQueryRow[], unknown]>;
    end: () => Promise<void>;
};

type MySqlConnectionOptions = {
    uri: string;
    connectTimeout: number;
};

type MySqlModule = {
    createConnection: (options: MySqlConnectionOptions) => Promise<MySqlConnectionInstance>;
};

// mysql2 は { uri, ...options } を渡すと URI をパースした上で他のオプションを合成する(uri 単体渡しの上位互換)。
const toMySqlConnectionOptions = (connectionUrl: string, timeouts: ConnectionTimeouts): MySqlConnectionOptions => {
    return { uri: connectionUrl, connectTimeout: timeouts.connectSeconds * 1000 };
};

// cSpell:ignore timedout

// OS レベルの接続タイムアウトは Node の "ETIMEDOUT"(TIMEOUT ではなく TIMEDOUT の綴り)で来る一方、
// pg/mysql2 自身が発火させるタイムアウトは "timeout" という語をそのまま含む。両方を手がかりにする。
const TIMEOUT_ERROR_PATTERN = /timeout|timedout/i;

/**
 * タイムアウト由来のエラーであることをメッセージに明記する。pg/mysql2 とも実際のエラーメッセージに
 * timeout 系の語を含むため、それを手がかりに設定値(何秒で打ち切ったか)を追記する。
 */
const appendTimeoutHint = (baseMessage: string, detail: string, timeoutLabel: string, seconds: number): string => {
    if (TIMEOUT_ERROR_PATTERN.test(detail) === false) {
        return baseMessage;
    }

    return `${baseMessage}\n  hint  : ${timeoutLabel} timed out after ${seconds}s.`;
};

type DriverConnectionSupport = {
    toPostgresClientConfig: (connectionUrl: string, timeouts: ConnectionTimeouts) => PostgresClientConfig;
    toMySqlConnectionOptions: (connectionUrl: string, timeouts: ConnectionTimeouts) => MySqlConnectionOptions;
    appendTimeoutHint: (baseMessage: string, detail: string, timeoutLabel: string, seconds: number) => string;
};

/**
 * pg/mysql2 の実ドライバなしに timeouts の変換結果を検証するための公開面。
 * PostgresDriver/MySqlDriver 自体は非公開のため、接続オプション組み立てのロジックだけをここで公開する。
 */
export const driverConnectionSupport: DriverConnectionSupport = {
    toPostgresClientConfig, toMySqlConnectionOptions, appendTimeoutHint
} as const;

/** ドライバの解決状態。見つかった/見つからないを1つの union で返す。 */
type DriverLoadResult = { resultType: "loaded", driverModule: unknown } | { resultType: "missing", message: string };

/**
 * esbuild が CJS 化した require はバンドル自身の位置を起点に解決するため、
 * 素直に require(name) と書くとユーザプロジェクトの node_modules が見えない。
 * 解決起点を明示して順に試す: 1. パッケージ自身の位置(npm 経由インストール時) 2. process.cwd()(単一ファイル配布時)。
 */
const loadDriverModule = (driverName: string): DriverLoadResult => {
    const packageOrigin = process.argv[1];
    // process.cwd() はディレクトリなので、createRequire の起点にそのまま渡すと dirname() で1階層上がってしまう。
    // 実在しないファイル名を足し、このディレクトリ自身を起点にする。
    const projectOrigin = path.join(process.cwd(), "noop.cjs");

    const origins = [packageOrigin, projectOrigin].filter(
        (origin): origin is string => (origin != null) && (origin !== "")
    );

    const loaded = origins.map(origin => tryResolveFrom(origin, driverName))
        .find(result => (result.resultType === "loaded"));

    if (loaded == null) {
        const message = `Driver not found: '${driverName}'.\n`
            + `  Could not resolve '${driverName}' from ${process.cwd()}.\n`
            + "  Run one of the following:\n"
            + `    npm install ${driverName.split("/")[0]}\n`
            + `    npx @kajitiluna/erd-cli db-diff ...   # drivers bundled`;

        return { resultType: "missing", message };
    }

    return loaded;
}

const tryResolveFrom = (origin: string, driverName: string): DriverLoadResult => {
    try {
        const requireFromOrigin = createRequire(origin);
        const driverModule: unknown = requireFromOrigin(driverName);

        return { resultType: "loaded", driverModule };
    } catch {
        return { resultType: "missing", message: "" };
    }
}

const maskDsn = (connectionUrl: string): string => {
    const parsedResult = parseDsn(connectionUrl);
    if (parsedResult.resultType === "invalid") {
        return "(invalid connection URL)";
    }

    const dsn = parsedResult.dsn;
    const credentials = toMaskedCredentials(dsn.username, dsn.password);
    const port = (dsn.port !== "") ? `:${dsn.port}` : "";

    return `${dsn.protocol}://${credentials}${dsn.host}${port}/${dsn.databaseName}`;
};

const toMaskedCredentials = (username: string, password: string): string => {
    if (username === "") {
        return "";
    }

    return (password !== "") ? `${username}:****@` : `${username}@`;
};

type ParseDsnResult = { resultType: "parsed", dsn: ParsedDsn } | { resultType: "invalid", message: string };

type ParsedDsn = {
    protocol: string;
    username: string;
    password: string;
    host: string;
    port: string;
    databaseName: string;
    searchParams: URLSearchParams;
};

const parseDsn = (connectionUrl: string): ParseDsnResult => {
    try {
        const url = new URL(connectionUrl);

        const dsn = {
            protocol: url.protocol.replace(/:$/, ""),
            username: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            host: url.hostname,
            port: url.port,
            databaseName: url.pathname.replace(/^\//, ""),
            searchParams: url.searchParams
        };

        return { resultType: "parsed", dsn };
    } catch (error: unknown) {
        const detail = (error instanceof Error) ? error.message : String(error);
        return { resultType: "invalid", message: `Invalid connection URL: ${detail}` };
    }
};
