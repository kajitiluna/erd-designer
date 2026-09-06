import { describe, expect, test } from 'vitest';

import { SchemaComparison } from '~/models/schema/schema-diff';
import {
    ColumnSnapshot, ForeignKeySnapshot, IndexSnapshot, SchemaCompareScope, SchemaSnapshot, TableSnapshot,
    UniqueKeySnapshot
} from '~/models/schema/schema-snapshot';

const FULL_SCOPE: SchemaCompareScope = {
    withIndex: true, withForeignKey: true, withComment: true, withSchema: true, withLogicalName: true,
    commentStyle: 'with_description'
};

const baseColumn = (overrides: Partial<ColumnSnapshot> = {}): ColumnSnapshot => {
    return {
        columnName: 'id', logicalName: 'id', typeExpression: 'INT', unsigned: false,
        notNull: true, defaultValue: '', autoIncrement: false, comment: '',
        ...overrides
    };
};

const baseTable = (overrides: Partial<TableSnapshot> = {}): TableSnapshot => {
    return {
        schemaName: '', tableName: 'user', logicalName: '', comment: '',
        columns: [baseColumn()], primaryKeyColumnNames: ['id'],
        uniqueKeys: [], indexes: [], foreignKeys: [],
        ...overrides
    };
};

const baseSnapshot = (tables: TableSnapshot[], overrides: Partial<SchemaSnapshot> = {}): SchemaSnapshot => {
    return { databaseType: 'mysql', schemaNames: [], tables, warnings: [], ...overrides };
};

describe('compareSchemas (identical input)', () => {
    test('two identical snapshots produce no differences and no warnings', () => {
        const snapshot = baseSnapshot([baseTable()]);

        const diff = SchemaComparison.compare(snapshot, snapshot, FULL_SCOPE);

        expect(diff.differences).toEqual([]);
        expect(diff.warnings).toEqual([]);
    });
});

describe('compareSchemas (tables)', () => {
    test('a table present only in expected is reported as table.missing', () => {
        const expected = baseSnapshot([baseTable({ tableName: 'user' })]);
        const actual = baseSnapshot([]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([
            {
                category: 'table.missing', schemaName: '', tableName: 'user', targetName: 'user',
                expected: { state: 'present' }, actual: { state: 'absent' }
            }
        ]);
    });

    test('a table present only in actual is reported as table.unexpected', () => {
        const expected = baseSnapshot([]);
        const actual = baseSnapshot([baseTable({ tableName: 'order_item_backup' })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([{
            category: 'table.unexpected', schemaName: '', tableName: 'order_item_backup',
            targetName: 'order_item_backup', expected: { state: 'absent' }, actual: { state: 'present' }
        }]);
    });

    test('a table name differing only in case is matched, with a warning instead of a missing/unexpected pair', () => {
        const expected = baseSnapshot([baseTable({ tableName: 'User' })]);
        const actual = baseSnapshot([baseTable({ tableName: 'user' })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([]);
        expect(diff.warnings).toContainEqual(expect.objectContaining({ category: 'name.caseFolded' }));
    });

    test('withSchema: false matches tables by name alone, ignoring schemaName', () => {
        const expected = baseSnapshot([baseTable({ schemaName: 'shop_a' })]);
        const actual = baseSnapshot([baseTable({ schemaName: 'shop_b' })]);

        const diff = SchemaComparison.compare(expected, actual, { ...FULL_SCOPE, withSchema: false });

        expect(diff.differences).toEqual([]);
    });

    test('a table comment difference is reported only when withComment is true', () => {
        const expected = baseSnapshot([baseTable({ comment: 'ユーザ' })]);
        const actual = baseSnapshot([baseTable({ comment: '' })]);

        const withComment = SchemaComparison.compare(expected, actual, FULL_SCOPE);
        const withoutComment = SchemaComparison.compare(expected, actual, { ...FULL_SCOPE, withComment: false });

        expect(withComment.differences).toEqual([
            {
                category: 'table.comment', schemaName: '', tableName: 'user', targetName: 'user',
                expected: { state: 'value', text: 'ユーザ' }, actual: { state: 'blank' }
            }
        ]);
        expect(withoutComment.differences).toEqual([]);
    });
});

describe('compareSchemas (columns)', () => {
    test('a column present only in expected is reported as column.missing with its type summary', () => {
        const expected = baseSnapshot([baseTable({
            columns: [baseColumn(), baseColumn({ columnName: 'stock_quantity', typeExpression: 'INT', notNull: true })]
        })]);
        const actual = baseSnapshot([baseTable()]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toContainEqual({
            category: 'column.missing', schemaName: '', tableName: 'user', targetName: 'stock_quantity',
            expected: { state: 'value', text: 'INT NOT NULL' }, actual: { state: 'absent' }
        });
    });

    test('a column present only in actual is reported as column.unexpected', () => {
        const expected = baseSnapshot([baseTable()]);
        const actual = baseSnapshot([baseTable({
            columns: [baseColumn(), baseColumn({ columnName: 'legacy_flag', typeExpression: 'TINYINT', notNull: false })]
        })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toContainEqual({
            category: 'column.unexpected', schemaName: '', tableName: 'user', targetName: 'legacy_flag',
            expected: { state: 'absent' }, actual: { state: 'value', text: 'TINYINT' }
        });
    });

    test('a type change is reported as column.type', () => {
        const expected = baseSnapshot([baseTable({ columns: [baseColumn({ typeExpression: 'INT' })] })]);
        const actual = baseSnapshot([baseTable({ columns: [baseColumn({ typeExpression: 'SMALLINT' })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([
            {
                category: 'column.type', schemaName: '', tableName: 'user', targetName: 'id',
                expected: { state: 'value', text: 'INT' }, actual: { state: 'value', text: 'SMALLINT' }
            }
        ]);
    });

    test('an unsigned mismatch is folded into a single column.type difference', () => {
        const expected = baseSnapshot([baseTable({ columns: [baseColumn({ typeExpression: 'INT', unsigned: false })] })]);
        const actual = baseSnapshot([baseTable({ columns: [baseColumn({ typeExpression: 'INT', unsigned: true })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([
            {
                category: 'column.type', schemaName: '', tableName: 'user', targetName: 'id',
                expected: { state: 'value', text: 'INT' }, actual: { state: 'value', text: 'INT UNSIGNED' }
            }
        ]);
    });

    test('a nullability change is reported as column.nullability', () => {
        const expected = baseSnapshot([baseTable({ columns: [baseColumn({ notNull: false })] })]);
        const actual = baseSnapshot([baseTable({ columns: [baseColumn({ notNull: true })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([
            {
                category: 'column.nullability', schemaName: '', tableName: 'user', targetName: 'id',
                expected: { state: 'value', text: 'NULL' }, actual: { state: 'value', text: 'NOT NULL' }
            }
        ]);
    });

    test('a default value change is reported as column.default, with "-" for an empty value', () => {
        const expected = baseSnapshot([baseTable({ columns: [baseColumn({ defaultValue: '' })] })]);
        const actual = baseSnapshot([baseTable({ columns: [baseColumn({ defaultValue: '0' })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([
            {
                category: 'column.default', schemaName: '', tableName: 'user', targetName: 'id',
                expected: { state: 'blank' }, actual: { state: 'value', text: '0' }
            }
        ]);
    });

    test('an auto-increment change is reported as column.autoIncrement', () => {
        const expected = baseSnapshot([baseTable({ columns: [baseColumn({ autoIncrement: false })] })]);
        const actual = baseSnapshot([baseTable({ columns: [baseColumn({ autoIncrement: true })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([
            {
                category: 'column.autoIncrement', schemaName: '', tableName: 'user', targetName: 'id',
                expected: { state: 'blank' }, actual: { state: 'value', text: 'AUTO_INCREMENT' }
            }
        ]);
    });

    test('withLogicalName gates column.logicalName reporting', () => {
        const expected = baseSnapshot([baseTable({ columns: [baseColumn({ logicalName: 'Age' })] })]);
        const actual = baseSnapshot([baseTable({ columns: [baseColumn({ logicalName: 'Age (as of last birthday)' })] })]);

        const withLogicalName = SchemaComparison.compare(expected, actual, FULL_SCOPE);
        const withoutLogicalName = SchemaComparison.compare(expected, actual, { ...FULL_SCOPE, withLogicalName: false });

        expect(withLogicalName.differences).toEqual([{
            category: 'column.logicalName', schemaName: '', tableName: 'user', targetName: 'id',
            expected: { state: 'value', text: 'Age' }, actual: { state: 'value', text: 'Age (as of last birthday)' }
        }]);
        expect(withoutLogicalName.differences).toEqual([]);
    });

    test('commentStyle "logical_name" suppresses column.comment when column.logicalName already reports the same change', () => {
        const expected = baseSnapshot([baseTable({ columns: [baseColumn({ logicalName: 'Age', comment: 'Age' })] })]);
        const actual = baseSnapshot([baseTable({ columns: [baseColumn({ logicalName: 'Age2', comment: 'Age2' })] })]);

        const diff = SchemaComparison.compare(expected, actual, { ...FULL_SCOPE, commentStyle: 'logical_name' });

        expect(diff.differences).toEqual([
            {
                category: 'column.logicalName', schemaName: '', tableName: 'user', targetName: 'id',
                expected: { state: 'value', text: 'Age' }, actual: { state: 'value', text: 'Age2' }
            }
        ]);
    });

    test('the default commentStyle ("with_description") reports both column.logicalName and column.comment '
        + 'when both change simultaneously', () => {
        const expected = baseSnapshot([baseTable({
            columns: [baseColumn({ logicalName: 'Age', comment: 'Age: years since birth' })]
        })]);
        const actual = baseSnapshot([baseTable({
            columns: [baseColumn({ logicalName: 'Age2', comment: 'Age2: years since birth' })]
        })]);

        const diff = SchemaComparison.compare(expected, actual, { ...FULL_SCOPE, commentStyle: 'with_description' });

        expect(diff.differences).toEqual([
            {
                category: 'column.logicalName', schemaName: '', tableName: 'user', targetName: 'id',
                expected: { state: 'value', text: 'Age' }, actual: { state: 'value', text: 'Age2' }
            },
            {
                category: 'column.comment', schemaName: '', tableName: 'user', targetName: 'id',
                expected: { state: 'value', text: 'Age: years since birth' },
                actual: { state: 'value', text: 'Age2: years since birth' }
            }
        ]);
    });

    test('a column.comment difference is reported on its own when logicalName is unchanged', () => {
        const expected = baseSnapshot([baseTable({ columns: [baseColumn({ comment: 'before' })] })]);
        const actual = baseSnapshot([baseTable({ columns: [baseColumn({ comment: 'after' })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([
            {
                category: 'column.comment', schemaName: '', tableName: 'user', targetName: 'id',
                expected: { state: 'value', text: 'before' }, actual: { state: 'value', text: 'after' }
            }
        ]);
    });

    test('a column name differing only in case is matched, with a warning', () => {
        const expected = baseSnapshot([baseTable({ columns: [baseColumn({ columnName: 'UserName' })] })]);
        const actual = baseSnapshot([baseTable({ columns: [baseColumn({ columnName: 'username' })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([]);
        expect(diff.warnings).toContainEqual(expect.objectContaining({ category: 'name.caseFolded' }));
    });

    test('a column order difference produces a warning, not a difference', () => {
        const expected = baseSnapshot([baseTable({
            columns: [baseColumn({ columnName: 'id' }), baseColumn({ columnName: 'name' }), baseColumn({ columnName: 'age' })],
            primaryKeyColumnNames: ['id']
        })]);
        const actual = baseSnapshot([baseTable({
            columns: [baseColumn({ columnName: 'id' }), baseColumn({ columnName: 'age' }), baseColumn({ columnName: 'name' })],
            primaryKeyColumnNames: ['id']
        })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([]);
        expect(diff.warnings).toContainEqual(expect.objectContaining({ category: 'column.order' }));
    });
});

describe('compareSchemas (primary key)', () => {
    test('a primary key column list change is reported as primaryKey', () => {
        const expected = baseSnapshot([baseTable({ primaryKeyColumnNames: ['id'] })]);
        const actual = baseSnapshot([baseTable({ primaryKeyColumnNames: [] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([
            {
                category: 'primaryKey', schemaName: '', tableName: 'user', targetName: 'user',
                expected: { state: 'value', text: '(id)' }, actual: { state: 'blank' }
            }
        ]);
    });
});

describe('compareSchemas (unique keys)', () => {
    const uk = (overrides: Partial<UniqueKeySnapshot>): UniqueKeySnapshot => {
        return { constraintName: '', columnNames: [], ...overrides };
    };

    test('an inline unique key (no name on either side) matched by columns produces no difference', () => {
        const expected = baseSnapshot([baseTable({ uniqueKeys: [uk({ columnNames: ['email'] })] })]);
        const actual = baseSnapshot([baseTable({ uniqueKeys: [uk({ columnNames: ['email'] })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([]);
    });

    test('a named constraint matched by columns despite a differing name produces no difference', () => {
        const expected = baseSnapshot([baseTable({ uniqueKeys: [uk({ constraintName: 'uq_a', columnNames: ['email'] })] })]);
        const actual = baseSnapshot([baseTable({ uniqueKeys: [uk({ constraintName: 'uq_email_v2', columnNames: ['email'] })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([]);
    });

    test('a matched constraint name with a changed column list is reported as uniqueKey.columns', () => {
        const expected = baseSnapshot([baseTable({ uniqueKeys: [uk({ constraintName: 'uq_name', columnNames: ['name'] })] })]);
        const actual = baseSnapshot([baseTable({
            uniqueKeys: [uk({ constraintName: 'uq_name', columnNames: ['name', 'email'] })]
        })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([{
            category: 'uniqueKey.columns', schemaName: '', tableName: 'user', targetName: 'uq_name',
            expected: { state: 'value', text: '(name)' }, actual: { state: 'value', text: '(name, email)' }
        }]);
    });

    test('an unmatched expected unique key is reported as uniqueKey.missing', () => {
        const expected = baseSnapshot([baseTable({ uniqueKeys: [uk({ constraintName: 'uq_name', columnNames: ['name'] })] })]);
        const actual = baseSnapshot([baseTable({ uniqueKeys: [] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([{
            category: 'uniqueKey.missing', schemaName: '', tableName: 'user', targetName: 'uq_name',
            expected: { state: 'value', text: '(name)' }, actual: { state: 'absent' }
        }]);
    });

    test('an unmatched actual unique key is reported as uniqueKey.unexpected', () => {
        const expected = baseSnapshot([baseTable({ uniqueKeys: [] })]);
        const actual = baseSnapshot([baseTable({ uniqueKeys: [uk({ columnNames: ['email'] })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([{
            category: 'uniqueKey.unexpected', schemaName: '', tableName: 'user', targetName: '(email)',
            expected: { state: 'absent' }, actual: { state: 'value', text: '(email)' }
        }]);
    });
});

describe('compareSchemas (indexes)', () => {
    const idx = (overrides: Partial<IndexSnapshot>): IndexSnapshot => {
        return { indexName: 'idx_a', columnNames: [], indexOption: '', indexType: '', ...overrides };
    };

    test('an index matched by name and columns produces no difference', () => {
        const expected = baseSnapshot([baseTable({ indexes: [idx({ columnNames: ['name'] })] })]);
        const actual = baseSnapshot([baseTable({ indexes: [idx({ columnNames: ['name'] })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([]);
    });

    test('an index matched by columns despite a differing name produces no difference', () => {
        const expected = baseSnapshot([baseTable({ indexes: [idx({ indexName: 'idx_user__name', columnNames: ['name'] })] })]);
        const actual = baseSnapshot([baseTable({ indexes: [idx({ indexName: 'name_idx_auto', columnNames: ['name'] })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([]);
    });

    test('a name match with a changed column list is reported as index.columns', () => {
        const expected = baseSnapshot([baseTable({ indexes: [idx({ columnNames: ['name'] })] })]);
        const actual = baseSnapshot([baseTable({ indexes: [idx({ columnNames: ['name', 'age'] })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([{
            category: 'index.columns', schemaName: '', tableName: 'user', targetName: 'idx_a',
            expected: { state: 'value', text: '(name)' }, actual: { state: 'value', text: '(name, age)' }
        }]);
    });

    test('a name match with a changed option/type is reported as index.type', () => {
        const expected = baseSnapshot([baseTable({ indexes: [idx({ columnNames: ['name'], indexType: '' })] })]);
        const actual = baseSnapshot([baseTable({ indexes: [idx({ columnNames: ['name'], indexType: 'HASH' })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([{
            category: 'index.type', schemaName: '', tableName: 'user', targetName: 'idx_a',
            expected: { state: 'blank' }, actual: { state: 'value', text: 'HASH' }
        }]);
    });

    test('an unmatched expected index is reported as index.missing', () => {
        const expected = baseSnapshot([baseTable({ indexes: [idx({ columnNames: ['name'] })] })]);
        const actual = baseSnapshot([baseTable({ indexes: [] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([{
            category: 'index.missing', schemaName: '', tableName: 'user', targetName: 'idx_a',
            expected: { state: 'value', text: '(name)' }, actual: { state: 'absent' }
        }]);
    });

    test('an unmatched actual index is reported as index.unexpected', () => {
        const expected = baseSnapshot([baseTable({ indexes: [] })]);
        const actual = baseSnapshot([baseTable({ indexes: [idx({ columnNames: ['name'] })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([{
            category: 'index.unexpected', schemaName: '', tableName: 'user', targetName: 'idx_a',
            expected: { state: 'absent' }, actual: { state: 'value', text: '(name)' }
        }]);
    });

    test('withIndex has no bearing here (scope is applied at snapshot construction, not comparison)', () => {
        const expected = baseSnapshot([baseTable({ indexes: [idx({ columnNames: ['name'] })] })]);
        const actual = baseSnapshot([baseTable({ indexes: [] })]);

        const diff = SchemaComparison.compare(expected, actual, { ...FULL_SCOPE, withIndex: false });

        expect(diff.differences).toEqual([{
            category: 'index.missing', schemaName: '', tableName: 'user', targetName: 'idx_a',
            expected: { state: 'value', text: '(name)' }, actual: { state: 'absent' }
        }]);
    });
});

describe('compareSchemas (foreign keys)', () => {
    const fk = (overrides: Partial<ForeignKeySnapshot>): ForeignKeySnapshot => {
        return {
            constraintName: '', columnNames: ['shop_id'], parentSchemaName: '', parentTableName: 'shop',
            parentColumnNames: ['id'], onUpdate: 'RESTRICT', onDelete: 'RESTRICT', ...overrides
        };
    };

    test('a foreign key matched purely by column/reference produces no difference, even with differing constraint names', () => {
        const expected = baseSnapshot([baseTable({ tableName: 'item', foreignKeys: [fk({ constraintName: '' })] })]);
        const actual = baseSnapshot([baseTable({ tableName: 'item', foreignKeys: [fk({ constraintName: 'item_ibfk_1' })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([]);
    });

    test('a matched foreign key with a changed reference action is reported as foreignKey.reference', () => {
        const expected = baseSnapshot([baseTable({ tableName: 'item', foreignKeys: [fk({ onDelete: 'RESTRICT' })] })]);
        const actual = baseSnapshot([baseTable({ tableName: 'item', foreignKeys: [fk({ onDelete: 'CASCADE' })] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([{
            category: 'foreignKey.reference', schemaName: '', tableName: 'item', targetName: 'shop_id',
            expected: { state: 'value', text: 'ON UPDATE RESTRICT ON DELETE RESTRICT' },
            actual: { state: 'value', text: 'ON UPDATE RESTRICT ON DELETE CASCADE' }
        }]);
    });

    test('an unmatched expected foreign key is reported as foreignKey.missing', () => {
        const expected = baseSnapshot([baseTable({ tableName: 'item', foreignKeys: [fk({})] })]);
        const actual = baseSnapshot([baseTable({ tableName: 'item', foreignKeys: [] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([{
            category: 'foreignKey.missing', schemaName: '', tableName: 'item', targetName: 'shop_id',
            expected: { state: 'value', text: 'shop (id)' }, actual: { state: 'absent' }
        }]);
    });

    test('an unmatched actual foreign key is reported as foreignKey.unexpected', () => {
        const expected = baseSnapshot([baseTable({ tableName: 'item', foreignKeys: [] })]);
        const actual = baseSnapshot([baseTable({ tableName: 'item', foreignKeys: [fk({})] })]);

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([{
            category: 'foreignKey.unexpected', schemaName: '', tableName: 'item', targetName: 'shop_id',
            expected: { state: 'absent' }, actual: { state: 'value', text: 'shop (id)' }
        }]);
    });

    test('withForeignKey has no bearing here (scope is applied at snapshot construction, not comparison)', () => {
        const expected = baseSnapshot([baseTable({ tableName: 'item', foreignKeys: [fk({})] })]);
        const actual = baseSnapshot([baseTable({ tableName: 'item', foreignKeys: [] })]);

        const diff = SchemaComparison.compare(expected, actual, { ...FULL_SCOPE, withForeignKey: false });

        expect(diff.differences).toEqual([{
            category: 'foreignKey.missing', schemaName: '', tableName: 'item', targetName: 'shop_id',
            expected: { state: 'value', text: 'shop (id)' }, actual: { state: 'absent' }
        }]);
    });
});

describe('compareSchemas (schemas)', () => {
    test('a schema present only in expected is reported as schema.missing', () => {
        const expected = baseSnapshot([], { schemaNames: ['shop'] });
        const actual = baseSnapshot([], { schemaNames: [] });

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([
            {
                category: 'schema.missing', schemaName: 'shop', tableName: '', targetName: 'shop',
                expected: { state: 'present' }, actual: { state: 'absent' }
            }
        ]);
    });

    test('a schema present only in actual is reported as schema.unexpected', () => {
        const expected = baseSnapshot([], { schemaNames: [] });
        const actual = baseSnapshot([], { schemaNames: ['legacy'] });

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.differences).toEqual([
            {
                category: 'schema.unexpected', schemaName: 'legacy', tableName: '', targetName: 'legacy',
                expected: { state: 'absent' }, actual: { state: 'present' }
            }
        ]);
    });
});

describe('compareSchemas (warning propagation)', () => {
    test('warnings already attached to either snapshot are carried through to the diff', () => {
        const expected = baseSnapshot([baseTable()], {
            warnings: [{ category: 'struct.skipped', schemaName: '', tableName: 'user', message: 'design side warning' }]
        });
        const actual = baseSnapshot([baseTable()], {
            warnings: [{ category: 'zeroFill.ignored', schemaName: '', tableName: 'user', message: 'database side warning' }]
        });

        const diff = SchemaComparison.compare(expected, actual, FULL_SCOPE);

        expect(diff.warnings).toContainEqual(expect.objectContaining({ message: 'design side warning' }));
        expect(diff.warnings).toContainEqual(expect.objectContaining({ message: 'database side warning' }));
    });
});
