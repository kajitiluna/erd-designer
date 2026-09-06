import type { DatabaseType } from "~/models/database/DatabaseType";

/** db-diff が対応する方言のうち、実DB統合テストの対象になるもの。 */
export type IntegrationDialect = Extract<DatabaseType, "postgres" | "mysql" | "mariadb">;

export type IntegrationDatabaseTarget = {

    /** ターゲットの識別子。docker-compose のサービス名と一致させる。 */
    readonly id: string;
    readonly databaseType: IntegrationDialect;
    readonly version: string;
    readonly composeService: string;
    readonly defaultDsn: string;

    /** ローカル既定のDSNを上書きしたい場合の環境変数名。CI で docker-compose と異なるポートを使う場合の逃げ道。 */
    readonly envVarName: string;
};

// docker-compose.yml のポート割当と一致させる。値を変えたら両方を更新すること。
const ALL_TARGETS: readonly IntegrationDatabaseTarget[] = [
    {
        id: "postgres15", databaseType: "postgres", version: "15", composeService: "postgres15",
        defaultDsn: "postgres://db_user:db_password@127.0.0.1:15432/sample_db", envVarName: "ERD_TEST_DB_URL_POSTGRES15"
    },
    {
        id: "postgres16", databaseType: "postgres", version: "16", composeService: "postgres16",
        defaultDsn: "postgres://db_user:db_password@127.0.0.1:15433/sample_db", envVarName: "ERD_TEST_DB_URL_POSTGRES16"
    },
    {
        id: "postgres17", databaseType: "postgres", version: "17", composeService: "postgres17",
        defaultDsn: "postgres://db_user:db_password@127.0.0.1:15434/sample_db", envVarName: "ERD_TEST_DB_URL_POSTGRES17"
    },
    {
        id: "mysql80", databaseType: "mysql", version: "8.0", composeService: "mysql80",
        defaultDsn: "mysql://db_user:db_password@127.0.0.1:13306/sample_db", envVarName: "ERD_TEST_DB_URL_MYSQL80"
    },
    {
        id: "mysql84", databaseType: "mysql", version: "8.4", composeService: "mysql84",
        defaultDsn: "mysql://db_user:db_password@127.0.0.1:13307/sample_db", envVarName: "ERD_TEST_DB_URL_MYSQL84"
    },
    {
        id: "mysql9", databaseType: "mysql", version: "9", composeService: "mysql9",
        defaultDsn: "mysql://db_user:db_password@127.0.0.1:13308/sample_db", envVarName: "ERD_TEST_DB_URL_MYSQL9"
    },
    {
        id: "mariadb1011", databaseType: "mariadb", version: "10.11", composeService: "mariadb1011",
        defaultDsn: "mysql://db_user:db_password@127.0.0.1:13406/sample_db", envVarName: "ERD_TEST_DB_URL_MARIADB1011"
    },
    {
        id: "mariadb114", databaseType: "mariadb", version: "11.4", composeService: "mariadb114",
        defaultDsn: "mysql://db_user:db_password@127.0.0.1:13407/sample_db", envVarName: "ERD_TEST_DB_URL_MARIADB114"
    },
    {
        id: "mariadb11", databaseType: "mariadb", version: "11", composeService: "mariadb11",
        defaultDsn: "mysql://db_user:db_password@127.0.0.1:13408/sample_db", envVarName: "ERD_TEST_DB_URL_MARIADB11"
    }
] as const;

const SELECTION_ENV_VAR = "ERD_TEST_DB_TARGETS";

const selectTargets = (): readonly IntegrationDatabaseTarget[] => {
    const selection = process.env[SELECTION_ENV_VAR];
    if ((selection == null) || (selection.trim() === "")) {
        return ALL_TARGETS;
    }

    const selectedIds = new Set(selection.split(",").map(id => id.trim()).filter(id => (id !== "")));
    return ALL_TARGETS.filter(target => selectedIds.has(target.id));
};

const resolveDsn = (target: IntegrationDatabaseTarget): string => {
    return process.env[target.envVarName] ?? target.defaultDsn;
};

/**
 * 実DB統合テストが対象とするDBバージョンの一覧。
 * `ERD_TEST_DB_TARGETS`(カンマ区切りのid)で絞り込める。未指定時はローカル既定の全9バージョン。
 * globalSetup(コンテナ起動)とテスト本体(DSN解決)の双方から参照する、唯一の定義元。
 */
export const IntegrationDatabaseTargets = {
    all: (): readonly IntegrationDatabaseTarget[] => { return ALL_TARGETS; },
    selected: (): readonly IntegrationDatabaseTarget[] => { return selectTargets(); },
    resolveDsn
} as const;
