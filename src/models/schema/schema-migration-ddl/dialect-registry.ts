import { DatabaseType } from "~/models/database/DatabaseType";
import { DestructivePolicy } from "~/models/schema/schema-migration-ddl/migration-statement";
import { DialectFactory, DialectFormatter } from "~/models/schema/schema-migration-ddl/dialect";
import { postgresDialect } from "~/models/schema/schema-migration-ddl/postgres-dialect";
import { mySqlDialect } from "~/models/schema/schema-migration-ddl/mysql-dialect";

export default class DialectRegistry {

    private constructor() {
        // do nothing.
    }

    /** databaseType に対応する方言が無ければ null(migrate-ddl.ts の DbDriver.supports() で先に弾かれる想定)。 */
    public static findDialect(
        databaseType: DatabaseType, destructivePolicy: DestructivePolicy, withComment: boolean
    ): DialectFormatter | null {
        const factory = DIALECT_FACTORIES[databaseType];
        if (factory == null) {
            return null;
        }

        return factory(destructivePolicy, withComment);
    }
};

// 方言が増えたとき ({[key in DatabaseType]: ...}) がコンパイルエラーで検出させるための網羅レコード。
const DIALECT_FACTORIES: { [key in DatabaseType]: DialectFactory | null } = {
    postgres: postgresDialect,
    mysql: mySqlDialect,
    mariadb: mySqlDialect,
    ms_sqlserver: null,
    sqlite: null,
    bigquery: null,
    snowflake: null
};
