import { describe, expect, test } from 'vitest';

import ColumnShareModel from '~/models/database/ColumnShareModel';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import { findDatabaseColumns } from '~/models/database/columns';
import { DatabaseType } from '~/models/database/DatabaseType';
import { ColumnSnapshots, DatabaseColumnFacts, DesignedColumnFacts } from '~/models/schema/column-snapshot';
import { DdlCommentOption } from '~/models/schema/ddl-comment';
import { SchemaCompareScope } from '~/models/schema/schema-snapshot';

const FULL_SCOPE: SchemaCompareScope = {
    withIndex: true, withForeignKey: true, withComment: true, withSchema: true, withLogicalName: true,
    commentStyle: 'with_description'
};

const NO_COMMENT: DdlCommentOption = { withComment: false, commentStyle: 'logical_name', commentSeparator: ': ' };

const findColumnType = (databaseType: DatabaseType, name: string) => {
    const columnType = findDatabaseColumns(databaseType).find(candidate => candidate.name === name);
    if (columnType == null) {
        throw new Error(`column type not found: ${name}`);
    }
    return columnType;
};

const baseDatabaseFacts = (overrides: Partial<DatabaseColumnFacts> = {}): DatabaseColumnFacts => {
    return {
        databaseType: 'postgres',
        columnName: 'id',
        typeQuery: { columnType: 'INTEGER', timezone: '', precision: null, scale: null, isArray: false },
        declaredExpression: 'integer',
        unsigned: false,
        notNull: true,
        defaultValue: null,
        autoIncrement: false,
        comment: '',
        ...overrides
    };
};

// 旧 normalizeDefaultValue の全ケース。DB 由来の既定値表現(型キャスト・引用符・大小文字)の
// 正規化規則は ColumnSnapshots.ofDatabaseColumn 経由でのみ検証する(private 化したため)。
describe('ColumnSnapshots.ofDatabaseColumn defaultValue normalization', () => {
    test('trims surrounding whitespace', () => {
        const snapshot = ColumnSnapshots.ofDatabaseColumn(baseDatabaseFacts({ defaultValue: '  CURRENT_TIMESTAMP  ' }));

        expect(snapshot.defaultValue).toBe('CURRENT_TIMESTAMP');
    });

    test('an empty string and NULL both normalize to an empty string', () => {
        expect(ColumnSnapshots.ofDatabaseColumn(baseDatabaseFacts({ defaultValue: '' })).defaultValue).toBe('');
        expect(ColumnSnapshots.ofDatabaseColumn(baseDatabaseFacts({ defaultValue: 'null' })).defaultValue).toBe('');
        expect(ColumnSnapshots.ofDatabaseColumn(baseDatabaseFacts({ defaultValue: 'NULL' })).defaultValue).toBe('');
    });

    test('a null defaultValue (no default given) normalizes to an empty string', () => {
        const snapshot = ColumnSnapshots.ofDatabaseColumn(baseDatabaseFacts({ defaultValue: null }));

        expect(snapshot.defaultValue).toBe('');
    });

    test('strips a PostgreSQL type cast suffix', () => {
        const snapshot = ColumnSnapshots.ofDatabaseColumn(baseDatabaseFacts({ defaultValue: "'abc'::character varying" }));

        expect(snapshot.defaultValue).toBe('ABC');
    });

    test('strips surrounding single quotes and unescapes doubled quotes', () => {
        const snapshot = ColumnSnapshots.ofDatabaseColumn(baseDatabaseFacts({ defaultValue: "'it''s here'" }));

        expect(snapshot.defaultValue).toBe("IT'S HERE");
    });

    test('uppercases the result for case-insensitive comparison', () => {
        const snapshot = ColumnSnapshots.ofDatabaseColumn(baseDatabaseFacts({ defaultValue: 'current_timestamp' }));

        expect(snapshot.defaultValue).toBe('CURRENT_TIMESTAMP');
    });
});

describe('ColumnSnapshots.ofDatabaseColumn autoIncrement', () => {
    // postgres.ts の is_identity は `attidentity IN ('a','d') OR default LIKE 'nextval(%'` と
    // 定義されており、autoIncrement=true な列は defaultValue の中身によらず必ず nextval 相当として
    // 除去できる。ここでは autoIncrement を起点にした一般化そのものを固定する。
    test('autoIncrement: true clears defaultValue regardless of the raw value given', () => {
        const snapshot = ColumnSnapshots.ofDatabaseColumn(
            baseDatabaseFacts({ autoIncrement: true, defaultValue: "nextval('user_id_seq'::regclass)" })
        );

        expect(snapshot.defaultValue).toBe('');
        expect(snapshot.autoIncrement).toBe(true);
    });

    test('autoIncrement: true with no default expression (GENERATED ALWAYS AS IDENTITY) still clears to empty', () => {
        const snapshot = ColumnSnapshots.ofDatabaseColumn(baseDatabaseFacts({ autoIncrement: true, defaultValue: null }));

        expect(snapshot.defaultValue).toBe('');
    });

    test('autoIncrement: false leaves an ordinary default value normalized as usual', () => {
        const snapshot = ColumnSnapshots.ofDatabaseColumn(baseDatabaseFacts({ autoIncrement: false, defaultValue: '0' }));

        expect(snapshot.defaultValue).toBe('0');
    });
});

describe('ColumnSnapshots.ofDatabaseColumn typeExpression', () => {
    test('a matched type is normalized through ColumnType.specifiedType()', () => {
        const snapshot = ColumnSnapshots.ofDatabaseColumn(baseDatabaseFacts({
            typeQuery: { columnType: 'NUMERIC', timezone: '', precision: 10, scale: 2, isArray: false },
            declaredExpression: 'numeric(10,2)'
        }));

        expect(snapshot.typeExpression).toBe('NUMERIC(10, 2)');
    });

    // .erd の ColumnType に引き当てられない型表記を DB が返した場合のフォールバック
    // (呼び出し側の postgres.ts / mysql-rows.ts が "type.unresolved" warning を出す設計)。
    test('an unresolvable type falls back to the declared expression, uppercased', () => {
        const snapshot = ColumnSnapshots.ofDatabaseColumn(baseDatabaseFacts({
            typeQuery: { columnType: 'NOT_A_REAL_TYPE', timezone: '', precision: null, scale: null, isArray: false },
            declaredExpression: 'not_a_real_type'
        }));

        expect(snapshot.typeExpression).toBe('NOT_A_REAL_TYPE');
    });
});

// DB 側のコメントはスナップショットの時点では常に実値を持つ。設計側との比較時に
// scope.withComment でゲートするのは schema-diff.ts の役割であり(schema-diff.test.ts で別途検証)、
// migrate-ddl は MySQL の MODIFY COLUMN が既存コメントを消さないよう、この実値を必要とする。
describe('ColumnSnapshots.ofDatabaseColumn comment', () => {
    test('the comment is always kept as the raw value from the database', () => {
        const snapshot = ColumnSnapshots.ofDatabaseColumn(baseDatabaseFacts({ comment: 'the id' }));

        expect(snapshot.comment).toBe('the id');
    });

    test('DB has no logical name, so it is always empty regardless of the comment', () => {
        const snapshot = ColumnSnapshots.ofDatabaseColumn(baseDatabaseFacts({ comment: 'the id' }));

        expect(snapshot.logicalName).toBe('');
    });
});

describe('ColumnSnapshots.ofDesignedColumn', () => {
    // SERIAL は foreignColumn に実体の型(integer)を持つ。型表現の解決と autoIncrement の決定は
    // 同じ isSerialAlias 判定に依存するため、両方が同時に決まることを固定する。
    test('a SERIAL column normalizes to its underlying integer type and is marked auto-increment together', () => {
        const columnShare = new ColumnShareModel({
            columnShareModelId: 'share-item-id', physicalName: 'item_id', logicalName: 'item_id',
            columnType: findColumnType('postgres', 'serial')
        });
        const columnModel = new SimpleColumnModel({
            columnModelId: 'col-item-id', columnShareModelId: columnShare.columnShareModelId,
            primaryKey: true, notNull: true
        });
        const facts: DesignedColumnFacts = {
            columnModel, columnShare, physicalName: 'item_id', logicalName: 'item_id', commentOption: NO_COMMENT
        };

        const snapshot = ColumnSnapshots.ofDesignedColumn(facts, FULL_SCOPE);

        expect(snapshot.typeExpression).toBe('INTEGER');
        expect(snapshot.autoIncrement).toBe(true);
    });

    test('withLogicalName: false clears the logical name', () => {
        const columnShare = new ColumnShareModel({
            columnShareModelId: 'share-name', physicalName: 'name', logicalName: 'ユーザ名',
            columnType: findColumnType('mysql', 'varchar (m)'), precision: '255'
        });
        const columnModel = new SimpleColumnModel({
            columnModelId: 'col-name', columnShareModelId: columnShare.columnShareModelId, notNull: true
        });
        const facts: DesignedColumnFacts = {
            columnModel, columnShare, physicalName: 'name', logicalName: 'ユーザ名', commentOption: NO_COMMENT
        };

        const snapshot = ColumnSnapshots.ofDesignedColumn(facts, { ...FULL_SCOPE, withLogicalName: false });

        expect(snapshot.logicalName).toBe('');
    });
});
