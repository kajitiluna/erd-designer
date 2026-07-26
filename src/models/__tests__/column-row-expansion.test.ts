import { describe, test, expect } from 'vitest';

import { expandColumnRows } from '~/models/column-row-expansion';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import ColumnEntry from '~/models/database/ColumnEntry';
import ColumnGroupModel from '~/models/database/ColumnGroupModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import StructColumnModel from '~/models/database/StructColumnModel';
import StructColumnShareModel from '~/models/database/StructColumnShareModel';
import { findDatabaseColumns } from '~/models/database/columns';
import { DatabaseType } from '~/models/database/DatabaseType';
import TableModel from '~/models/database/TableModel';
import TableViewModel from '~/models/TableViewModel';

const TEST_COLORS = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 })
};

const findColumnType = (databaseType: DatabaseType, name: string) => {
    const columnType = findDatabaseColumns(databaseType).find(candidate => candidate.name === name);
    if (columnType == null) {
        throw new Error(`column type not found: ${name}`);
    }
    return columnType;
};

const initTableViewModel = (tableModel: TableModel): TableViewModel => {
    return new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });
};

type BuildDocumentArgs = {
    tableModel: TableModel,
    columnGroupModels?: ColumnGroupModel[],
    structColumnShareModels?: StructColumnShareModel[],
    columnModels?: ColumnModel[],
    columnShareModels?: ColumnShareModel[]
};

const buildDocument = (args: BuildDocumentArgs): ErdDocument => {
    return ErdDocument.create({
        documentName: 'column-row-expansion',
        erdSettingModel: ErdSettingModel.create('column-row-expansion'),
        databaseSettingModel: DatabaseSettingModel.create('bigquery'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [initTableViewModel(args.tableModel)],
        columnGroupModels: args.columnGroupModels ?? [],
        structShareModels: args.structColumnShareModels ?? [],
        columnModels: args.columnModels ?? [],
        columnShareModels: args.columnShareModels ?? []
    });
};

describe('expandColumnRows', () => {
    test('rowId equals the columnModelId itself for a top-level simple column (no struct nesting)', () => {
        const idShare = new ColumnShareModel({
            columnShareModelId: 'share-id', physicalName: 'id', logicalName: 'id',
            columnType: findColumnType('bigquery', 'int64')
        });
        const idColumn = new SimpleColumnModel({ columnModelId: 'col-id', columnShareModelId: 'share-id' });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-id' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel, columnModels: [idColumn], columnShareModels: [idShare]
        });

        const rows = expandColumnRows(erdDocument, erdDocument.toAllColumnsWithStruct(tableModel));

        expect(rows).toHaveLength(1);
        expect(rows[0].rowId).toBe('col-id');
        expect(rows[0].nestCount).toBe(0);
    });

    test('sibling top-level struct columns sharing the same struct definition get distinct rowIds for their members', () => {
        const streetShare = new ColumnShareModel({
            columnShareModelId: 'share-street', physicalName: 'street', logicalName: 'street',
            columnType: findColumnType('bigquery', 'string')
        });
        const streetColumn = new SimpleColumnModel({ columnModelId: 'col-street', columnShareModelId: 'share-street' });

        const addressStruct = new StructColumnShareModel({
            structShareModelId: 'struct-address', physicalName: 'address',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-street' }] as ColumnEntry[]
        });

        const homeAddress = new StructColumnModel({
            columnModelId: 'wrapper-home', structShareModelId: 'struct-address'
        });
        const workAddress = new StructColumnModel({
            columnModelId: 'wrapper-work', structShareModelId: 'struct-address'
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [
                { modelType: 'single', columnModelId: 'wrapper-home' },
                { modelType: 'single', columnModelId: 'wrapper-work' }
            ] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel,
            structColumnShareModels: [addressStruct],
            columnModels: [streetColumn, homeAddress, workAddress],
            columnShareModels: [streetShare]
        });

        const rows = expandColumnRows(erdDocument, erdDocument.toAllColumnsWithStruct(tableModel));

        // 2 wrapper rows + 2 member rows (1 per wrapper), all 4 must have distinct rowId
        expect(rows).toHaveLength(4);
        const rowIds = rows.map(row => row.rowId);
        expect(new Set(rowIds).size).toBe(4);

        const homeMemberRow = rows.find(row => (row.rowId === 'wrapper-home_col-street'));
        const workMemberRow = rows.find(row => (row.rowId === 'wrapper-work_col-street'));
        expect(homeMemberRow).toBeDefined();
        expect(workMemberRow).toBeDefined();
        expect(homeMemberRow?.columnModel.columnModelId).toBe('col-street');
        expect(workMemberRow?.columnModel.columnModelId).toBe('col-street');
    });

    test('a group entry inside a struct flattens every member with the struct wrapper as prefix', () => {
        const firstNameShare = new ColumnShareModel({
            columnShareModelId: 'share-first', physicalName: 'first_name', logicalName: 'first_name',
            columnType: findColumnType('bigquery', 'string')
        });
        const lastNameShare = new ColumnShareModel({
            columnShareModelId: 'share-last', physicalName: 'last_name', logicalName: 'last_name',
            columnType: findColumnType('bigquery', 'string')
        });
        const firstNameColumn = new SimpleColumnModel({ columnModelId: 'col-first', columnShareModelId: 'share-first' });
        const lastNameColumn = new SimpleColumnModel({ columnModelId: 'col-last', columnShareModelId: 'share-last' });

        const nameGroup = new ColumnGroupModel({
            columnGroupId: 'group-name', groupName: 'name_group',
            columnModelIds: ['col-first', 'col-last']
        });

        const profileStruct = new StructColumnShareModel({
            structShareModelId: 'struct-profile', physicalName: 'profile',
            columnEntries: [{ modelType: 'group', columnGroupId: 'group-name' }] as ColumnEntry[]
        });
        const profileWrapper = new StructColumnModel({
            columnModelId: 'wrapper-profile', structShareModelId: 'struct-profile'
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'users',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-profile' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel,
            columnGroupModels: [nameGroup],
            structColumnShareModels: [profileStruct],
            columnModels: [firstNameColumn, lastNameColumn, profileWrapper],
            columnShareModels: [firstNameShare, lastNameShare]
        });

        const rows = expandColumnRows(erdDocument, erdDocument.toAllColumnsWithStruct(tableModel));

        expect(rows.map(row => row.rowId)).toEqual([
            'wrapper-profile',
            'wrapper-profile_col-first',
            'wrapper-profile_col-last'
        ]);
        expect(rows[1].nestCount).toBe(1);
        expect(rows[2].nestCount).toBe(1);
    });

    test('a cyclic struct definition stops descending instead of recursing infinitely', () => {
        // struct A のメンバーがラッパー経由で struct A 自身を指す自己参照。
        // 通常の書き込み経路 (GUI/agent-tools) では弾かれるが、外部編集された JSON では起こりうる。
        const selfWrapper = new StructColumnModel({
            columnModelId: 'wrapper-self', structShareModelId: 'struct-a'
        });
        const structA = new StructColumnShareModel({
            structShareModelId: 'struct-a', physicalName: 'recursive_struct',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-self' }] as ColumnEntry[]
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'broken',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-self' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel,
            structColumnShareModels: [structA],
            columnModels: [selfWrapper]
        });

        const rows = expandColumnRows(erdDocument, erdDocument.toAllColumnsWithStruct(tableModel));

        // 循環を検出した時点で descend を止めるため、無限再帰にならず有限個の行で終わる
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0].rowId).toBe('wrapper-self');
        expect(rows[rows.length - 1].columnModel.columnModelId).toBe('wrapper-self');
    });

    test('a dangling struct reference (missing structShareModel) renders only the wrapper row', () => {
        const danglingWrapper = new StructColumnModel({
            columnModelId: 'wrapper-dangling', structShareModelId: 'struct-does-not-exist'
        });

        const tableModel = new TableModel({
            tableModelId: 'table-1', physicalName: 'broken',
            columnEntries: [{ modelType: 'single', columnModelId: 'wrapper-dangling' }] as ColumnEntry[]
        });

        const erdDocument = buildDocument({
            tableModel, columnModels: [danglingWrapper]
        });

        const rows = expandColumnRows(erdDocument, erdDocument.toAllColumnsWithStruct(tableModel));

        expect(rows).toHaveLength(1);
        expect(rows[0].rowId).toBe('wrapper-dangling');
    });
});
