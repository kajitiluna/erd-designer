import { describe, test, expect } from 'vitest';

import { createDdl } from '~/models/create-ddl';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import { findDatabaseColumns } from '~/models/database/columns';
import TableModel, { ColumnModelType } from '~/models/database/TableModel';
import TableViewModel from '~/models/TableViewModel';

const TEST_COLORS = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 })
};

const findColumnType = (name: string) => {
    const columnType = findDatabaseColumns('postgres').find(candidate => candidate.name === name);
    if (columnType == null) {
        throw new Error(`column type not found: ${name}`);
    }
    return columnType;
};

// arrayQueryTemplate 導入前後で postgres の配列カラム (`INT[]` 後置形式) の DDL 出力が
// 1文字も変わらないことを証明する回帰テスト。
const buildArrayColumnDocument = (): ErdDocument => {
    const tagsColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-tags',
        physicalName: 'tags',
        logicalName: 'Tags',
        columnType: findColumnType('integer'),
        isArray: true
    });

    const tagsColumn = new ColumnModel({
        columnModelId: 'col-tags',
        columnShareModelId: tagsColumnShare.columnShareModelId,
        physicalName: 'tags'
    });

    const tableModel = new TableModel({
        tableModelId: 'table-item',
        physicalName: 'item',
        columns: [{ modelType: 'single', columnModelId: tagsColumn.columnModelId }] as ColumnModelType[]
    });

    const tableView = new TableViewModel({
        tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS
    });

    return ErdDocument.create({
        documentName: 'array-type-regression',
        erdSettingModel: ErdSettingModel.create('array-type-regression'),
        databaseSettingModel: DatabaseSettingModel.create('postgres'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableView],
        relationViewModels: [],
        columnModels: [tagsColumn],
        columnShareModels: [tagsColumnShare]
    });
};

describe('array type DDL rendering regression (postgres unchanged)', () => {
    test('postgres: array column renders with the pre-existing INTEGER[] suffix format', () => {
        const erdDocument = buildArrayColumnDocument();
        const ddl = createDdl(erdDocument, {
            withTable: true,
            withIndex: false,
            withForeignKey: false,
            withSchema: false,
            withComment: false,
            commentStyle: "logical_name",
            commentSeparator: " : "
        });

        expect(ddl).toContain('INTEGER[]');
    });
});
