import { describe, expect, test } from 'vitest';

import TableSizeEstimator from '~/agent-tools/TableSizeEstimator';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import DisplayColumnStyle from '~/models/DisplayColumnStyle';
import DisplayNameStyle from '~/models/DisplayNameStyle';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import TableViewModel from '~/models/TableViewModel';
import ColumnEntry from '~/models/database/ColumnEntry';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import StructColumnModel from '~/models/database/StructColumnModel';
import StructColumnShareModel from '~/models/database/StructColumnShareModel';
import TableIndexModel from '~/models/database/TableIndexModel';
import TableModel from '~/models/database/TableModel';
import TableUniqueKeysModel from '~/models/database/TableUniqueKeysModel';
import { findDatabaseColumns } from '~/models/database/columns';

const TEST_COLORS = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 })
};

const findColumnType = (typeName: string) => {
    const columnType = findDatabaseColumns('bigquery').find(candidate => candidate.name === typeName);
    if (columnType == null) {
        throw new Error(`column type not found: ${typeName}`);
    }
    return columnType;
};

const STRING_TYPE = findColumnType('string');

const LONG_TYPE = findColumnType('bignumeric');

type ColumnSpec = { id: string, name: string, longType?: boolean };

type BuiltDocument = { erdDocument: ErdDocument, tableView: TableViewModel };

const initColumnModels = (specs: ColumnSpec[]) => {
    const shareModels = specs.map(spec => new ColumnShareModel({
        columnShareModelId: `share-${spec.id}`, physicalName: spec.name, logicalName: '',
        columnType: (spec.longType === true) ? LONG_TYPE : STRING_TYPE
    }));
    const columnModels = specs.map(spec => new SimpleColumnModel({
        columnModelId: spec.id, columnShareModelId: `share-${spec.id}`
    }));
    return { shareModels, columnModels };
};

const toEntries = (ids: string[]): ColumnEntry[] => {
    return ids.map(id => { return { modelType: 'single', columnModelId: id }; }) as ColumnEntry[];
};

const buildDocument = (args: {
    tableName?: string, columns: ColumnSpec[], displayColumnStyle?: DisplayColumnStyle,
    structMember?: ColumnSpec, uniqueKeyCount?: number, indexCount?: number
}): BuiltDocument => {
    const { shareModels, columnModels } = initColumnModels(
        args.structMember != null ? [args.structMember] : args.columns
    );
    const topColumnIds = args.structMember != null ? ['wrapper'] : args.columns.map(column => column.id);
    const wrapper = new StructColumnModel({ columnModelId: 'wrapper', structShareModelId: 'struct-s', physicalName: 's' });
    const structShare = new StructColumnShareModel({
        structShareModelId: 'struct-s', physicalName: 's',
        columnEntries: toEntries(args.structMember != null ? [args.structMember.id] : [])
    });

    const uniqueKeysModels = Array.from({ length: args.uniqueKeyCount ?? 0 }, (_, index) => {
        return new TableUniqueKeysModel({ tableUniqueKeysModelId: `uk-${index}`, uniqueKeysColumnModels: [] });
    });
    const tableIndexModels = Array.from({ length: args.indexCount ?? 0 }, (_, index) => {
        return new TableIndexModel({ tableIndexModelId: `ix-${index}`, physicalName: `ix_${index}`, indexColumnModels: [] });
    });
    const tableModel = new TableModel({
        tableModelId: 'table-1', physicalName: args.tableName ?? 't', columnEntries: toEntries(topColumnIds),
        uniqueKeysModels, tableIndexModels
    });
    const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });
    const erdSettingModel = ErdSettingModel.create('estimator').update({
        displayNameStyle: DisplayNameStyle.PHYSICAL,
        displayColumnStyle: args.displayColumnStyle ?? DisplayColumnStyle.ALL
    });

    const erdDocument = ErdDocument.create({
        documentName: 'estimator',
        erdSettingModel,
        databaseSettingModel: DatabaseSettingModel.create('bigquery'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableView],
        structShareModels: args.structMember != null ? [structShare] : [],
        columnModels: args.structMember != null ? [...columnModels, wrapper] : columnModels,
        columnShareModels: shareModels
    });

    return { erdDocument, tableView };
};

const estimateOf = (built: BuiltDocument) => {
    return TableSizeEstimator.estimate(built.erdDocument, built.tableView);
};

describe('TableSizeEstimator.estimate', () => {
    test('height is the header plus 24px per column row', () => {
        const built = buildDocument({ columns: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }, { id: 'c', name: 'c' }] });

        expect(estimateOf(built).height).toBe(28 + (3 * 24));
    });

    test('a table without columns still counts one empty row', () => {
        const built = buildDocument({ columns: [] });

        expect(estimateOf(built).height).toBe(28 + 24);
    });

    test('DisplayColumnStyle.NONE hides every column row', () => {
        const built = buildDocument({
            columns: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }], displayColumnStyle: DisplayColumnStyle.NONE
        });

        expect(estimateOf(built).height).toBe(28 + 24);
    });

    test('a full-width column name counts as two half-width characters per character', () => {
        const halfWidth = buildDocument({ columns: [{ id: 'a', name: 'ab' }] });
        const fullWidth = buildDocument({ columns: [{ id: 'a', name: 'あい' }] });

        const widthDifference = estimateOf(fullWidth).width - estimateOf(halfWidth).width;

        // 全角 2 文字は半角 4 文字分なので、半角 2 文字分(14px)だけ広い。
        expect(widthDifference).toBe(14);
    });

    test('a long table name widens the table beyond its column rows', () => {
        const shortName = buildDocument({ tableName: 't', columns: [{ id: 'a', name: 'a' }] });
        const longName = buildDocument({ tableName: 'a_very_long_table_name_for_the_header'.repeat(2), columns: [{ id: 'a', name: 'a' }] });

        expect(estimateOf(longName).width).toBeGreaterThan(estimateOf(shortName).width);
    });

    test('a struct member row is indented by the nesting level on both name and type cells', () => {
        const member = { id: 'member', name: 'a_rather_long_member_column_name' };
        const topLevel = buildDocument({ columns: [member] });
        const nested = buildDocument({ columns: [], structMember: member });

        const widthDifference = estimateOf(nested).width - estimateOf(topLevel).width;

        expect(estimateOf(nested).height).toBe(28 + (2 * 24));
        expect(widthDifference).toBe(20);
    });

    test('a long name in one row and a long type in another row both widen the table', () => {
        const longName = 'a_rather_long_column_name_for_width';
        const shortRow = { id: 'a', name: 'a' };
        const longNameRow = { id: 'b', name: longName };
        const longTypeRow = { id: 'c', name: 'c', longType: true };

        const baseline = estimateOf(buildDocument({ columns: [shortRow] })).width;
        const nameContribution = estimateOf(buildDocument({ columns: [shortRow, longNameRow] })).width - baseline;
        const typeContribution = estimateOf(buildDocument({ columns: [shortRow, longTypeRow] })).width - baseline;
        const mixedWidth = estimateOf(buildDocument({ columns: [shortRow, longNameRow, longTypeRow] })).width;

        expect(nameContribution).toBeGreaterThan(0);
        expect(typeContribution).toBeGreaterThan(0);
        // 行ごとの最大値(旧方式)ではなく、列ごとの最大値の合計になる。
        expect(mixedWidth).toBe(baseline + nameContribution + typeContribution);
    });

    test('unique keys widen the table by the marker column', () => {
        const columns = [{ id: 'a', name: 'a' }];
        const none = buildDocument({ columns });
        const one = buildDocument({ columns, uniqueKeyCount: 1 });
        const two = buildDocument({ columns, uniqueKeyCount: 2 });

        // 右 padding 10 + 1 件あたり 20。
        expect(estimateOf(one).width - estimateOf(none).width).toBe(30);
        expect(estimateOf(two).width - estimateOf(one).width).toBe(20);
    });

    test('indexes widen the table and add to the unique key marker column', () => {
        const columns = [{ id: 'a', name: 'a' }];
        const none = buildDocument({ columns });
        const indexed = buildDocument({ columns, indexCount: 1 });
        const both = buildDocument({ columns, uniqueKeyCount: 1, indexCount: 1 });

        expect(estimateOf(indexed).width - estimateOf(none).width).toBe(30);
        expect(estimateOf(both).width - estimateOf(none).width).toBe(60);
    });
});
