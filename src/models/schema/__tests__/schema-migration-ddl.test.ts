import { describe, expect, test } from 'vitest';

import { DestructivePolicy, MigrationDdlBuilder } from '~/models/schema/schema-migration-ddl';
import {
    ColumnSnapshot, ForeignKeySnapshot, SchemaSnapshot, TableSnapshot, UniqueKeySnapshot
} from '~/models/schema/schema-snapshot';
import { DatabaseType } from '~/models/database/DatabaseType';

const baseColumn = (overrides: Partial<ColumnSnapshot> = {}): ColumnSnapshot => {
    return {
        columnName: 'id', logicalName: '', typeExpression: 'INT', unsigned: false,
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

const snapshotOf = (databaseType: DatabaseType, tables: TableSnapshot[]): SchemaSnapshot => {
    return { databaseType, schemaNames: [], tables, warnings: [] };
};

const build = (
    databaseType: DatabaseType, expectedTables: TableSnapshot[], actualTables: TableSnapshot[],
    destructivePolicy: DestructivePolicy = 'commentOut', withComment: boolean = true
) => {
    return MigrationDdlBuilder.build({
        expected: snapshotOf(databaseType, expectedTables), actual: snapshotOf(databaseType, actualTables),
        databaseType, destructivePolicy, withComment
    });
};

describe('buildMigrationDdl (MySQL — add column)', () => {
    test('an added column with a DEFAULT is placed AFTER its preceding column', () => {
        const expectedTable = baseTable({
            columns: [baseColumn({ columnName: 'id' }), baseColumn({ columnName: 'name', typeExpression: 'VARCHAR(255)', defaultValue: 'X' })]
        });
        const actualTable = baseTable({ columns: [baseColumn({ columnName: 'id' })] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements).toHaveLength(1);
        expect(result.statements[0]).toMatchObject({ kind: 'addColumn' });
        expect(result.statements[0].sql).toBe(
            "ALTER TABLE `user` ADD COLUMN `name` VARCHAR(255) NOT NULL DEFAULT 'X' AFTER `id`;"
        );
    });

    test('a column added at the very front uses FIRST', () => {
        const expectedTable = baseTable({
            columns: [baseColumn({ columnName: 'tag', notNull: false, defaultValue: 'X' }), baseColumn({ columnName: 'id' })]
        });
        const actualTable = baseTable({ columns: [baseColumn({ columnName: 'id' })] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements[0].sql).toContain('FIRST;');
    });

    test('a NOT NULL column with no DEFAULT and no auto-increment is unsupported, not silently added', () => {
        const expectedTable = baseTable({
            columns: [baseColumn({ columnName: 'id' }), baseColumn({ columnName: 'required_flag', notNull: true, defaultValue: '' })]
        });
        const actualTable = baseTable({ columns: [baseColumn({ columnName: 'id' })] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements).toHaveLength(1);
        expect(result.statements[0].kind).toBe('unsupported');
        expect(result.unsupportedCount).toBe(1);
    });

    test('an auto-increment column includes AUTO_INCREMENT, and a commented column includes COMMENT', () => {
        const expectedTable = baseTable({
            columns: [baseColumn({ columnName: 'id', autoIncrement: true, comment: 'primary key' })]
        });
        const actualTable = baseTable({ columns: [] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements[0].sql).toContain('AUTO_INCREMENT');
        expect(result.statements[0].sql).toContain("COMMENT 'primary key'");
    });

    test('unsigned is rendered as a type suffix', () => {
        const expectedTable = baseTable({ columns: [baseColumn({ typeExpression: 'INT', unsigned: true, notNull: false })] });
        const actualTable = baseTable({ columns: [] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements[0].sql).toContain('INT UNSIGNED');
    });
});

describe('buildMigrationDdl (MySQL — modify column)', () => {
    test('any attribute change re-specifies the column in full via MODIFY COLUMN', () => {
        const expectedTable = baseTable({ columns: [baseColumn({ typeExpression: 'INT', notNull: true })] });
        const actualTable = baseTable({ columns: [baseColumn({ typeExpression: 'SMALLINT', notNull: false })] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements).toHaveLength(1);
        expect(result.statements[0]).toMatchObject({ kind: 'modifyColumn' });
        expect(result.statements[0].sql).toBe('ALTER TABLE `user` MODIFY COLUMN `id` INT NOT NULL;');
    });

    test('identical columns produce no statement at all', () => {
        const table = baseTable();

        const result = build('mysql', [table], [table]);

        expect(result.statements).toEqual([]);
    });
});

describe('buildMigrationDdl (PostgreSQL — modify column)', () => {
    test('a type change emits ALTER COLUMN TYPE with an explicit USING cast', () => {
        const expectedTable = baseTable({ columns: [baseColumn({ typeExpression: 'BIGINT' })] });
        const actualTable = baseTable({ columns: [baseColumn({ typeExpression: 'INTEGER' })] });

        const result = build('postgres', [expectedTable], [actualTable]);

        expect(result.statements).toEqual([{
            kind: 'modifyColumn', schemaName: '', tableName: 'user',
            sql: 'ALTER TABLE "user" ALTER COLUMN "id" TYPE BIGINT USING "id"::BIGINT;'
        }]);
    });

    test('a nullability change alone emits SET NOT NULL, without touching type or default', () => {
        const expectedTable = baseTable({ columns: [baseColumn({ notNull: true })] });
        const actualTable = baseTable({ columns: [baseColumn({ notNull: false })] });

        const result = build('postgres', [expectedTable], [actualTable]);

        expect(result.statements).toEqual([{
            kind: 'modifyColumn', schemaName: '', tableName: 'user', sql: 'ALTER TABLE "user" ALTER COLUMN "id" SET NOT NULL;'
        }]);
    });

    test('a comment change emits a separate COMMENT ON COLUMN statement', () => {
        const expectedTable = baseTable({ columns: [baseColumn({ comment: 'the id' })] });
        const actualTable = baseTable({ columns: [baseColumn({ comment: '' })] });

        const result = build('postgres', [expectedTable], [actualTable]);

        expect(result.statements).toEqual([{
            kind: 'comment', schemaName: '', tableName: 'user', sql: "COMMENT ON COLUMN \"user\".\"id\" IS 'the id';"
        }]);
    });

    test('an auto-increment change on an existing column is unsupported, not silently generated', () => {
        const expectedTable = baseTable({ columns: [baseColumn({ autoIncrement: true })] });
        const actualTable = baseTable({ columns: [baseColumn({ autoIncrement: false })] });

        const result = build('postgres', [expectedTable], [actualTable]);

        expect(result.statements).toHaveLength(1);
        expect(result.statements[0].kind).toBe('unsupported');
    });

    test('a new column appends a note that PostgreSQL cannot control insertion position', () => {
        const expectedTable = baseTable({ columns: [baseColumn({ columnName: 'id' }), baseColumn({ columnName: 'name', notNull: false })] });
        const actualTable = baseTable({ columns: [baseColumn({ columnName: 'id' })] });

        const result = build('postgres', [expectedTable], [actualTable]);

        expect(result.statements[0].sql).toContain('PostgreSQL appends new columns at the end');
    });
});

describe('buildMigrationDdl (drop column)', () => {
    test('a column only in actual is dropped, and commented out by default', () => {
        const expectedTable = baseTable({ columns: [baseColumn({ columnName: 'id' })] });
        const actualTable = baseTable({ columns: [baseColumn({ columnName: 'id' }), baseColumn({ columnName: 'legacy' })] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements).toHaveLength(1);
        expect(result.statements[0].kind).toBe('dropColumn');
        expect(result.statements[0].sql).toContain('-- ALTER TABLE `user` DROP COLUMN `legacy`;');
        expect(result.destructiveCount).toBe(1);
    });

    test('--allow-destructive (policy "emit") produces executable SQL without comments', () => {
        const expectedTable = baseTable({ columns: [baseColumn({ columnName: 'id' })] });
        const actualTable = baseTable({ columns: [baseColumn({ columnName: 'id' }), baseColumn({ columnName: 'legacy' })] });

        const result = build('mysql', [expectedTable], [actualTable], 'emit');

        expect(result.statements[0].sql).toBe('ALTER TABLE `user` DROP COLUMN `legacy`;');
    });
});

describe('buildMigrationDdl (unique keys, indexes, foreign keys — matched by column set)', () => {
    const uniqueKey = (columnNames: string[], constraintName: string = ''): UniqueKeySnapshot => {
        return { constraintName, columnNames };
    };
    const foreignKey = (columnNames: string[], constraintName: string = ''): ForeignKeySnapshot => {
        return {
            constraintName, columnNames, parentSchemaName: '', parentTableName: 'shop',
            parentColumnNames: ['id'], onUpdate: 'RESTRICT', onDelete: 'RESTRICT'
        };
    };

    test('a missing unique key is created; MySQL uses ADD UNIQUE', () => {
        const expectedTable = baseTable({ uniqueKeys: [uniqueKey(['id'])] });
        const actualTable = baseTable({ uniqueKeys: [] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements).toEqual([{ kind: 'createUnique', schemaName: '', tableName: 'user', sql: 'ALTER TABLE `user` ADD UNIQUE (`id`);' }]);
    });

    test('a unique key present only in actual is dropped by name; MySQL uses DROP INDEX', () => {
        const expectedTable = baseTable({ uniqueKeys: [] });
        const actualTable = baseTable({ uniqueKeys: [uniqueKey(['email'], 'uq_email')] });

        const result = build('mysql', [expectedTable], [actualTable], 'emit');

        expect(result.statements).toEqual([{
            kind: 'dropUnique', schemaName: '', tableName: 'user', sql: 'ALTER TABLE `user` DROP INDEX `uq_email`;'
        }]);
    });

    test('dropping an unnamed unique key is unsupported, since there is no name to DROP', () => {
        const expectedTable = baseTable({ uniqueKeys: [] });
        const actualTable = baseTable({ uniqueKeys: [uniqueKey(['email'])] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements[0].kind).toBe('unsupported');
    });

    test('a unique key matched by column set produces no statement, even if constraint names differ', () => {
        const expectedTable = baseTable({ uniqueKeys: [uniqueKey(['email'], 'uq_a')] });
        const actualTable = baseTable({ uniqueKeys: [uniqueKey(['email'], 'uq_b')] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements).toEqual([]);
    });

    test('an index is created with USING placed after the index name for MySQL', () => {
        const expectedTable = baseTable({ indexes: [{ indexName: 'idx_name', columnNames: ['id'], indexOption: '', indexType: 'BTREE' }] });
        const actualTable = baseTable({ indexes: [] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements[0].sql).toBe('CREATE INDEX `idx_name` USING BTREE ON `user` (`id`);');
    });

    test('an index is created with USING placed after the table name for PostgreSQL', () => {
        const expectedTable = baseTable({ indexes: [{ indexName: 'idx_name', columnNames: ['id'], indexOption: '', indexType: 'BTREE' }] });
        const actualTable = baseTable({ indexes: [] });

        const result = build('postgres', [expectedTable], [actualTable]);

        expect(result.statements[0].sql).toBe('CREATE INDEX "idx_name" ON "user" USING BTREE ("id");');
    });

    test('a missing foreign key is added without a constraint name, matching create-ddl.ts', () => {
        const expectedTable = baseTable({ tableName: 'item', foreignKeys: [foreignKey(['shop_id'])] });
        const actualTable = baseTable({ tableName: 'item', foreignKeys: [] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements[0].sql).toBe(
            'ALTER TABLE `item`\n    ADD FOREIGN KEY (`shop_id`)\n    REFERENCES `shop` (`id`)\n    ON UPDATE RESTRICT\n    ON DELETE RESTRICT;'
        );
    });

    test('a foreign key matched by column/reference produces no statement, even with differing constraint names', () => {
        const expectedTable = baseTable({ tableName: 'item', foreignKeys: [foreignKey(['shop_id'], '')] });
        const actualTable = baseTable({ tableName: 'item', foreignKeys: [foreignKey(['shop_id'], 'item_ibfk_1')] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements).toEqual([]);
    });

    test('dropping an unnamed foreign key is unsupported', () => {
        const expectedTable = baseTable({ tableName: 'item', foreignKeys: [] });
        const actualTable = baseTable({ tableName: 'item', foreignKeys: [foreignKey(['shop_id'], '')] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements[0].kind).toBe('unsupported');
    });
});

describe('buildMigrationDdl (foreign key / index matching considers attributes beyond columns)', () => {
    const foreignKey = (overrides: Partial<ForeignKeySnapshot> = {}): ForeignKeySnapshot => {
        return {
            constraintName: '', columnNames: ['shop_id'], parentSchemaName: '', parentTableName: 'shop',
            parentColumnNames: ['id'], onUpdate: 'RESTRICT', onDelete: 'RESTRICT', ...overrides
        };
    };

    test('a change to onDelete alone (same columns) produces DROP+ADD FOREIGN KEY, not a silent no-op', () => {
        const expectedTable = baseTable({ tableName: 'item', foreignKeys: [foreignKey({ onDelete: 'CASCADE' })] });
        const actualTable = baseTable({
            tableName: 'item', foreignKeys: [foreignKey({ constraintName: 'item_ibfk_1', onDelete: 'RESTRICT' })]
        });

        const result = build('mysql', [expectedTable], [actualTable], 'emit');

        const kinds = result.statements.map(statement => statement.kind);
        expect(kinds).toContain('addForeignKey');
        expect(kinds).toContain('dropForeignKey');
    });

    test('a change to index type alone (same columns) produces DROP+CREATE INDEX, not a silent no-op', () => {
        const expectedTable = baseTable({
            indexes: [{ indexName: 'idx_name', columnNames: ['id'], indexOption: '', indexType: 'HASH' }]
        });
        const actualTable = baseTable({
            indexes: [{ indexName: 'idx_name', columnNames: ['id'], indexOption: '', indexType: 'BTREE' }]
        });

        const result = build('mysql', [expectedTable], [actualTable], 'emit');

        const kinds = result.statements.map(statement => statement.kind);
        expect(kinds).toContain('createIndex');
        expect(kinds).toContain('dropIndex');
    });
});

describe('buildMigrationDdl (multi-schema and case-fold table matching)', () => {
    test('app.users and reporting.users are treated as distinct tables, never paired across schemas', () => {
        const appUsers = baseTable({ schemaName: 'app', tableName: 'users' });
        const reportingUsers = baseTable({
            schemaName: 'reporting', tableName: 'users',
            columns: [baseColumn({ columnName: 'id' }), baseColumn({ columnName: 'extra' })]
        });

        const result = build('postgres', [appUsers], [reportingUsers], 'emit');

        const kinds = result.statements.map(statement => statement.kind);
        expect(kinds).toContain('unsupported');
        expect(kinds).toContain('dropTable');
        expect(result.statements.some(statement => statement.sql.includes('ALTER TABLE'))).toBe(false);
    });

    test('a table name differing only in case is kept as one table and never produces DROP TABLE', () => {
        const expectedTable = baseTable({ tableName: 'User' });
        const actualTable = baseTable({ tableName: 'user' });

        const result = build('mysql', [expectedTable], [actualTable], 'emit');

        expect(result.statements).toHaveLength(1);
        expect(result.statements[0].kind).toBe('unsupported');
    });
});

describe('buildMigrationDdl (whole tables)', () => {
    test('a table missing entirely from actual is reported as unsupported, not auto-generated', () => {
        const result = build('mysql', [baseTable({ tableName: 'new_table' })], []);

        expect(result.statements).toHaveLength(1);
        expect(result.statements[0].kind).toBe('unsupported');
        expect(result.statements[0].sql).toContain('export-ddl');
    });

    test('a table only in actual is dropped', () => {
        const result = build('mysql', [], [baseTable({ tableName: 'old_table' })], 'emit');

        expect(result.statements).toEqual([{ kind: 'dropTable', schemaName: '', tableName: 'old_table', sql: 'DROP TABLE `old_table`;' }]);
    });
});

describe('buildMigrationDdl (schema-qualified tables — PostgreSQL)', () => {
    test('ADD COLUMN / MODIFY / DROP TABLE / DROP INDEX / ADD FOREIGN KEY are all schema-qualified', () => {
        const expectedTable = baseTable({
            schemaName: 'app', tableName: 'users',
            columns: [
                baseColumn({ columnName: 'id' }),
                baseColumn({ columnName: 'name', typeExpression: 'VARCHAR(255)', notNull: false })
            ]
        });
        const actualTable = baseTable({ schemaName: 'app', tableName: 'users', columns: [baseColumn({ columnName: 'id' })] });

        const result = build('postgres', [expectedTable], [actualTable]);

        expect(result.statements[0].sql).toContain('ALTER TABLE "app"."users" ADD COLUMN "name"');
    });

    test('MODIFY, DROP TABLE and DROP INDEX are all schema-qualified', () => {
        const expectedTable = baseTable({
            schemaName: 'app', tableName: 'users', columns: [baseColumn({ typeExpression: 'BIGINT' })]
        });
        const actualTable = baseTable({
            schemaName: 'app', tableName: 'users', columns: [baseColumn({ typeExpression: 'INTEGER' })]
        });

        const modifyResult = build('postgres', [expectedTable], [actualTable]);
        expect(modifyResult.statements[0].sql).toContain('ALTER TABLE "app"."users" ALTER COLUMN');

        const dropTableResult = build('postgres', [], [baseTable({ schemaName: 'app', tableName: 'users' })], 'emit');
        expect(dropTableResult.statements[0].sql).toBe('DROP TABLE "app"."users";');

        const tableWithIndex = baseTable({ schemaName: 'app', tableName: 'users' });
        const tableWithoutIndex = baseTable({
            schemaName: 'app', tableName: 'users',
            indexes: [{ indexName: 'idx_name', columnNames: ['id'], indexOption: '', indexType: '' }]
        });
        const dropIndexResult = build('postgres', [tableWithIndex], [tableWithoutIndex], 'emit');
        expect(dropIndexResult.statements[0].sql).toBe('DROP INDEX "app"."idx_name";');
    });

    test('ADD FOREIGN KEY qualifies the parent table by its own schema, independent of the child table', () => {
        const foreignKey: ForeignKeySnapshot = {
            constraintName: '', columnNames: ['shop_id'], parentSchemaName: 'app', parentTableName: 'shop',
            parentColumnNames: ['id'], onUpdate: 'RESTRICT', onDelete: 'RESTRICT'
        };
        const expectedTable = baseTable({ schemaName: 'app', tableName: 'item', foreignKeys: [foreignKey] });
        const actualTable = baseTable({ schemaName: 'app', tableName: 'item', foreignKeys: [] });

        const result = build('postgres', [expectedTable], [actualTable]);

        expect(result.statements[0].sql).toContain('ALTER TABLE "app"."item"');
        expect(result.statements[0].sql).toContain('REFERENCES "app"."shop" ("id")');
    });

    test('CREATE INDEX leaves the index name unqualified, qualifying only the table name', () => {
        const expectedTable = baseTable({
            schemaName: 'app', tableName: 'users',
            indexes: [{ indexName: 'idx_name', columnNames: ['id'], indexOption: '', indexType: '' }]
        });
        const actualTable = baseTable({ schemaName: 'app', tableName: 'users', indexes: [] });

        const result = build('postgres', [expectedTable], [actualTable]);

        expect(result.statements[0].sql).toBe('CREATE INDEX "idx_name" ON "app"."users" ("id");');
    });
});

describe('buildMigrationDdl (AFTER must reference a column that survives the migration)', () => {
    test('a column after an unsupported (not generated) new column falls back to the last surviving column', () => {
        const expectedTable = baseTable({
            columns: [
                baseColumn({ columnName: 'id' }),
                baseColumn({ columnName: 'a', notNull: true, defaultValue: '' }),
                baseColumn({ columnName: 'b', notNull: false })
            ]
        });
        const actualTable = baseTable({ columns: [baseColumn({ columnName: 'id' })] });

        const result = build('mysql', [expectedTable], [actualTable]);

        const bStatement = result.statements.find(statement => statement.sql.includes('`b`'));
        expect(bStatement?.sql).toContain('AFTER `id`');
        expect(result.unsupportedCount).toBe(1);
    });

    test('when the first new column is unsupported, the next new column uses FIRST', () => {
        const expectedTable = baseTable({
            columns: [
                baseColumn({ columnName: 'a', notNull: true, defaultValue: '' }),
                baseColumn({ columnName: 'b', notNull: false })
            ]
        });
        const actualTable = baseTable({ columns: [] });

        const result = build('mysql', [expectedTable], [actualTable]);

        const bStatement = result.statements.find(statement => statement.sql.includes('`b`'));
        expect(bStatement?.sql).toContain('FIRST;');
    });
});

describe('buildMigrationDdl (FULLTEXT/SPATIAL index options — MySQL)', () => {
    test('indexOption "FULLTEXT" produces CREATE FULLTEXT INDEX', () => {
        const expectedTable = baseTable({
            indexes: [{ indexName: 'idx_body', columnNames: ['body'], indexOption: 'FULLTEXT', indexType: '' }]
        });
        const actualTable = baseTable({ indexes: [] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements[0].sql).toBe('CREATE FULLTEXT INDEX `idx_body` ON `user` (`body`);');
    });

    test('indexOption "SPATIAL" produces CREATE SPATIAL INDEX', () => {
        const expectedTable = baseTable({
            indexes: [{ indexName: 'idx_geo', columnNames: ['geo'], indexOption: 'SPATIAL', indexType: '' }]
        });
        const actualTable = baseTable({ indexes: [] });

        const result = build('mysql', [expectedTable], [actualTable]);

        expect(result.statements[0].sql).toBe('CREATE SPATIAL INDEX `idx_geo` ON `user` (`geo`);');
    });
});

describe('buildMigrationDdl (withComment — MySQL MODIFY COLUMN preserves existing comments)', () => {
    test('withComment: false re-specifies the actual (DB) comment instead of dropping it', () => {
        const expectedTable = baseTable({ columns: [baseColumn({ typeExpression: 'BIGINT', comment: 'new comment' })] });
        const actualTable = baseTable({ columns: [baseColumn({ typeExpression: 'INT', comment: 'old comment' })] });

        const result = build('mysql', [expectedTable], [actualTable], 'commentOut', false);

        expect(result.statements[0].sql).toBe("ALTER TABLE `user` MODIFY COLUMN `id` BIGINT NOT NULL COMMENT 'old comment';");
    });

    test('withComment: true updates the comment to the expected (design) value', () => {
        const expectedTable = baseTable({ columns: [baseColumn({ typeExpression: 'BIGINT', comment: 'new comment' })] });
        const actualTable = baseTable({ columns: [baseColumn({ typeExpression: 'INT', comment: 'old comment' })] });

        const result = build('mysql', [expectedTable], [actualTable], 'commentOut', true);

        expect(result.statements[0].sql).toBe("ALTER TABLE `user` MODIFY COLUMN `id` BIGINT NOT NULL COMMENT 'new comment';");
    });

    test('withComment: false does not treat a comment-only difference as a change', () => {
        const expectedTable = baseTable({ columns: [baseColumn({ comment: 'new comment' })] });
        const actualTable = baseTable({ columns: [baseColumn({ comment: 'old comment' })] });

        const result = build('mysql', [expectedTable], [actualTable], 'commentOut', false);

        expect(result.statements).toEqual([]);
    });

    test('withComment: false on a new column omits the COMMENT clause entirely', () => {
        const expectedTable = baseTable({
            columns: [baseColumn({ columnName: 'id' }), baseColumn({ columnName: 'name', notNull: false, comment: 'the name' })]
        });
        const actualTable = baseTable({ columns: [baseColumn({ columnName: 'id' })] });

        const result = build('mysql', [expectedTable], [actualTable], 'commentOut', false);

        expect(result.statements[0].sql).not.toContain('COMMENT');
    });

    test('PostgreSQL does not emit COMMENT ON when withComment is false', () => {
        const expectedTable = baseTable({ columns: [baseColumn({ comment: 'the id' })] });
        const actualTable = baseTable({ columns: [baseColumn({ comment: '' })] });

        const result = build('postgres', [expectedTable], [actualTable], 'commentOut', false);

        expect(result.statements).toEqual([]);
    });
});

describe('buildMigrationDdl (unsupported dialect)', () => {
    test('a database type with no dialect implemented returns exactly one unsupported statement', () => {
        const result = build('sqlite', [baseTable()], [baseTable({ columns: [] })]);

        expect(result.statements).toHaveLength(1);
        expect(result.statements[0].kind).toBe('unsupported');
        expect(result.unsupportedCount).toBe(1);
        expect(result.destructiveCount).toBe(0);
    });
});

describe('buildMigrationDdl (statement ordering and counts)', () => {
    test('additive statements precede destructive ones, and unsupported/destructive counts are accurate', () => {
        const expectedTable = baseTable({
            tableName: 'item',
            columns: [baseColumn({ columnName: 'id' }), baseColumn({ columnName: 'new_col', notNull: false })]
        });
        const actualTable = baseTable({
            tableName: 'item',
            columns: [baseColumn({ columnName: 'id' }), baseColumn({ columnName: 'legacy_col' })]
        });

        const result = build('mysql', [expectedTable], [actualTable]);

        const kinds = result.statements.map(statement => statement.kind);
        expect(kinds).toEqual(['addColumn', 'dropColumn']);
        expect(result.destructiveCount).toBe(1);
        expect(result.unsupportedCount).toBe(0);
    });
});
