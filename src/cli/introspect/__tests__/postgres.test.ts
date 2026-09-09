import { describe, expect, test } from 'vitest';

import { PostgresIntrospector, PostgresRawRows } from '~/cli/introspect/postgres';
import { SchemaCompareScope } from '~/models/schema/schema-snapshot';

const FULL_SCOPE: SchemaCompareScope = {
    withIndex: true, withForeignKey: true, withComment: true, withSchema: true, withLogicalName: false,
    commentStyle: 'with_description'
};

const baseColumn = (overrides: Partial<{
    column_name: string, formatted_type: string, not_null: boolean, is_identity: boolean,
    default_expr: string | null, comment: string
}> = {}) => {
    return {
        column_name: 'id', formatted_type: 'integer', not_null: true,
        is_identity: false, default_expr: null, comment: '',
        ...overrides
    };
};

const baseTableRawRow = (overrides: Partial<{
    schema_name: string, table_name: string, table_comment: string,
    columns: unknown[], primary_key_columns: string[], unique_keys: unknown[], indexes: unknown[], foreign_keys: unknown[]
}> = {}) => {
    return {
        schema_name: 'public', table_name: 'user', table_comment: '',
        columns: [baseColumn()], primary_key_columns: ['id'],
        unique_keys: [], indexes: [], foreign_keys: [],
        ...overrides
    };
};

const buildRawRows = (overrides: Partial<PostgresRawRows> = {}): PostgresRawRows => {
    return {
        tables: [baseTableRawRow()],
        schemaNames: [],
        ...overrides
    };
};

describe('PostgresIntrospector.toSnapshot: format_type() parsing', () => {
    const typeExpressionOf = (formattedType: string): string => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({ tables: [baseTableRawRow({ columns: [baseColumn({ formatted_type: formattedType })] })] }), FULL_SCOPE
        );
        return snapshot.tables[0].columns[0].typeExpression;
    };

    test('a bare type has no precision, scale, or time zone', () => {
        expect(typeExpressionOf('integer')).toBe('INTEGER');
    });

    test('character varying is aliased to VARCHAR, with its length as precision', () => {
        expect(typeExpressionOf('character varying(128)')).toBe('VARCHAR(128)');
    });

    test('a bare character varying (no length) still aliases to VARCHAR', () => {
        expect(typeExpressionOf('character varying')).toBe('VARCHAR');
    });

    test('character is aliased to CHAR', () => {
        expect(typeExpressionOf('character(10)')).toBe('CHAR(10)');
    });

    test('numeric(p, s) captures both precision and scale', () => {
        expect(typeExpressionOf('numeric(10,2)')).toBe('NUMERIC(10, 2)');
    });

    test('precision sits ahead of the time zone clause, and both are extracted', () => {
        expect(typeExpressionOf('timestamp(3) with time zone')).toBe('TIMESTAMP(3) WITH TIME ZONE');
    });

    test('a bare timestamp without time zone has no precision', () => {
        expect(typeExpressionOf('timestamp without time zone')).toBe('TIMESTAMP WITHOUT TIME ZONE');
    });

    test('a trailing [] marks the type as an array and is stripped before anything else', () => {
        expect(typeExpressionOf('integer[]')).toBe('INTEGER[]');
    });

    test('an array of a precision-bearing type strips the array suffix first', () => {
        expect(typeExpressionOf('character varying(128)[]')).toBe('VARCHAR(128)[]');
    });

    test('double precision has no alias needed, since format_type already matches the .erd spelling', () => {
        expect(typeExpressionOf('double precision')).toBe('DOUBLE PRECISION');
    });
});

describe('PostgresIntrospector.toSnapshot: column/index/foreign key assembly', () => {
    test('a matched type is normalized through ColumnType.specifiedType(), with the comma-space form for numeric', () => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({
                tables: [baseTableRawRow({ columns: [baseColumn({ column_name: 'price', formatted_type: 'numeric(10,2)' })] })]
            }),
            FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].typeExpression).toBe('NUMERIC(10, 2)');
    });

    test('a nextval(...) default marks the column auto-increment and clears the default value', () => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({
                tables: [baseTableRawRow({
                    columns: [baseColumn({ is_identity: true, default_expr: "nextval('user_id_seq'::regclass)" })]
                })]
            }),
            FULL_SCOPE
        );

        const column = snapshot.tables[0].columns[0];
        expect(column.autoIncrement).toBe(true);
        expect(column.defaultValue).toBe('');
    });

    test('a GENERATED ALWAYS AS IDENTITY column has no default expression to begin with', () => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({ tables: [baseTableRawRow({ columns: [baseColumn({ is_identity: true, default_expr: null })] })] }),
            FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].autoIncrement).toBe(true);
    });

    test('an ordinary default value is normalized, stripping a type cast', () => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({ tables: [baseTableRawRow({ columns: [baseColumn({ default_expr: "'active'::character varying" })] })] }),
            FULL_SCOPE
        );

        expect(snapshot.tables[0].columns[0].defaultValue).toBe('ACTIVE');
    });

    test('unsigned is always false, since PostgreSQL has no unsigned types', () => {
        const snapshot = PostgresIntrospector.toSnapshot(buildRawRows(), FULL_SCOPE);

        expect(snapshot.tables[0].columns[0].unsigned).toBe(false);
    });

    test('table and column logical names are always empty; DB has no such concept', () => {
        const snapshot = PostgresIntrospector.toSnapshot(buildRawRows(), FULL_SCOPE);

        expect(snapshot.tables[0].logicalName).toBe('');
        expect(snapshot.tables[0].columns[0].logicalName).toBe('');
    });

    // 出し分けは migrate-ddl の生成側で行うため、スナップショットは withComment に関わらず
    // 常に実値を保持する(schema-diff.ts の比較ゲートは schema-diff.test.ts で別途検証済み)。
    test('table and column comments are kept as-is regardless of withComment', () => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({
                tables: [baseTableRawRow({ table_comment: 'ユーザ', columns: [baseColumn({ comment: 'ID' })] })]
            }),
            { ...FULL_SCOPE, withComment: false }
        );

        expect(snapshot.tables[0].comment).toBe('ユーザ');
        expect(snapshot.tables[0].columns[0].comment).toBe('ID');
    });

    test('a supported index carries its access method as indexType, with no indexOption concept in Postgres', () => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({
                tables: [baseTableRawRow({
                    indexes: [{ index_name: 'idx_user__name', columns: ['name'], access_method: 'btree', is_partial: false, is_expression: false }]
                })]
            }),
            FULL_SCOPE
        );

        expect(snapshot.tables[0].indexes).toEqual([
            { indexName: 'idx_user__name', columnNames: ['name'], indexOption: '', indexType: 'BTREE' }
        ]);
    });

    test('a partial or expression index is excluded and reported as a warning, not silently dropped', () => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({
                tables: [baseTableRawRow({
                    indexes: [
                        { index_name: 'idx_partial', columns: ['name'], access_method: 'btree', is_partial: true, is_expression: false },
                        { index_name: 'idx_expr', columns: ['name'], access_method: 'btree', is_partial: false, is_expression: true }
                    ]
                })]
            }),
            FULL_SCOPE
        );

        expect(snapshot.tables[0].indexes).toEqual([]);
        expect(snapshot.warnings).toHaveLength(2);
        expect(snapshot.warnings[0]).toMatchObject({ category: 'index.unsupported', tableName: 'user' });
    });

    test('withIndex: false omits indexes and their warnings entirely', () => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({
                tables: [baseTableRawRow({
                    indexes: [{ index_name: 'idx_a', columns: ['name'], access_method: 'btree', is_partial: true, is_expression: false }]
                })]
            }),
            { ...FULL_SCOPE, withIndex: false }
        );

        expect(snapshot.tables[0].indexes).toEqual([]);
        expect(snapshot.warnings).toEqual([]);
    });

    test('unique key rows pass through unchanged, covering both inline and table-level constraints uniformly', () => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({
                tables: [baseTableRawRow({ unique_keys: [{ constraint_name: 'user_email_key', columns: ['email'] }] })]
            }),
            FULL_SCOPE
        );

        expect(snapshot.tables[0].uniqueKeys).toEqual([{ constraintName: 'user_email_key', columnNames: ['email'] }]);
    });

    test('foreign key action codes are translated to their SQL keywords', () => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({
                tables: [baseTableRawRow({
                    table_name: 'order_item',
                    foreign_keys: [{
                        constraint_name: 'order_item_shop_item_id_fkey', columns: ['shop_item_id'],
                        parent_schema_name: 'public', parent_table_name: 'shop_item', parent_columns: ['shop_item_id'],
                        on_update: 'c', on_delete: 'n'
                    }]
                })]
            }),
            FULL_SCOPE
        );

        expect(snapshot.tables[0].foreignKeys).toEqual([{
            constraintName: 'order_item_shop_item_id_fkey', columnNames: ['shop_item_id'],
            parentSchemaName: 'public', parentTableName: 'shop_item', parentColumnNames: ['shop_item_id'],
            onUpdate: 'CASCADE', onDelete: 'SET NULL'
        }]);
    });

    test('withForeignKey: false omits foreign keys', () => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({
                tables: [baseTableRawRow({
                    foreign_keys: [{
                        constraint_name: 'fk', columns: ['a'], parent_schema_name: 'public', parent_table_name: 'b',
                        parent_columns: ['id'], on_update: 'a', on_delete: 'a'
                    }]
                })]
            }),
            { ...FULL_SCOPE, withForeignKey: false }
        );

        expect(snapshot.tables[0].foreignKeys).toEqual([]);
    });

    test('schemaNames is passed through as given, independent of which tables were fetched', () => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({ schemaNames: [{ schema_name: 'public' }, { schema_name: 'shop' }] }), FULL_SCOPE
        );

        expect(snapshot.schemaNames).toEqual(['public', 'shop']);
    });

    // --no-schema はスキーマ名の比較有無を左右するだけで、fetchRawRows がどのスキーマを走査するかとは
    // 無関係(その判断は db-driver.ts の DbDriver.toPostgresTargetSchemas が担う)。
    test('withSchema: false empties schemaNames, independent of which tables were fetched', () => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({ schemaNames: [{ schema_name: 'public' }, { schema_name: 'shop' }] }),
            { ...FULL_SCOPE, withSchema: false }
        );

        expect(snapshot.schemaNames).toEqual([]);
        expect(snapshot.tables).toHaveLength(1);
    });

    test('tables from multiple schemas are all included, each keeping its own schemaName', () => {
        const snapshot = PostgresIntrospector.toSnapshot(
            buildRawRows({
                tables: [
                    baseTableRawRow({ schema_name: 'app', table_name: 'user' }),
                    baseTableRawRow({ schema_name: 'audit', table_name: 'user' })
                ]
            }),
            FULL_SCOPE
        );

        expect(snapshot.tables.map(table => `${table.schemaName}.${table.tableName}`)).toEqual(['app.user', 'audit.user']);
    });
});
