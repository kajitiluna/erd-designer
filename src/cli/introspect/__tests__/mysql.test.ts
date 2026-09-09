import { describe, expect, test } from 'vitest';

import { MySqlIntrospector, MySqlRawRows } from '~/cli/introspect/mysql';
import { SqlConnection, SqlQueryRow } from '~/cli/introspect/sql-connection';
import { SchemaCompareScope } from '~/models/schema/schema-snapshot';

const FULL_SCOPE: SchemaCompareScope = {
    withIndex: true, withForeignKey: true, withComment: true, withSchema: true, withLogicalName: false,
    commentStyle: 'with_description'
};

// SELECT VERSION() の生行。"MARIADB" を含むかどうかだけが isActualMariaDb の判定材料。
const NON_MARIADB_VERSION_ROWS = [{ version: '9.0.1' }];
const MARIADB_VERSION_ROWS = [{ version: '10.6.0-MariaDB' }];

const baseColumnRawRow = (overrides: Partial<{
    table_name: string, column_name: string, column_type: string, not_null: unknown,
    column_default: string | null, extra: string, comment: string
}> = {}) => {
    return {
        table_name: 'user', column_name: 'id', column_type: 'int(11)', not_null: false,
        column_default: null, extra: '', comment: '',
        ...overrides
    };
};

const baseTableRawRow = (overrides: Partial<{ table_name: string, table_comment: string }> = {}) => {
    return { table_name: 'user', table_comment: '', ...overrides };
};

const buildRawRows = (overrides: Partial<MySqlRawRows> = {}): MySqlRawRows => {
    return {
        tables: [baseTableRawRow()],
        columns: [baseColumnRawRow()],
        indexColumns: [],
        foreignKeys: [],
        versionRows: NON_MARIADB_VERSION_ROWS,
        ...overrides
    };
};

type RecordedQuery = { sql: string, params: readonly unknown[] };

// SELECT のみを記録するフェイク。SELECT DATABASE() には指定行を、それ以外には空配列を返す。
const buildFakeConnection = (
    databaseNameRows: readonly SqlQueryRow[]
): { connection: SqlConnection, queries: RecordedQuery[] } => {
    const queries: RecordedQuery[] = [];
    const connection: SqlConnection = {
        selectRows: async (sql, params) => {
            queries.push({ sql, params });
            return sql.includes('DATABASE()') ? [...databaseNameRows] : [];
        },
        close: async () => { /* do nothing */ }
    };

    return { connection, queries };
};

describe('MySqlIntrospector.fetchSnapshot: target database resolution', () => {
    // fetchCurrentDatabaseName は private のため、fetchSnapshot 経由でしか検証できない。
    // 対象DBは DSN の独自パースではなく SELECT DATABASE() の応答で決まる(mysql に schema 概念は無い)。
    test('resolves the target database via SELECT DATABASE() and passes it to the catalog queries', async () => {
        const { connection, queries } = buildFakeConnection([{ database_name: 'shop' }]);

        await new MySqlIntrospector(connection).fetchSnapshot('mysql', FULL_SCOPE);

        const tablesQuery = queries.find(query => query.sql.includes('information_schema.tables'));
        expect(tablesQuery?.params).toEqual(['shop']);
    });

    test('SELECT DATABASE() returning no database rejects with a clear message', async () => {
        const { connection } = buildFakeConnection([{ database_name: null }]);

        await expect(new MySqlIntrospector(connection).fetchSnapshot('mysql', FULL_SCOPE))
            .rejects.toThrow('No database selected.');
    });
});

describe('MySqlIntrospector.toSnapshot: not_null coercion (mysql2 returns 0/1, not a JS boolean)', () => {
    // mysql2 は SQL の比較式の結果を JS boolean ではなく number(0/1)で返す(実DBで確認済み)。
    // 両方の表現を受け付けることを固定する。
    test('accepts a native boolean', () => {
        const notNullTrue = MySqlIntrospector.toSnapshot(buildRawRows({ columns: [baseColumnRawRow({ not_null: true })] }), 'mysql', FULL_SCOPE);
        const notNullFalse = MySqlIntrospector.toSnapshot(buildRawRows({ columns: [baseColumnRawRow({ not_null: false })] }), 'mysql', FULL_SCOPE);

        expect(notNullTrue.tables[0].columns[0].notNull).toBe(true);
        expect(notNullFalse.tables[0].columns[0].notNull).toBe(false);
    });

    test('accepts the number 1/0 that mysql2 actually returns for comparison expressions', () => {
        const notNullOne = MySqlIntrospector.toSnapshot(buildRawRows({ columns: [baseColumnRawRow({ not_null: 1 })] }), 'mysql', FULL_SCOPE);
        const notNullZero = MySqlIntrospector.toSnapshot(buildRawRows({ columns: [baseColumnRawRow({ not_null: 0 })] }), 'mysql', FULL_SCOPE);

        expect(notNullOne.tables[0].columns[0].notNull).toBe(true);
        expect(notNullZero.tables[0].columns[0].notNull).toBe(false);
    });

    test('accepts a string "1" defensively', () => {
        const snapshot = MySqlIntrospector.toSnapshot(buildRawRows({ columns: [baseColumnRawRow({ not_null: '1' })] }), 'mysql', FULL_SCOPE);

        expect(snapshot.tables[0].columns[0].notNull).toBe(true);
    });

    test('anything else (null, undefined, other strings) is false', () => {
        const values: unknown[] = [null, undefined, '0', 'yes'];
        const results = values.map(value => {
            return MySqlIntrospector.toSnapshot(buildRawRows({ columns: [baseColumnRawRow({ not_null: value })] }), 'mysql', FULL_SCOPE);
        });

        results.forEach(snapshot => {
            expect(snapshot.tables[0].columns[0].notNull).toBe(false);
        });
    });
});

describe('MySqlIntrospector.toSnapshot: default value assembly (ON UPDATE clause / current_timestamp() spelling)', () => {
    // 実DB(MySQL 9)で検証するまで、この "on update" 句が COLUMN_DEFAULT に含まれないことに
    // 気づけず、design 側の defaultValue("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")と
    // 恒常的に不一致になっていた。生行 → 型付き行の変換で組み立て直し、最終的な比較用表現
    // (大文字化済み)まで一貫して固定する。
    test('appends "ON UPDATE <expr>" when EXTRA has an on-update clause', () => {
        const rawRows = buildRawRows({
            columns: [baseColumnRawRow({ column_default: 'CURRENT_TIMESTAMP', extra: 'default_generated on update current_timestamp' })]
        });

        const snapshot = MySqlIntrospector.toSnapshot(rawRows, 'mysql', FULL_SCOPE);

        expect(snapshot.tables[0].columns[0].defaultValue).toBe('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    });

    test('leaves the default value untouched when EXTRA has no on-update clause', () => {
        const rawRows = buildRawRows({
            columns: [baseColumnRawRow({ column_default: 'CURRENT_TIMESTAMP', extra: 'default_generated' })]
        });

        const snapshot = MySqlIntrospector.toSnapshot(rawRows, 'mysql', FULL_SCOPE);

        expect(snapshot.tables[0].columns[0].defaultValue).toBe('CURRENT_TIMESTAMP');
    });

    // "updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP"(DEFAULT 句なし)は MySQL では
    // 正当な定義であり、COLUMN_DEFAULT は NULL でも ON UPDATE 句だけは失ってはならない。
    test('an on-update clause survives even when there is no DEFAULT at all', () => {
        const rawRows = buildRawRows({
            columns: [baseColumnRawRow({ column_default: null, extra: 'default_generated on update current_timestamp' })]
        });

        const snapshot = MySqlIntrospector.toSnapshot(rawRows, 'mysql', FULL_SCOPE);

        expect(snapshot.tables[0].columns[0].defaultValue).toBe('ON UPDATE CURRENT_TIMESTAMP');
    });

    test('a column with no EXTRA at all is unaffected', () => {
        const withZeroDefault = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ column_default: '0', extra: '' })] }), 'mysql', FULL_SCOPE
        );
        const withNullDefault = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ column_default: null, extra: '' })] }), 'mysql', FULL_SCOPE
        );

        expect(withZeroDefault.tables[0].columns[0].defaultValue).toBe('0');
        expect(withNullDefault.tables[0].columns[0].defaultValue).toBe('');
    });

    // MariaDB(実DBで確認: created_at/updated_at 双方)は CURRENT_TIMESTAMP 系の値を
    // "current_timestamp()" の関数呼び出し形式で返す。MySQL の素の綴りに揃える。
    test('collapses the MariaDB function-call form to the MySQL spelling', () => {
        const rawRows = buildRawRows({ columns: [baseColumnRawRow({ column_default: 'current_timestamp()', extra: '' })] });

        const snapshot = MySqlIntrospector.toSnapshot(rawRows, 'mysql', FULL_SCOPE);

        expect(snapshot.tables[0].columns[0].defaultValue).toBe('CURRENT_TIMESTAMP');
    });

    test('a bare MySQL-style value is left as-is', () => {
        const rawRows = buildRawRows({ columns: [baseColumnRawRow({ column_default: 'CURRENT_TIMESTAMP', extra: '' })] });

        const snapshot = MySqlIntrospector.toSnapshot(rawRows, 'mysql', FULL_SCOPE);

        expect(snapshot.tables[0].columns[0].defaultValue).toBe('CURRENT_TIMESTAMP');
    });

    test('a null column_default passes through as "no default"', () => {
        const rawRows = buildRawRows({ columns: [baseColumnRawRow({ column_default: null, extra: '' })] });

        const snapshot = MySqlIntrospector.toSnapshot(rawRows, 'mysql', FULL_SCOPE);

        expect(snapshot.tables[0].columns[0].defaultValue).toBe('');
    });

    test('combined with the ON UPDATE merge, a MariaDB ON UPDATE clause normalizes too', () => {
        // 実DB(MariaDB)で確認した実際の行: column_default="current_timestamp()",
        // extra="on update current_timestamp()"
        const rawRows = buildRawRows({
            columns: [baseColumnRawRow({ column_default: 'current_timestamp()', extra: 'on update current_timestamp()' })],
            versionRows: MARIADB_VERSION_ROWS
        });

        const snapshot = MySqlIntrospector.toSnapshot(rawRows, 'mariadb', FULL_SCOPE);

        expect(snapshot.tables[0].columns[0].defaultValue).toBe('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    });
});

describe('MySqlIntrospector.toSnapshot: COLUMN_TYPE parsing (display width / unsigned / zerofill / enum)', () => {
    const typeExpressionOf = (columnType: string): string => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ column_type: columnType })] }), 'mysql', FULL_SCOPE
        );
        return snapshot.tables[0].columns[0].typeExpression;
    };

    // 整数型の表示幅(m)は保存上の意味を持たない歴史的な表示指定であり、MySQL 8.0.19+ はそもそも
    // 返さない一方、MariaDB は既定の表示幅を常に返す(実DB(MariaDB 11)で確認: 明示指定していない
    // BIGINT 列も常に "bigint(20)" と返ってくる)。明示/既定を区別できないため常に破棄する。
    test('a display-width integer discards the width entirely, but keeps unsigned separate', () => {
        expect(typeExpressionOf('int(11)')).toBe('INT');
    });

    test('MariaDB always includes a default display width even when the design did not specify one', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ column_type: 'bigint(20) unsigned' })] }), 'mysql', FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].typeExpression).toBe('BIGINT');
        expect(snapshot.tables[0].columns[0].unsigned).toBe(true);
    });

    test('display width is discarded for every integer category (tinyint(4)/smallint/mediumint/bigint)', () => {
        expect(typeExpressionOf('smallint(6)')).toBe('SMALLINT');
        expect(typeExpressionOf('mediumint(9)')).toBe('MEDIUMINT');
        expect(typeExpressionOf('bigint(20)')).toBe('BIGINT');
    });

    test('non-integer types keep their precision; only the integer display width is special-cased', () => {
        expect(typeExpressionOf('varchar(255)')).toBe('VARCHAR(255)');
    });

    test('unsigned is parsed out of COLUMN_TYPE, not left in the base name', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ column_type: 'int unsigned' })] }), 'mysql', FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].typeExpression).toBe('INT');
        expect(snapshot.tables[0].columns[0].unsigned).toBe(true);
    });

    test('decimal(p, s) captures both precision and scale alongside unsigned', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ column_type: 'decimal(10,2) unsigned' })] }), 'mysql', FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].typeExpression).toBe('DECIMAL(10, 2)');
        expect(snapshot.tables[0].columns[0].unsigned).toBe(true);
    });

    test('tinyint(1) is treated as BOOLEAN, since the two are indistinguishable in the catalog', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ column_type: 'tinyint(1)' })] }), 'mysql', FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].typeExpression).toBe('BOOLEAN');
        expect(snapshot.tables[0].columns[0].unsigned).toBe(false);
    });

    // BOOLEAN は符号の概念を持たない型。tinyint(1) unsigned の unsigned 接尾辞は畳んだ時点で意味を
    // 失うため、design 側(boolean は withUnsigned:false で常に false)と揃えて false に固定する。
    test('tinyint(1) unsigned still collapses to BOOLEAN with unsigned discarded', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ column_type: 'tinyint(1) unsigned' })] }), 'mysql', FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].typeExpression).toBe('BOOLEAN');
        expect(snapshot.tables[0].columns[0].unsigned).toBe(false);
    });

    test('tinyint with any other display width is a plain TINYINT, with the width discarded like other integers', () => {
        expect(typeExpressionOf('tinyint(4)')).toBe('TINYINT');
    });

    test('enum/set values are dropped and flagged for the caller to warn about', () => {
        const enumSnapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ column_name: 'status', column_type: "enum('a','b')" })] }), 'mysql', FULL_SCOPE
        );
        const setSnapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ column_name: 'flags', column_type: "set('x','y')" })] }), 'mysql', FULL_SCOPE
        );

        expect(enumSnapshot.tables[0].columns[0].typeExpression).toBe('ENUM');
        expect(enumSnapshot.warnings.some(warning => (warning.category === 'enumValues.ignored'))).toBe(true);
        expect(setSnapshot.tables[0].columns[0].typeExpression).toBe('SET');
        expect(setSnapshot.warnings.some(warning => (warning.category === 'enumValues.ignored'))).toBe(true);
    });

    test('zerofill is parsed out and flagged, independent of unsigned (display width still discarded)', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ column_type: 'int(10) unsigned zerofill' })] }), 'mysql', FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].typeExpression).toBe('INT');
        expect(snapshot.tables[0].columns[0].unsigned).toBe(true);
        expect(snapshot.warnings.some(warning => (warning.category === 'zeroFill.ignored'))).toBe(true);
    });
});

describe('MySqlIntrospector.toSnapshot: table/index/foreign key assembly', () => {
    // not_null は information_schema の `IS_NULLABLE = 'NO'` の結果をそのまま受け取る(否定しない)。
    // 実DB(MySQL 9)で検証した際に、この方向を取り違えて全カラムの notNull が反転する不具合が
    // 見つかった。true/false 両方を固定して再発を防ぐ(デフォルト値だけでは区別できないケースだった)。
    test('not_null: true on the row means notNull: true on the snapshot, not its negation', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ not_null: true })] }), 'mysql', FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].notNull).toBe(true);
    });

    test('not_null: false on the row means notNull: false on the snapshot', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ not_null: false })] }), 'mysql', FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].notNull).toBe(false);
    });

    test('zerofill and dropped enum/set values are reported as warnings, not silently ignored', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({
                columns: [
                    baseColumnRawRow({ column_name: 'flags', column_type: 'int(10) unsigned zerofill' }),
                    baseColumnRawRow({ column_name: 'status', column_type: "enum('a','b')" })
                ]
            }),
            'mysql', FULL_SCOPE
        );

        expect(snapshot.warnings.some(warning => (warning.category === 'zeroFill.ignored'))).toBe(true);
        expect(snapshot.warnings.some(warning => (warning.category === 'enumValues.ignored'))).toBe(true);
    });

    test('schemaNames and every table schemaName are always empty; MySQL has no schema concept', () => {
        const snapshot = MySqlIntrospector.toSnapshot(buildRawRows(), 'mysql', FULL_SCOPE);

        expect(snapshot.schemaNames).toEqual([]);
        expect(snapshot.tables[0].schemaName).toBe('');
    });

    test('primary key columns are ordered by SEQ_IN_INDEX, not row order', () => {
        const indexColumns = [
            { table_name: 'user', index_name: 'PRIMARY', column_name: 'b', seq_in_index: 2, non_unique: false },
            { table_name: 'user', index_name: 'PRIMARY', column_name: 'a', seq_in_index: 1, non_unique: false }
        ];

        const snapshot = MySqlIntrospector.toSnapshot(buildRawRows({ indexColumns }), 'mysql', FULL_SCOPE);

        expect(snapshot.tables[0].primaryKeyColumnNames).toEqual(['a', 'b']);
    });

    test('a unique (non_unique=false) named index becomes a uniqueKey, not an index', () => {
        const indexColumns = [
            { table_name: 'user', index_name: 'uq_user__email', column_name: 'email', seq_in_index: 1, non_unique: false }
        ];

        const snapshot = MySqlIntrospector.toSnapshot(buildRawRows({ indexColumns }), 'mysql', FULL_SCOPE);

        expect(snapshot.tables[0].uniqueKeys).toEqual([{ constraintName: 'uq_user__email', columnNames: ['email'] }]);
        expect(snapshot.tables[0].indexes).toEqual([]);
    });

    test('a plain (non_unique=true) index becomes an index, not a uniqueKey', () => {
        const indexColumns = [
            {
                table_name: 'user', index_name: 'idx_user__name', column_name: 'name', seq_in_index: 1,
                non_unique: true, index_type: 'BTREE'
            }
        ];

        const snapshot = MySqlIntrospector.toSnapshot(buildRawRows({ indexColumns }), 'mysql', FULL_SCOPE);

        expect(snapshot.tables[0].indexes).toEqual([{ indexName: 'idx_user__name', columnNames: ['name'], indexOption: '', indexType: 'BTREE' }]);
        expect(snapshot.tables[0].uniqueKeys).toEqual([]);
    });

    test('FULLTEXT/SPATIAL index types become indexOption, not indexType', () => {
        const indexColumns = [
            {
                table_name: 'user', index_name: 'ft_user__bio', column_name: 'bio', seq_in_index: 1,
                non_unique: true, index_type: 'FULLTEXT'
            }
        ];

        const snapshot = MySqlIntrospector.toSnapshot(buildRawRows({ indexColumns }), 'mysql', FULL_SCOPE);

        expect(snapshot.tables[0].indexes).toEqual([{ indexName: 'ft_user__bio', columnNames: ['bio'], indexOption: 'FULLTEXT', indexType: '' }]);
    });

    test('an unrecognized index type is excluded from comparison with a warning, not silently zeroed out', () => {
        const indexColumns = [
            {
                table_name: 'user', index_name: 'rt_user__area', column_name: 'area', seq_in_index: 1,
                non_unique: true, index_type: 'RTREE'
            }
        ];

        const snapshot = MySqlIntrospector.toSnapshot(buildRawRows({ indexColumns }), 'mysql', FULL_SCOPE);

        expect(snapshot.tables[0].indexes).toEqual([]);
        expect(snapshot.warnings.some(warning =>
            (warning.category === 'index.unsupported') && warning.message.includes('rt_user__area')
        )).toBe(true);
    });

    // 実DB(MySQL 9)での検証で判明: information_schema からは「InnoDB が自動生成した無名インデックス」と
    // 「FK 列にたまたま貼られた設計者本人の実インデックス」を区別できない。以前はこの2つを区別せず
    // 「FK の列構成と一致するインデックスは常に抑止する」設計だったが、それだと design 側が明示的に
    // 持つ同名インデックス(user_sign_in.idx_user_sign_in__user_id 等、よくある設計)まで actual 側から
    // 消え、"Missing index" の誤検出を引き起こしていた。抑止ロジックは撤去し、常に素通しする。
    test('an index on FK columns is never suppressed, even when a foreign key covers the same columns', () => {
        const indexColumns = [{
            table_name: 'user', index_name: 'shop_id', column_name: 'shop_id', seq_in_index: 1,
            non_unique: true, index_type: 'BTREE'
        }];
        const foreignKeys = [{
            table_name: 'user', constraint_name: 'user_ibfk_1', column_name: 'shop_id', ordinal_position: 1,
            parent_table_name: 'shop', parent_column_name: 'id', on_update: 'CASCADE', on_delete: 'RESTRICT'
        }];

        const snapshot = MySqlIntrospector.toSnapshot(buildRawRows({ indexColumns, foreignKeys }), 'mysql', FULL_SCOPE);

        expect(snapshot.tables[0].indexes).toHaveLength(1);
        expect(snapshot.tables[0].foreignKeys).toHaveLength(1);
    });

    test('foreign key rows spanning multiple columns are grouped by constraint name and ordered', () => {
        const foreignKeys = [
            {
                table_name: 'user', constraint_name: 'fk_composite', column_name: 'b', ordinal_position: 2,
                parent_table_name: 'parent', parent_column_name: 'pb', on_update: 'RESTRICT', on_delete: 'RESTRICT'
            },
            {
                table_name: 'user', constraint_name: 'fk_composite', column_name: 'a', ordinal_position: 1,
                parent_table_name: 'parent', parent_column_name: 'pa', on_update: 'RESTRICT', on_delete: 'RESTRICT'
            }
        ];

        const snapshot = MySqlIntrospector.toSnapshot(buildRawRows({ foreignKeys }), 'mysql', FULL_SCOPE);

        expect(snapshot.tables[0].foreignKeys).toEqual([{
            constraintName: 'fk_composite', columnNames: ['a', 'b'], parentSchemaName: '', parentTableName: 'parent',
            parentColumnNames: ['pa', 'pb'], onUpdate: 'RESTRICT', onDelete: 'RESTRICT'
        }]);
    });

    test('withForeignKey: false omits foreign keys and does not suppress any index', () => {
        const indexColumns = [{
            table_name: 'user', index_name: 'shop_id', column_name: 'shop_id', seq_in_index: 1,
            non_unique: true, index_type: 'BTREE'
        }];
        const foreignKeys = [{
            table_name: 'user', constraint_name: 'user_ibfk_1', column_name: 'shop_id', ordinal_position: 1,
            parent_table_name: 'shop', parent_column_name: 'id', on_update: 'RESTRICT', on_delete: 'RESTRICT'
        }];

        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ indexColumns, foreignKeys }), 'mysql', { ...FULL_SCOPE, withForeignKey: false }
        );

        expect(snapshot.tables[0].foreignKeys).toEqual([]);
        expect(snapshot.tables[0].indexes).toHaveLength(1);
    });

    test('auto_increment in EXTRA sets autoIncrement true', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ extra: 'auto_increment' })] }), 'mysql', FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].autoIncrement).toBe(true);
    });

    test('column_default is passed through as-is when EXTRA carries no on-update clause', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ extra: 'default_generated', column_default: 'CURRENT_TIMESTAMP' })] }),
            'mysql', FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].defaultValue).toBe('CURRENT_TIMESTAMP');
    });

    test('a MariaDB-style quoted string default is unquoted', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ column_default: "'active'" })], versionRows: MARIADB_VERSION_ROWS }),
            'mariadb', FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].defaultValue).toBe('ACTIVE');
    });

    test('a MariaDB literal "NULL" string default normalizes to no default, same as SQL NULL', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ column_default: 'NULL' })], versionRows: MARIADB_VERSION_ROWS }),
            'mariadb', FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].defaultValue).toBe('');
    });

    test('a null column_default (MySQL SQL NULL) normalizes to no default', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({ columns: [baseColumnRawRow({ column_default: null })] }), 'mysql', FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].defaultValue).toBe('');
    });

    test('a declared type matching the actual server reports no warning', () => {
        const snapshotMySql = MySqlIntrospector.toSnapshot(buildRawRows(), 'mysql', FULL_SCOPE);
        const snapshotMariaDb = MySqlIntrospector.toSnapshot(buildRawRows({ versionRows: MARIADB_VERSION_ROWS }), 'mariadb', FULL_SCOPE);

        expect(snapshotMySql.warnings.some(warning => (warning.category === 'databaseType.mismatch'))).toBe(false);
        expect(snapshotMariaDb.warnings.some(warning => (warning.category === 'databaseType.mismatch'))).toBe(false);
    });

    test('declaring mysql but connecting to an actual MariaDB server reports a mismatch warning', () => {
        const snapshot = MySqlIntrospector.toSnapshot(buildRawRows({ versionRows: MARIADB_VERSION_ROWS }), 'mysql', FULL_SCOPE);

        expect(snapshot.warnings).toContainEqual(expect.objectContaining({ category: 'databaseType.mismatch' }));
    });

    // 出し分けは migrate-ddl の生成側で行うため、スナップショットは withComment に関わらず
    // 常に実値を保持する(schema-diff.ts の比較ゲートは schema-diff.test.ts で別途検証済み)。
    test('table and column comments are kept as-is regardless of withComment', () => {
        const snapshot = MySqlIntrospector.toSnapshot(
            buildRawRows({
                tables: [baseTableRawRow({ table_comment: 'user table' })],
                columns: [baseColumnRawRow({ comment: 'the id' })]
            }),
            'mysql', { ...FULL_SCOPE, withComment: false }
        );

        expect(snapshot.tables[0].comment).toBe('user table');
        expect(snapshot.tables[0].columns[0].comment).toBe('the id');
    });
});
